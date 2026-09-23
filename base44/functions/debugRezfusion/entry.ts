import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();
    const urlObj = new URL(url);
    const hubPropertyId = urlObj.searchParams.get('hub_property_id');
    
    const decoded = hubPropertyId ? atob(hubPropertyId) : null;
    const numericId = decoded?.split(':')[1];
    const slug = urlObj.pathname.split('/').filter(Boolean).pop();
    const base64Id = hubPropertyId; // The raw base64 is also used as `id` in LMPM responses
    
    console.log(`Slug: ${slug}, Decoded ID: ${decoded}, Numeric: ${numericId}, Base64: ${base64Id}`);

    const results = {};

    // The slug endpoint is broken — it returns wrong properties
    // Strategy: use /properties-by-name to get all, find by hub id
    // OR: use /properties/{wp_post_id} by finding the WP post ID for our hub id
    // Try fetching all pages of properties-by-name to find ours by hub id
    try {
      let found = null;
      let page = 1;
      while (!found && page <= 5) {
        const r = await fetch(`${urlObj.origin}/wp-json/lmpm/v1/properties-by-name?pageNumber=${page}&pageSize=25`, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        });
        const data = await r.json();
        const props = data.results || data;
        if (!Array.isArray(props) || props.length === 0) break;
        found = props.find(p => p.id === base64Id);
        console.log(`Page ${page}: ${props.length} props, found: ${!!found}`);
        page++;
      }
      results['found_by_hub_id'] = found ? {
        id: found.id,
        name: found.friendly_name || found.name,
        imageCount: found.images?.length,
        firstThreeImages: found.images?.slice(0, 3).map(i => i.path),
      } : 'not found';
    } catch (e) {
      results['properties_by_name_error'] = e.message;
    }

    return Response.json({ slug, decoded, numericId, base64Id, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});