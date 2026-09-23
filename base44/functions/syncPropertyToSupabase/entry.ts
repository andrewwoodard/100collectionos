// v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
}

const SUPABASE_STORAGE_BASE = Deno.env.get('SUPABASE_URL') + '/storage/v1/object/public/images/';

// Map PropertySubmission fields → Supabase properties columns
function toSupabase(data) {
  const url = data.listing_url || data.vrm_url || "https://the100collection.com";

  const mapped = {
    name: data.property_name || "Unnamed Property",
    destination: data.market || data.location_city || data.location_full || "",
    url: url,
    vrm_url: url, // NOT NULL constraint
    bedrooms: data.bedrooms ? Number(data.bedrooms) : null,
    bathrooms: data.bathrooms ? String(data.bathrooms) : null,
    occupancy: data.sleeps ? Number(data.sleeps) : null,
    house_type: data.property_type || null,
    partner_name: data.partner_name || null,
    excerpt: data.short_summary || null,
    text: data.description || null,
    unique_feature: data.unique_features || null,
    why_onehundred: data.why_100_collection || null,
    active: data.status === "active" || false,
    status: data.status || "draft",
  };

  // Images: store photo_urls as a JSON string in the images column
  if (data.photo_urls && data.photo_urls.length > 0) {
    mapped.images = JSON.stringify(data.photo_urls);
    mapped.property_image = data.photo_urls[0]; // first photo as primary
    mapped.photo_count = data.photo_urls.length;
    mapped.vrm_images = JSON.stringify(data.photo_urls);
  }

  // Categories/amenities
  if (data.amenities && data.amenities.length > 0) {
    mapped.categories = data.amenities.join(", ");
    mapped.prop_categories = JSON.stringify(data.amenities);
  }

  // Location
  if (data.location_city || data.location_state || data.location_country) {
    const parts = [data.location_city, data.location_state, data.location_country].filter(Boolean);
    if (parts.length > 0) mapped.destination = parts.join(", ");
  }

  // Always set created_at since the column default may not be configured
  mapped.created_at = new Date().toISOString();

  // Remove undefined/null keys but KEEP url and vrm_url even if empty (they have NOT NULL constraints)
  return Object.fromEntries(Object.entries(mapped).filter(([k, v]) => {
    if (k === 'url' || k === 'vrm_url' || k === 'name') return true;
    return v !== null && v !== undefined && v !== "";
  }));
}

// Map Base44 Property entity fields → Supabase properties columns
function propertyToSupabase(p) {
  const url = p.listing_url || "https://the100collection.com";
  // Offboarding: depublish if temporary_offline, terminated, or scheduled+past due
  let effectiveStatus = p.status || "draft";
  let effectiveActive = p.status === "active";
  let effectivePortalVisible = p.portal_visible || false;
  if (p.offboarding_status === 'temporary_offline' || p.offboarding_status === 'terminated') {
    effectiveStatus = 'inactive';
    effectiveActive = false;
    effectivePortalVisible = false;
  } else if (p.offboarding_status === 'scheduled' && p.termination_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (p.termination_date <= today) {
      effectiveStatus = 'inactive';
      effectiveActive = false;
      effectivePortalVisible = false;
    }
  }
  const mapped = {
    name: p.property_name || "Unnamed Property",
    destination: p.market || "",
    url: url,
    vrm_url: url, // NOT NULL constraint
    bedrooms: p.bedrooms != null ? Number(p.bedrooms) : null,
    bathrooms: p.bathrooms != null ? String(p.bathrooms) : null,
    occupancy: p.sleeps != null ? Number(p.sleeps) : null,
    house_type: p.property_type || null,
    partner_name: p.partner_name || null,
    partner_id: p.partner_id || null,
    address: p.address || null,
    propdescription: p.internal_notes || null,
    text: p.description || p.text || null,
    excerpt: p.excerpt || p.short_summary || null,
    why_onehundred: p.why_100_collection || null,
    unique_feature: p.unique_features || p.unique_feature || null,
    status: effectiveStatus,
    active: effectiveActive,
    onboarding_status: p.onboarding_status || "not_started",
    photography_status: p.photography_status || "not_started",
    launch_date: p.launch_date || null,
    portal_visible: effectivePortalVisible,
    created_at: new Date().toISOString(),
  };

  // Remove undefined/null keys but KEEP url, vrm_url, and name (NOT NULL / required)
  return Object.fromEntries(Object.entries(mapped).filter(([k, v]) => {
    if (k === 'url' || k === 'vrm_url' || k === 'name') return true;
    return v !== null && v !== undefined && v !== "";
  }));
}

function fromSupabase(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    created_at: row.created_at,
    property_name: row.name,
    market: row.destination,
    listing_url: row.url,
    vrm_url: row.vrm_url,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
  };
}

