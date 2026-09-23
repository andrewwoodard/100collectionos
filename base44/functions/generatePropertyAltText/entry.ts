import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const propertyId = body?.property_id;
    if (!propertyId) return Response.json({ error: 'property_id is required' }, { status: 400 });

    const property = await base44.asServiceRole.entities.Property.get(propertyId);
    if (!property) return Response.json({ error: 'Property not found' }, { status: 404 });

    const photoUrls: string[] = Array.isArray(property.photo_urls) ? property.photo_urls : [];
    if (photoUrls.length === 0) {
      return Response.json({ error: 'No photos to process', photo_alt_texts: [] });
    }

    const altTexts: (string | null)[] = new Array(photoUrls.length).fill(null);
    const batchSize = 5;

    for (let i = 0; i < photoUrls.length; i += batchSize) {
      const batch = photoUrls.slice(i, i + batchSize);
      const batchIndices = batch.map((_, j) => i + j);

      const results = await Promise.all(
        batch.map(async (url) => {
          try {
            const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt: "Describe this property photo concisely for accessibility alt text. Focus on what is visible: the room or outdoor space, key features, lighting, and atmosphere. Keep it under 125 characters. Do not start with 'Image of' or 'Photo of'. Return only the description.",
              file_urls: [url],
              response_json_schema: {
                type: "object",
                properties: {
                  alt_text: { type: "string" }
                },
                required: ["alt_text"]
              }
            });
            return res?.alt_text || null;
          } catch (e) {
            return null;
          }
        })
      );

      results.forEach((alt, j) => {
        altTexts[batchIndices[j]] = alt;
      });
    }

    await base44.asServiceRole.entities.Property.update(propertyId, {
      photo_alt_texts: altTexts
    });

    return Response.json({
      success: true,
      property_id: propertyId,
      photo_alt_texts: altTexts,
      generated_count: altTexts.filter(Boolean).length,
      total: photoUrls.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}