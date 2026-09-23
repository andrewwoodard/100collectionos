import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

function applyImageOrder(images, orderedIds) {
  if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) return images;
  const orderMap = new Map();
  orderedIds.forEach((imgId, idx) => orderMap.set(Number(imgId), idx));
  return [...images].sort((a, b) => {
    const aIdx = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
    const bIdx = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.id - b.id;
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, id, data, property_url, property_id } = body;

    const supabase = getSupabase();

    if (action === 'list') {
      if (property_url) {
        const normalized = property_url.replace(/\/+$/, '').split('?')[0].split('#')[0];
        const normOf = (u) => (u ? String(u).replace(/\/+$/, '').split('?')[0].split('#')[0] : '');
        const [r1, r2, r3, r4] = await Promise.all([
          supabase.from('image_metadata').select('*').eq('property_url', normalized).order('id', { ascending: true }),
          supabase.from('image_metadata').select('*').eq('proppage', normalized).order('id', { ascending: true }),
          supabase.from('image_metadata').select('*').ilike('property_url', normalized + '%').order('id', { ascending: true }).limit(200),
          supabase.from('image_metadata').select('*').ilike('proppage', normalized + '%').order('id', { ascending: true }).limit(200),
        ]);
        for (const r of [r1, r2, r3, r4]) {
          if (r.error) return Response.json({ error: r.error.message }, { status: 500 });
        }
        const seen = new Set();
        const images = [];
        for (const row of [...(r1.data || []), ...(r2.data || []), ...(r3.data || []), ...(r4.data || [])]) {
          if (seen.has(row.id)) continue;
          // Guard against prefix-match leakage: only keep rows whose normalized
          // property_url or proppage actually equals the lookup (trailing slash /
          // query params stripped). Prevents e.g. "foo-lodge" matching "foo-lodge-2".
          const matches = normOf(row.property_url) === normalized || normOf(row.proppage) === normalized;
          if (matches) { seen.add(row.id); images.push(row); }
        }

        const orderRecords = await base44.asServiceRole.entities.PropertyImageOrder.filter({ property_url: normalized });
        const orderedIds = orderRecords && orderRecords.length > 0 ? orderRecords[0].ordered_image_ids : null;
        const sorted = applyImageOrder(images, orderedIds);
        return Response.json({ images: sorted, ordered_image_ids: orderedIds || [] });
      }
      let q = supabase.from('image_metadata').select('*').order('id', { ascending: true }).limit(10000);
      if (property_id) q = q.eq('property_id', property_id);
      const { data: rows, error } = await q;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ images: rows });
    }

    if (action === 'create') {
      // image_metadata.id is a NOT NULL integer without a default — generate next id.
      const { data: maxRow } = await supabase.from('image_metadata').select('id').order('id', { ascending: false }).limit(1);
      const nextId = (maxRow && maxRow.length > 0 ? Number(maxRow[0].id) : 0) + 1;
      const { data: row, error } = await supabase.from('image_metadata').insert([{ ...data, id: nextId }]).select('*').single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ image: row });
    }

    if (action === 'update') {
      const { data: row, error } = await supabase.from('image_metadata').update(data).eq('id', id).select('*').single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ image: row });
    }

    if (action === 'delete') {
      const { error } = await supabase.from('image_metadata').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true });
    }

    if (action === 'reorder') {
      const { property_url: purl, ordered_image_ids } = data;
      if (!purl) return Response.json({ error: 'property_url required' }, { status: 400 });
      if (!Array.isArray(ordered_image_ids)) return Response.json({ error: 'ordered_image_ids array required' }, { status: 400 });

      const normalized = purl.replace(/\/+$/, '').split('?')[0];
      const existing = await base44.asServiceRole.entities.PropertyImageOrder.filter({ property_url: normalized });
      if (existing && existing.length > 0) {
        const updated = await base44.asServiceRole.entities.PropertyImageOrder.update(existing[0].id, { ordered_image_ids });
        return Response.json({ success: true, order: updated });
      } else {
        const created = await base44.asServiceRole.entities.PropertyImageOrder.create({ property_url: normalized, ordered_image_ids });
        return Response.json({ success: true, order: created });
      }
    }

    if (action === 'schema') {
      const { data: rows, error } = await supabase.from('image_metadata').select('*').limit(3);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ sample: rows, columns: rows.length > 0 ? Object.keys(rows[0]) : [] });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});