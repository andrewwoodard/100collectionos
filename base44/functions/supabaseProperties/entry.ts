import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { getSupabase, parseImages } from '../../shared/propertyImages.ts';

// Map from app field names to Supabase column names (only confirmed columns)
function toSupabase(data) {
  const mapped = {};
  if (data.property_name !== undefined) mapped.name = data.property_name;
  if (data.market !== undefined) mapped.destination = data.market;
  if (data.listing_url !== undefined) {
    mapped.url = data.listing_url;
    mapped.vrm_url = data.listing_url; // vrm_url has NOT NULL constraint
  }
  if (data.bedrooms !== undefined) mapped.bedrooms = data.bedrooms;
  if (data.bathrooms !== undefined) mapped.bathrooms = data.bathrooms;
  if (data.status !== undefined) {
    mapped.status = data.status;
    mapped.active = data.status === 'active';
  }
  if (data.excerpt !== undefined) mapped.excerpt = data.excerpt;
  if (data.why_onehundred !== undefined) mapped.why_onehundred = data.why_onehundred;
  if (data.unique_feature !== undefined) mapped.unique_feature = data.unique_feature;
  if (data.text !== undefined) mapped.text = data.text;
  if (data.onehundred_url !== undefined) mapped.url = data.onehundred_url;
  if (data.address !== undefined) mapped.address = data.address;
  if (data.latitude !== undefined) mapped.latitude = data.latitude;
  if (data.longitude !== undefined) mapped.longitude = data.longitude;
  if (data.vrm_url !== undefined) mapped.vrm_url = data.vrm_url;
  if (data.internal_notes !== undefined) mapped.propdescription = data.internal_notes;
  if (data.partner_name !== undefined) mapped.partner_name = data.partner_name;
  if (data.partner_id !== undefined) mapped.partner_id = data.partner_id;
  if (data.portal_visible !== undefined) mapped.portal_visible = data.portal_visible;
  if (data.onboarding_status !== undefined) mapped.onboarding_status = data.onboarding_status;
  if (data.photography_status !== undefined) mapped.photography_status = data.photography_status;
  if (data.launch_date !== undefined) mapped.launch_date = data.launch_date;
  if (data.sleeps !== undefined) mapped.occupancy = data.sleeps;
  if (data.property_type !== undefined) mapped.house_type = data.property_type;
  if (data.images !== undefined) mapped.images = JSON.stringify(data.images);
  return mapped;
}

