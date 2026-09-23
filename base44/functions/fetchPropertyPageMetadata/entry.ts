import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Best-effort scrape of og:image and og:title from a property page URL.
// Used by the /admin/apply-media panel to auto-populate curator-picked
// featured property cards. Admin-only. Failures (CORS won't apply server-side,
// but timeouts / 403s / down pages) return a 502 with a clear message so the
// admin UI can fall back to a manual upload.

function readMetaTag(html, property) {
  // Matches <meta property="og:image" content="..."> and the reversed
  // attribute order <meta content="..." property="og:image">.
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*?content=["']([^"']*)["']`,
    'i'
  );
  const m1 = html.match(re1);
  if (m1) return decodeHtmlEntities(m1[1]);
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${property}["']`,
    'i'
  );
  const m2 = html.match(re2);
  if (m2) return decodeHtmlEntities(m2[1]);
  return null;
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }
    const url = String((body && body.url) || '').trim();
    if (!url) return Response.json({ error: 'url is required' }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) {
      return Response.json({ error: 'url must start with http:// or https://' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'The100CollectionBot/1.0 (+https://theonehundredcollection.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      return Response.json(
        { error: `Fetch failed (HTTP ${res.status})`, url },
        { status: 502 }
      );
    }
    const html = await res.text();

    const ogImage = readMetaTag(html, 'og:image');
    const ogTitle = readMetaTag(html, 'og:title');

    return Response.json({ url, ogImage, ogTitle });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}