// Geocode an address string to { latitude, longitude } via OpenStreetMap Nominatim.
// Free, no API key. Returns null on any failure so callers can skip the column.
async function geocodeAddress(address) {
  if (!address || address.trim() === '') return null;
  const q = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'The100Collection-OS/1.0 (sync-property)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) return { latitude: lat, longitude: lon };
    }
  } catch (e) {
    console.warn('[geocode] failed for "' + address + '":', e?.message);
  }
  return null;
}

// propertiesbase44 uses row_id (bigint) as its primary key, not id.
function fromSupabaseB44(row) {
  if (!row) return null;
  return {
    id: String(row.row_id),
    created_at: row.created_at,
    property_name: row.name,
    market: row.destination,
    listing_url: row.url,
    vrm_url: row.vrm_url,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
  };
}

// Apply PropertyImageOrder ordering to image_metadata rows
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

// Fetch all active images for a property, ordered correctly.
// Sources: Supabase image_metadata table (ordered via PropertyImageOrder) + Base44 MediaAsset + Property.photo_urls.
async function fetchOrderedImages(supabase, base44, listingUrl, propertyId, photoUrls) {
  const imageUrls = [];
  const seen = new Set();

  // 1. image_metadata from Supabase storage
  if (listingUrl) {
    const normalized = listingUrl.replace(/\/+$/, '').split('?')[0];
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from('image_metadata').select('id, original_url, storage_path, alttext').eq('property_url', normalized).order('id', { ascending: true }),
      supabase.from('image_metadata').select('id, original_url, storage_path, alttext').eq('proppage', normalized).order('id', { ascending: true }),
      supabase.from('image_metadata').select('id, original_url, storage_path, alttext').ilike('property_url', normalized + '%').order('id', { ascending: true }).limit(200),
      supabase.from('image_metadata').select('id, original_url, storage_path, alttext').ilike('proppage', normalized + '%').order('id', { ascending: true }).limit(200),
    ]);
    const seenIds = new Set();
    const metaImages = [];
    for (const r of [r1, r2, r3, r4]) {
      if (r.data) {
        for (const row of r.data) {
          if (!seenIds.has(row.id)) { seenIds.add(row.id); metaImages.push(row); }
        }
      }
    }

    // Apply custom ordering from PropertyImageOrder
    const orderRecords = await base44.asServiceRole.entities.PropertyImageOrder.filter({ property_url: normalized });
    const orderedIds = orderRecords && orderRecords.length > 0 ? orderRecords[0].ordered_image_ids : null;
    const sorted = applyImageOrder(metaImages, orderedIds);

    for (const img of sorted) {
      // Prefer Supabase storage URL (from storage_path), then original_url
      const storageUrl = img.storage_path ? SUPABASE_STORAGE_BASE + img.storage_path : null;
      if (storageUrl && !seen.has(storageUrl)) {
        seen.add(storageUrl);
        imageUrls.push(storageUrl);
      }
      if (img.original_url && !seen.has(img.original_url)) {
        seen.add(img.original_url);
        imageUrls.push(img.original_url);
      }
    }
  }

  // 2. Base44 MediaAsset images for this property (approved or pending, not rejected)
  if (propertyId) {
    const assets = await base44.asServiceRole.entities.MediaAsset.filter({ property_id: propertyId });
    for (const a of assets) {
      if (a.approval_status === 'rejected') continue;
      if (a.asset_type && a.asset_type !== 'photo' && a.asset_type !== 'other') continue;
      const url = a.file_url || a.drive_file_url;
      if (url && !seen.has(url)) {
        seen.add(url);
        imageUrls.push(url);
      }
    }
  }

  // 3. Property.photo_urls (stored directly on the Property record, e.g. from submission import)
  if (Array.isArray(photoUrls)) {
    for (const url of photoUrls) {
      if (url && !seen.has(url)) {
        seen.add(url);
        imageUrls.push(url);
      }
    }
  }

  return imageUrls;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, id, data } = body;
    const supabase = getSupabase();

    // Safety guardrail: batch operations must be explicitly confirmed to prevent
    // accidentally publishing many properties to theonehundredcollection.com.
    if (body.batch_mode === true && body.confirm !== true) {
      return Response.json({ error: "Batch sync requires explicit confirmation (confirm: true)." }, { status: 400 });
    }

    // CREATE
    if (action === 'create') {
      const mapped = toSupabase(data);
      console.log('INSERT payload:', JSON.stringify(mapped));

      // Insert and fetch back by matching url + name to get the auto-generated id
      const { error: insertError } = await supabase.from('properties').insert([mapped]);
      if (insertError) {
        console.error('Supabase insert error:', insertError.message, insertError.details);
        return Response.json({ error: insertError.message }, { status: 500 });
      }

      // Fetch the just-inserted row by url match
      const { data: rows, error: fetchError } = await supabase
        .from('properties')
        .select('id, created_at, name, destination, url, vrm_url, bedrooms, bathrooms')
        .eq('url', mapped.url)
        .eq('name', mapped.name)
        .limit(5);

      console.log('Fetch-back rows:', JSON.stringify(rows), 'error:', fetchError?.message);

      // Pick the row with the highest numeric id
      const best = rows?.filter(r => r.id != null).sort((a, b) => Number(b.id) - Number(a.id))[0];
      return Response.json({ property: fromSupabase(best ?? rows?.[0]) });
    }

    // UPDATE
    if (action === 'update') {
      const mapped = toSupabase(data);
      console.log('UPDATE payload:', JSON.stringify(mapped), 'id:', id);
      const { data: row, error } = await supabase
        .from('properties')
        .update(mapped)
        .eq('id', id)
        .select('id, name, destination, url, vrm_url, bedrooms, bathrooms')
        .single();
      if (error) {
        console.error('Supabase update error:', error.message, error.details);
        return Response.json({ error: error.message }, { status: 500 });
      }
      return Response.json({ property: fromSupabase(row) });
    }

    // ADD STATUS COLUMN migration
    if (action === 'add_status_column') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';` }),
      });
      const text = await res.text();
      console.log('add_status_column result:', res.status, text);
      return Response.json({ status: res.status, result: text });
    }

    // DEBUG: list recent rows
    if (action === 'debug_list') {
      const { data: rows, error } = await supabase
        .from('properties')
        .select('id, created_at, name, url')
        .not('id', 'is', null)
        .order('id', { ascending: false })
        .limit(10);
      console.log('debug rows:', JSON.stringify(rows), 'error:', error?.message);
      return Response.json({ rows, error: error?.message });
    }

    // BACKFILL: sync all active PropertySubmissions to Supabase
    if (action === 'backfill_active') {
      const submissions = await base44.asServiceRole.entities.PropertySubmission.filter({ status: 'active' });
      const results = [];
      for (const sub of submissions) {
        if (!sub.supabase_property_id || sub.supabase_property_id === 'null') {
          results.push({ id: sub.id, name: sub.property_name, skipped: true, reason: 'no supabase_property_id' });
          continue;
        }
        const mapped = toSupabase({ ...sub, status: 'active' });
        const { error } = await supabase.from('properties').update(mapped).eq('id', sub.supabase_property_id);
        results.push({ id: sub.id, supabase_id: sub.supabase_property_id, name: sub.property_name, error: error?.message || null });
      }
      return Response.json({ synced: results.length, results });
    }

    // SYNC FROM BASE44 PROPERTY ENTITY → SUPABASE propertiesbase44 (the app's
    // source-of-truth table). Creates the row if none exists, otherwise updates.
    // Usage: { action: 'sync_property', id: '<base44 Property id>' }
    if (action === 'sync_property') {
      const property = await base44.asServiceRole.entities.Property.get(id);
      if (!property) return Response.json({ error: 'Property not found' }, { status: 404 });

      console.warn(`[syncPropertyToSupabase] About to publish to Supabase — this will make "${property.property_name}" (status: ${property.status}, partner: ${property.partner_name || "—"}) visible on theonehundredcollection.com`);

      const mapped = propertyToSupabase(property);

      // Destination should reflect the partner's market, not the property's own
      // free-text market field, so all of a partner's properties share a destination.
      if (property.partner_id) {
        try {
          const partner = await base44.asServiceRole.entities.Partner.get(property.partner_id);
          if (partner) {
            const partnerDest = partner.market || partner.region;
            if (partnerDest) mapped.destination = partnerDest;
            }
            } catch (e) { /* partner not resolvable — keep property market */ }
            }

            // Public URL path on theonehundredcollection.com: /destinations/{dest-slug}/{property-slug}
            // The `vrm_url` column keeps the external listing URL; `url` is the public site path.
            const slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            const destSlug = slugify(mapped.destination || property.market || "");
            const propSlug = slugify(property.property_name || "");
            if (destSlug && propSlug) mapped.url = `/destinations/${destSlug}/${propSlug}`;

            // Fetch ordered images from image_metadata + Base44 MediaAsset + Property.photo_urls
      const imageUrls = await fetchOrderedImages(supabase, base44, property.listing_url, id, property.photo_urls);
      if (imageUrls.length > 0) {
        mapped.images = JSON.stringify(imageUrls);
        mapped.vrm_images = JSON.stringify(imageUrls);
        mapped.property_image = imageUrls[0];
        mapped.photo_count = imageUrls.length;
      }

      // Geocode the address (falling back to city/state/country) to latitude/longitude
      // so the public site map pin renders for this property.
      const geocodeInput = property.address || [property.location_city, property.location_state, property.location_country].filter(Boolean).join(', ');
      if (geocodeInput) {
        const coords = await geocodeAddress(geocodeInput);
        if (coords) {
          mapped.latitude = coords.latitude;
          mapped.longitude = coords.longitude;
        }
      }

      const TABLE = 'propertiesbase44';
      const SELECT_COLS = 'row_id, created_at, name, destination, url, vrm_url, bedrooms, bathrooms';

      // If we already have a valid supabase_property_id, UPDATE by row_id.
      const sbId = property.supabase_property_id;
      const hasValidSbId = sbId && sbId !== 'null' && sbId !== 'undefined';
      if (hasValidSbId) {
        const { data: row, error } = await supabase
          .from(TABLE)
          .update(mapped)
          .eq('row_id', sbId)
          .select(SELECT_COLS)
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ property: fromSupabaseB44(row), action: 'updated' });
      }

      // No valid supabase_property_id — check if a row already exists by URL
      // (exact vrm_url, exact url, then normalized) to avoid a duplicate insert.
      const lookupUrl = property.listing_url || mapped.vrm_url;
      if (lookupUrl) {
        const normalized = lookupUrl.replace(/\/+$/, '').split('?')[0];
        const attempts = [
          supabase.from(TABLE).select(SELECT_COLS).eq('vrm_url', lookupUrl),
          supabase.from(TABLE).select(SELECT_COLS).eq('url', lookupUrl),
          supabase.from(TABLE).select(SELECT_COLS).eq('vrm_url', normalized),
          supabase.from(TABLE).select(SELECT_COLS).eq('url', normalized),
        ];
        let existing = null;
        for (const q of attempts) {
          const { data: rows } = await q.limit(1);
          if (rows && rows.length > 0) { existing = rows[0]; break; }
        }
        if (existing) {
          const { data: row, error: updErr } = await supabase
            .from(TABLE)
            .update(mapped)
            .eq('row_id', existing.row_id)
            .select(SELECT_COLS)
            .single();
          if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
          await base44.asServiceRole.entities.Property.update(id, { supabase_property_id: String(row.row_id) });
          return Response.json({ property: fromSupabaseB44(row), action: 'updated' });
        }
      }

      // No existing row — INSERT a new one. propertiesbase44.row_id is a NOT NULL
      // bigint with no default, so generate one (epoch ms + random suffix).
      const insertPayload = { ...mapped, row_id: Date.now() + Math.floor(Math.random() * 1000) };
      const { data: newRow, error: insertErr } = await supabase
        .from(TABLE)
        .insert([insertPayload])
        .select(SELECT_COLS)
        .single();
      if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 });

      // Stamp the new row_id back on the Base44 Property so future saves update it.
      await base44.asServiceRole.entities.Property.update(id, { supabase_property_id: String(newRow.row_id) });
      return Response.json({ property: fromSupabaseB44(newRow), action: 'created' });
    }

    // BACKFILL: sync Base44 Properties → Supabase in small batches (stamps supabase_property_id).
    // Each call processes `batch_size` properties (default 50) starting at `skip`, so a single
    // invocation finishes well within the function runtime timeout. The frontend loops until
    // has_more is false.
    if (action === 'backfill_properties') {
      const skip = Number(body.skip || 0);
      const batchSize = Number(body.batch_size || 25);
      const properties = await base44.asServiceRole.entities.Property.list('-created_date', batchSize + 1, skip);
      const has_more = properties.length > batchSize;
      const batch = has_more ? properties.slice(0, batchSize) : properties;
      const results = [];
      for (const prop of batch) {
        const mapped = propertyToSupabase(prop);
        // Fetch ordered images from image_metadata + Base44 MediaAsset + Property.photo_urls
        const imageUrls = await fetchOrderedImages(supabase, base44, prop.listing_url, prop.id, prop.photo_urls);
        if (imageUrls.length > 0) {
          mapped.images = JSON.stringify(imageUrls);
          mapped.vrm_images = JSON.stringify(imageUrls);
          mapped.property_image = imageUrls[0];
          mapped.photo_count = imageUrls.length;
        }
        if (prop.supabase_property_id) {
          const { error } = await supabase.from('properties').update(mapped).eq('id', prop.supabase_property_id);
          results.push({ id: prop.id, name: prop.property_name, supabase_id: prop.supabase_property_id, action: 'updated', error: error?.message || null });
        } else {
          const { data: newRow, error } = await supabase.from('properties').insert([mapped]).select('id').single();
          if (error) {
            results.push({ id: prop.id, name: prop.property_name, action: 'insert_failed', error: error.message });
          } else {
            await base44.asServiceRole.entities.Property.update(prop.id, { supabase_property_id: String(newRow.id) });
            results.push({ id: prop.id, name: prop.property_name, supabase_id: String(newRow.id), action: 'created' });
          }
        }
      }
      return Response.json({ synced: batch.length, skip, has_more, results });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});