// Map from Supabase columns back to app field names
function fromSupabase(row) {
  if (!row) return null;
  return {
    id: row.row_id ?? row.id,
    created_date: row.created_at,
    property_name: row.name,
    market: row.destination,
    listing_url: row.url,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    sleeps: row.sleeps ?? row.occupancy,
    property_type: row.house_type,
    partner_name: row.partner_name,
    internal_notes: row.propdescription,
    address: row.address,
    status: row.active === true ? 'active' : (row.status === 'active' ? 'inactive' : (row.status || 'inactive')),
    onboarding_status: row.onboarding_status || 'not_started',
    photography_status: row.photography_status || 'not_started',
    launch_date: row.launch_date,
    portal_visible: row.portal_visible || false,
    partner_id: row.partner_id,
    latitude: row.latitude,
    longitude: row.longitude,
    pet_friendly: row.pet_friendly,
    unique_feature: row.unique_feature,
    why_onehundred: row.why_onehundred,
    excerpt: row.excerpt,
    text: row.text,
    property_image: row.property_image,
    images: parseImages(row.images),
    vrm_url: row.vrm_url,
    last_scan: row.last_scan,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, id, data, filters, search, limit: lim = 500, url } = body;

    const supabase = getSupabase();

    // LIST
    if (action === 'list') {
      // `lite` omits heavy columns (images, text, property_image, excerpts)
      // so list views get a small payload — full propertiesbase44 with images
      // can exceed the response size limit and fail in the browser.
      const lite = body.lite === true;
      const LITE_COLUMNS = 'row_id,id,created_at,name,destination,url,bedrooms,bathrooms,occupancy,house_type,partner_name,partner_id,address,status,active,onboarding_status,photography_status,launch_date,portal_visible,vrm_url';
      const buildQuery = () => {
        let q = supabase.from('propertiesbase44').select(lite ? LITE_COLUMNS : '*').order('created_at', { ascending: false });
        if (filters?.partner_id) q = q.eq('partner_id', filters.partner_id);
        if (filters?.partner_name) q = q.eq('partner_name', filters.partner_name);
        if (filters?.status) q = q.eq('status', filters.status);
        if (filters?.active !== undefined) q = q.eq('active', filters.active);
        if (filters?.onboarding_status) q = q.eq('onboarding_status', filters.onboarding_status);
        if (filters?.photography_status) q = q.eq('photography_status', filters.photography_status);
        if (filters?.property_type) q = q.eq('house_type', filters.property_type);
        if (search) {
          q = q.or(`name.ilike.%${search}%,destination.ilike.%${search}%,partner_name.ilike.%${search}%,address.ilike.%${search}%`);
        }
        return q;
      };

      // Paginate: Supabase JS client caps at 1000 rows per request.
      // Walk pages until all matching rows are collected (up to lim).
      const pageSize = Math.min(lim, 1000);
      let rows = [];
      let offset = 0;
      while (offset < lim) {
        const { data: page, error } = await buildQuery().range(offset, offset + pageSize - 1);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        rows = rows.concat(page);
        if (page.length < pageSize) break; // last page
        offset += pageSize;
        if (offset > 10000) break; // hard safety
      }

      // Enrich unassigned properties: if a property has no partner_name,
      // check if its destination has exactly one partner — if so, auto-assign it.
      const unassigned = rows.filter(r => !r.partner_name && r.destination);
      if (unassigned.length > 0) {
        const partners = await base44.asServiceRole.entities.Partner.list('-created_date', 1000);
        const destMap = {};
        for (const p of partners) {
          if (!p.market) continue;
          const key = p.market.trim().toLowerCase();
          if (!destMap[key]) destMap[key] = [];
          destMap[key].push(p.partner_name);
        }
        for (const row of unassigned) {
          const key = row.destination.trim().toLowerCase();
          const matches = destMap[key];
          if (matches && matches.length === 1) {
            row.partner_name = matches[0];
          }
        }
      }

      return Response.json({ properties: rows.map(fromSupabase) });
    }

    // GET single (propertiesbase44 uses row_id as the primary key)
    if (action === 'get') {
      const { data: row, error } = await supabase.from('propertiesbase44').select('*').eq('row_id', id).single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const property = fromSupabase(row);

      // If this record has no images, look for a sibling with the same vrm_url
      // that does (duplicate records can exist from different sync sources).
      if (property.images.length === 0 && row.vrm_url) {
        const { data: siblings } = await supabase
          .from('propertiesbase44')
          .select('row_id, images')
          .eq('vrm_url', row.vrm_url);
        for (const s of siblings || []) {
          if (String(s.row_id) === String(id)) continue;
          const sImages = parseImages(s.images);
          if (sImages.length > 0) {
            property.images = sImages;
            break;
          }
        }
      }

      return Response.json({ property });
    }

    // GET by URL (listing_url / vrm_url) — used when supabase_property_id is not linked.
    // Matches with the same normalization as imageMetadata: strip query params + trailing
    // slashes, then try exact, then ilike prefix on both vrm_url and url columns.
    // Uses limit(1) instead of maybeSingle() to handle duplicate records gracefully.
    if (action === 'get_by_url') {
      const lookupUrl = url || data?.url || id;
      if (!lookupUrl) return Response.json({ error: 'url required' }, { status: 400 });

      const normalized = lookupUrl.replace(/\/+$/, '').split('?')[0].split('#')[0];
      const pickBest = (rows) => {
        if (!rows || rows.length === 0) return null;
        // Prefer the record that actually has images
        const withImages = rows.find(r => parseImages(r.images).length > 0);
        return withImages || rows[0];
      };

      // 1. Exact match on vrm_url, then url
      let { data: rows, error } = await supabase.from('propertiesbase44').select('*').eq('vrm_url', lookupUrl).limit(5);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      let row = pickBest(rows);

      if (!row) {
        const r2 = await supabase.from('propertiesbase44').select('*').eq('url', lookupUrl).limit(5);
        if (r2.error) return Response.json({ error: r2.error.message }, { status: 500 });
        row = pickBest(r2.data);
      }

      // 2. Normalized exact match (query params / trailing slash stripped)
      if (!row && normalized !== lookupUrl) {
        const r3 = await supabase.from('propertiesbase44').select('*').eq('vrm_url', normalized).limit(5);
        if (r3.error) return Response.json({ error: r3.error.message }, { status: 500 });
        row = pickBest(r3.data);
        if (!row) {
          const r4 = await supabase.from('propertiesbase44').select('*').eq('url', normalized).limit(5);
          if (r4.error) return Response.json({ error: r4.error.message }, { status: 500 });
          row = pickBest(r4.data);
        }
      }

      // 3. Prefix match (handles cases where DB url has query params not in lookup,
      //    or vice versa) — but filter to rows whose normalized url actually equals
      //    the lookup, to avoid cross-property leakage (e.g. "foo-lodge" matching
      //    "foo-lodge-2").
      const normOf = (u) => (u ? String(u).replace(/\/+$/, '').split('?')[0].split('#')[0] : '');
      if (!row) {
        const r5 = await supabase.from('propertiesbase44').select('*').ilike('vrm_url', normalized + '%').limit(20);
        if (r5.error) return Response.json({ error: r5.error.message }, { status: 500 });
        const exact5 = (r5.data || []).filter(r => normOf(r.vrm_url) === normalized || normOf(r.url) === normalized);
        row = pickBest(exact5);
        if (!row) {
          const r6 = await supabase.from('propertiesbase44').select('*').ilike('url', normalized + '%').limit(20);
          if (r6.error) return Response.json({ error: r6.error.message }, { status: 500 });
          const exact6 = (r6.data || []).filter(r => normOf(r.vrm_url) === normalized || normOf(r.url) === normalized);
          row = pickBest(exact6);
        }
      }

      return Response.json({ property: row ? fromSupabase(row) : null });
    }

    // CREATE
    if (action === 'create') {
      const mapped = toSupabase(data);
      // propertiesbase44.row_id is a NOT NULL bigint with no default — use epoch ms.
      // Guard against same-millisecond collisions by adding a random suffix.
      if (!mapped.row_id) {
        mapped.row_id = Date.now() + Math.floor(Math.random() * 1000);
      }
      // Some Supabase tables have no created_at default — set it explicitly.
      if (!mapped.created_at) {
        mapped.created_at = new Date().toISOString();
      }
      console.log('[supabaseProperties.create] payload:', JSON.stringify(mapped));
      const { data: row, error } = await supabase.from('propertiesbase44').insert([mapped]).select('*').single();
      if (error) {
        console.error('[supabaseProperties.create] INSERT FAILED:', error.message, '| details:', error.details, '| hint:', error.hint, '| code:', error.code);
        // Return 200 (not 500) so the frontend surfaces the real error message
        // instead of a generic "Request failed with status code 500".
        return Response.json({ error: `Database insert failed: ${error.message}${error.hint ? ' — ' + error.hint : ''}` });
      }
      return Response.json({ property: fromSupabase(row) });
    }

    // UPDATE (by row_id, or by url as fallback)
    if (action === 'update') {
      const mapped = toSupabase(data);
      if (id) {
        const { data: row, error } = await supabase.from('propertiesbase44').update(mapped).eq('row_id', id).select('*').single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ property: fromSupabase(row) });
      }
      if (url) {
        const normalized = url.replace(/\/+$/, '').split('?')[0].split('#')[0];
        // Try vrm_url exact, then url exact, then normalized
        const attempts = [
          () => supabase.from('propertiesbase44').update(mapped).eq('vrm_url', url).select('*'),
          () => supabase.from('propertiesbase44').update(mapped).eq('url', url).select('*'),
          () => supabase.from('propertiesbase44').update(mapped).eq('vrm_url', normalized).select('*'),
          () => supabase.from('propertiesbase44').update(mapped).eq('url', normalized).select('*'),
        ];
        for (const attempt of attempts) {
          const { data: rows, error } = await attempt().limit(1);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (rows && rows.length > 0) {
            return Response.json({ property: fromSupabase(rows[0]) });
          }
        }
        return Response.json({ error: 'Property not found by url' }, { status: 404 });
      }
      return Response.json({ error: 'id or url required' }, { status: 400 });
    }

    // DELETE (by row_id)
    if (action === 'delete') {
      const { error } = await supabase.from('propertiesbase44').delete().eq('row_id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true });
    }

    // STATS
    if (action === 'stats') {
      const { data: rows, error } = await supabase
        .from('propertiesbase44')
        .select('created_at, active');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ properties: rows });
    }

    // BACKFILL: set status=active, active=true for all partner-submitted properties
    if (action === 'backfill_active_status') {
      // Get all active PropertySubmissions with a supabase_property_id
      const submissions = await base44.asServiceRole.entities.PropertySubmission.filter({ status: 'active' });
      const results = [];
      for (const sub of submissions) {
        const sbId = sub.supabase_property_id;
        if (!sbId || sbId === 'null' || sbId === 'undefined') {
          results.push({ name: sub.property_name, skipped: true });
          continue;
        }
        const { error } = await supabase.from('propertiesbase44').update({ status: 'active', active: true }).eq('id', sbId);
        results.push({ name: sub.property_name, supabase_id: sbId, success: !error, error: error?.message });
      }
      return Response.json({ total: submissions.length, results });
    }

    // LIST BY URLS — given a set of listing/vrm URLs, return the matching
    // propertiesbase44 rows (lite). Used by Partner Detail to overlay Supabase
    // source-of-truth attributes (status, beds, baths, …) onto Base44 Property
    // records. Matches both the vrm_url and url columns, and includes
    // trailing-slash-stripped variants so minor normalization differences still hit.
    if (action === 'list_by_urls') {
      const rawUrls = Array.isArray(body.urls) ? body.urls : [];
      const normOf = (u) => u ? String(u).replace(/\/+$/, '').split('?')[0].split('#')[0] : '';
      const urlSet = new Set();
      for (const u of rawUrls) {
        const s = String(u || '').trim();
        if (!s) continue;
        urlSet.add(s);
        const n = normOf(s);
        if (n && n !== s) urlSet.add(n);
      }
      const urls = [...urlSet];
      if (urls.length === 0) return Response.json({ properties: [] });
      const LITE_COLUMNS = 'row_id,id,created_at,name,destination,url,bedrooms,bathrooms,occupancy,house_type,partner_name,partner_id,address,status,active,onboarding_status,photography_status,launch_date,portal_visible,vrm_url';
      const [{ data: byVrm, error: e1 }, { data: byUrlRows, error: e2 }] = await Promise.all([
        supabase.from('propertiesbase44').select(LITE_COLUMNS).in('vrm_url', urls),
        supabase.from('propertiesbase44').select(LITE_COLUMNS).in('url', urls),
      ]);
      if (e1) return Response.json({ error: e1.message }, { status: 500 });
      if (e2) return Response.json({ error: e2.message }, { status: 500 });
      const seen = new Set();
      const rows = [];
      for (const r of [...(byVrm || []), ...(byUrlRows || [])]) {
        const key = r.row_id ?? r.id;
        if (!seen.has(key)) { seen.add(key); rows.push(r); }
      }
      return Response.json({ properties: rows.map(fromSupabase) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});