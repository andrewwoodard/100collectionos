import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = await pageRes.text();

    // Look for iframe src URLs
    const iframes = (html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || []).slice(0, 10);
    
    // Look for any external JS app URLs
    const appUrls = (html.match(/https?:\/\/(?:app\.|hub\.|booking\.|property\.|listing\.)[^\s"'<>]{0,200}/gi) || []).slice(0, 10);
    
    // Look for data- attributes with URLs
    const dataAttrs = (html.match(/data-[a-z-]+="https?:\/\/[^"]{0,150}"/gi) || []).slice(0, 20);
    
    // Look for any JS variable assignments with URLs pointing to non-wordpress domains
    const jsUrls = (html.match(/(?:src|href|url|endpoint|api)\s*[=:]\s*["'](https?:\/\/(?!www\.streamline)[^"']{10,150})["']/gi) || []).slice(0, 20);
    
    // Find all data-src images and cloudfront images
    const dataSrcImages = (html.match(/data-src=["']https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*["']/gi) || []).slice(0, 30);
    const cloudFrontImages = (html.match(/https?:\/\/dh[a-z0-9]+\.cloudfront\.net\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi) || []).slice(0, 30);
    const htmlLength = html.length;

    return Response.json({
      iframes,
      app_urls: appUrls,
      data_attrs: dataAttrs,
      js_external_urls: jsUrls,
      data_src_images: dataSrcImages,
      cloudfront_images: cloudFrontImages,
      html_length: htmlLength,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});