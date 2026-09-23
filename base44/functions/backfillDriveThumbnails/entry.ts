import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const assets = await base44.asServiceRole.entities.MediaAsset.list();
    const toFix = assets.filter(a => a.drive_file_id);

    console.log(`Found ${toFix.length} MediaAssets with drive_file_id to backfill`);

    let updated = 0;
    for (const asset of toFix) {
      const newThumb = `https://drive.google.com/thumbnail?id=${asset.drive_file_id}&sz=w400-h400`;
      await base44.asServiceRole.entities.MediaAsset.update(asset.id, { thumbnail_url: newThumb });
      updated++;
    }

    console.log(`Updated ${updated} MediaAssets`);
    return Response.json({ success: true, updated });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});