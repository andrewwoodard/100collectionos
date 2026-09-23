import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

function parseImages(raw) {
  if (!raw) return [];
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      arr = parsed;
    } catch { return []; }
  }
  return arr.filter(u => u && typeof u === 'string');
}

function hostOf(url) {
  if (!url) return null;
  const m = url.match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;

    const supabase = getSupabase();

    // Load ALL records (paginate past the default 1000-row cap).
    const allRows = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('propertiesbase44')
        .select('id, vrm_url, url, name, property_image, images')
        .range(from, from + 999);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      allRows.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }

    const records = allRows.map(r => ({
      id: r.id,
      key: r.vrm_url || r.url || r.id, // property identity
      name: r.name,
      property_image: r.property_image,
      images: parseImages(r.images),
    }));

    // Build map: image_url -> set of property keys (vrm_url) that contain it.
    const imageToKeys = {};
    for (const r of records) {
      for (const img of r.images) {
        if (!imageToKeys[img]) imageToKeys[img] = new Set();
        imageToKeys[img].add(r.key);
      }
    }

    // An image is "cross-property" if it appears under >1 distinct property key.
    const crossPropertyImages = new Set();
    for (const [img, keys] of Object.entries(imageToKeys)) {
      if (keys.size > 1) crossPropertyImages.add(img);
    }

    // For each cross-property image, pick the OWNER property key that keeps it.
    // Heuristic: prefer the property whose record has a null property_image
    // (images are its only source); tiebreak by earliest record id.
    // Build: image -> owner record id.
    const imageToOwner = {};
    {
      // index records by key for owner lookup
      const byKey = {};
      for (const r of records) {
        if (!byKey[r.key]) byKey[r.key] = [];
        byKey[r.key].push(r);
      }
      for (const img of crossPropertyImages) {
        const keys = [...imageToKeys[img]];
        // candidate records holding this image
        const candidates = [];
        for (const k of keys) {
          for (const r of (byKey[k] || [])) {
            if (r.images.includes(img)) candidates.push(r);
          }
        }
        // prefer null property_image
        const nullPm = candidates.filter(r => !r.property_image);
        const pool = nullPm.length > 0 ? nullPm : candidates;
        // earliest id (string ids — compare by string; numeric ids by number)
        pool.sort((a, b) => {
          const ai = /^\d+$/.test(a.id) ? Number(a.id) : a.id;
          const bi = /^\d+$/.test(b.id) ? Number(b.id) : b.id;
          return ai < bi ? -1 : ai > bi ? 1 : 0;
        });
        imageToOwner[img] = pool[0].key;
      }
    }

    // Build per-record cleanup plan: which images to remove.
    const toUpdate = []; // { id, name, key, removing: [urls], keeping: [urls] }
    for (const r of records) {
      if (r.images.length === 0) continue;
      const removing = [];
      const keeping = [];
      for (const img of r.images) {
        const isCross = crossPropertyImages.has(img);
        const isNull = /\/null\b/i.test(img);
        if (isNull) {
          removing.push(img); // garbage
        } else if (isCross && imageToOwner[img] !== r.key) {
          removing.push(img); // belongs to another property
        } else {
          keeping.push(img);
        }
      }
      if (removing.length > 0) {
        toUpdate.push({ id: r.id, name: r.name, key: r.key, removing: removing.length, keeping: keeping.length, hadNull: removing.some(i => /\/null\b/i.test(i)) });
      }
    }

    if (dryRun) {
      return Response.json({
        dry_run: true,
        total_records: records.length,
        records_with_images: records.filter(r => r.images.length > 0).length,
        cross_property_images: crossPropertyImages.size,
        records_to_update: toUpdate.length,
        sample: toUpdate.slice(0, 25),
        // Show which owner keeps the most-removed image set
        top_cross: Object.entries(imageToKeys)
          .filter(([, ks]) => ks.size > 1)
          .sort((a, b) => b[1].size - a[1].size)
          .slice(0, 5)
          .map(([img, ks]) => ({ image: img.slice(-50), property_keys: ks.size, owner: imageToOwner[img] })),
      });
    }

    // Execute: for each record, rewrite images to only the kept ones.
    // Records with a null id are updated by vrm_url (or url) instead.
    let updated = 0;
    const errors = [];
    for (const r of records) {
      if (r.images.length === 0) continue;
      const keeping = r.images.filter(img => {
        const isNull = /\/null\b/i.test(img);
        if (isNull) return false;
        const isCross = crossPropertyImages.has(img);
        if (isCross && imageToOwner[img] !== r.key) return false;
        return true;
      });
      if (keeping.length === r.images.length) continue;
      const newVal = keeping.length > 0 ? JSON.stringify(keeping) : null;
      let result;
      if (r.id != null) {
        result = await supabase.from('propertiesbase44').update({ images: newVal }).eq('id', r.id);
      } else if (r.key) {
        // null-id record — match on vrm_url first, then url
        result = await supabase.from('propertiesbase44').update({ images: newVal }).eq('vrm_url', r.key);
        if (!result.error && (result.data || []).length === 0) {
          result = await supabase.from('propertiesbase44').update({ images: newVal }).eq('url', r.key);
        }
      }
      if (result?.error) errors.push({ id: r.id, key: r.key, error: result.error.message });
      else updated++;
    }

    return Response.json({
      dry_run: false,
      total_records: records.length,
      cross_property_images: crossPropertyImages.size,
      records_updated: updated,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});