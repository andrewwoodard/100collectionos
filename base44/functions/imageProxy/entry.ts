import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Fetches an external image server-side (bypassing CORS/hotlink protection)
// and returns it as a base64 data URL for the frontend to re-upload to base44 storage.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();
    if (!url) return Response.json({ error: 'URL required' }, { status: 400 });

    // SSRF guard: enforce http/https and block private/loopback/link-local hosts,
    // including hostnames that resolve to private IP ranges (DNS rebinding).
    let parsed;
    try { parsed = new URL(url); } catch { return Response.json({ error: 'Invalid URL' }, { status: 400 }); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return Response.json({ error: 'Only http/https URLs are allowed' }, { status: 400 });
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isPrivateIpv4 = (ip) => {
      const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (!m) return false;
      const a = parseInt(m[1]), b = parseInt(m[2]);
      return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
        a === 127 || (a === 169 && b === 254) || a === 0 || a >= 224;
    };
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.endsWith('.localhost') ||
        isPrivateIpv4(hostname) || hostname === '::1' || hostname.startsWith('fe80:') ||
        hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return Response.json({ error: 'Blocked host' }, { status: 400 });
    }
    try {
      const addrs = await Deno.resolveDns(hostname, 'A');
      if (addrs.some(isPrivateIpv4)) return Response.json({ error: 'Blocked host' }, { status: 400 });
    } catch { /* not resolvable / not a domain — literal IP already checked */ }

    const referer = parsed.origin + '/';

    const imgRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        ...(referer ? { 'Referer': referer } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!imgRes.ok) {
      return Response.json({ error: `Image fetch failed: ${imgRes.status}` }, { status: 502 });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Convert to base64
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    return Response.json({
      data_url: `data:${contentType};base64,${base64}`,
      content_type: contentType,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});