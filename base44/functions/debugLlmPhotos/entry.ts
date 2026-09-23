import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Visit this vacation rental property listing page and extract ALL property photo URLs: ${url}

The gallery may be JavaScript-rendered. Find the images by:
1. Checking og:image and twitter:image meta tags
2. Looking for JSON data in <script> tags (window.__STATE__, __INITIAL_STATE__, JSON-LD, etc.)
3. Checking for API responses or image arrays embedded in the HTML
4. Looking for CDN image patterns: gallery.streamlinevrs.com, rezfusion.com, cloudinary.com, imgix.net, amazonaws.com, cloudfront.net
5. Checking the page's actual rendered content for a photo gallery

Return ONLY property interior and exterior photos. Do NOT include logos, badges, awards, staff photos, icons.
There should be 10-40+ photos for a typical vacation rental. Be thorough and return all you can find.`,
      add_context_from_internet: true,
      model: "gemini_3_1_pro",
      response_json_schema: {
        type: "object",
        properties: {
          photo_urls: { type: "array", items: { type: "string" } },
          reasoning: { type: "string" }
        }
      }
    });

    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});