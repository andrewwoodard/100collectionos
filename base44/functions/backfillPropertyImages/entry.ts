import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import {
  getSupabase,
  parseImages,
  imageUrlFromMetadata,
  normForDedup,
  fetchMetadataImages,
} from '../../shared/propertyImages.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { dry_run = false } = body;

    const supabase = getSupabase();

    // 1. Fetch all properties (paginated — Supabase caps at 1000 per request).
    let allRows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error } = await supabase
        .from('propertiesbase44')
        .select('id, name, vrm_url, url, images')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      allRows = allRows.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
      if (offset > 10000) break;
    }

    const results = [];
    let updatedCount = 0;
    let alreadySyncedCount = 0;
    let noUrlCount = 0;
    let noMetadataCount = 0;

    // 2. For each property, fetch image_metadata and merge new URLs into images.
    for (const row of allRows) {
      const propertyUrl = row.vrm_url || row.url;
      const propertyName = row.name || row.id;

      if (!propertyUrl) {
        noUrlCount++;
        results.push({ id: row.id, name: propertyName, status: 'no_url' });
        continue;
      }

      let metadataImages;
      try {
        metadataImages = await fetchMetadataImages(supabase, propertyUrl);
      } catch (err) {
        results.push({ id: row.id, name: propertyName, status: 'error', error: err.message });
        continue;
      }

      if (metadataImages.length === 0) {
        noMetadataCount++;
        results.push({ id: row.id, name: propertyName, status: 'no_metadata' });
        continue;
      }

      const metadataUrls = metadataImages
        .map(imageUrlFromMetadata)
        .filter(Boolean);

      if (metadataUrls.length === 0) {
        noMetadataCount++;
        results.push({ id: row.id, name: propertyName, status: 'no_metadata_urls' });
        continue;
      }

      const existingUrls = parseImages(row.images);
      const existingSet = new Set(existingUrls.map(normForDedup));
      const newUrls = metadataUrls.filter(u => !existingSet.has(normForDedup(u)));

      if (newUrls.length === 0) {
        alreadySyncedCount++;
        results.push({ id: row.id, name: propertyName, status: 'already_synced', image_count: existingUrls.length });
        continue;
      }

      // Merge: existing first, then new, deduplicating by normalized URL.
      const mergedSet = new Set();
      const merged = [];
      for (const u of [...existingUrls, ...newUrls]) {
        const n = normForDedup(u);
        if (!mergedSet.has(n)) { mergedSet.add(n); merged.push(u); }
      }

      if (dry_run) {
        results.push({ id: row.id, name: propertyName, status: 'would_update', new_images: newUrls.length, total_images: merged.length });
        continue;
      }

      const { error: updateError } = await supabase
        .from('propertiesbase44')
        .update({ images: JSON.stringify(merged) })
        .eq('id', row.id);

      if (updateError) {
        results.push({ id: row.id, name: propertyName, status: 'error', error: updateError.message });
      } else {
        updatedCount++;
        results.push({ id: row.id, name: propertyName, status: 'updated', new_images: newUrls.length, total_images: merged.length });
      }
    }

    return Response.json({
      total: allRows.length,
      updated: updatedCount,
      already_synced: alreadySyncedCount,
      no_url: noUrlCount,
      no_metadata: noMetadataCount,
      dry_run,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});