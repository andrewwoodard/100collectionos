import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
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
        'User-Agent': 'The100Collection-OS/1.0 (geocode-property)',
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
    console.warn('[geocodePropertyAddress] geocode failed for "' + address + '":', e?.message);
  }
  return null;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { property_id, address } = body || {};
    if (!property_id) return Response.json({ error: 'property_id is required' }, { status: 400 });
    if (!address || !address.trim()) {
      // Clear coordinates when the address is removed.
      await base44.entities.Property.update(property_id, {
        address: null,
        latitude: null,
        longitude: null,
      });
      return Response.json({ geocoded: false, cleared: true });
    }

    const coords = await geocodeAddress(address);

    // 1. Update the Base44 Property entity (address + coordinates).
    const update = { address };
    if (coords) {
      update.latitude = coords.latitude;
      update.longitude = coords.longitude;
    } else {
      // No result — clear stale coordinates so we don't keep a mismatched point.
      update.latitude = null;
      update.longitude = null;
    }
    await base44.entities.Property.update(property_id, update);

    // 2. Update the Supabase propertiesbase44 row so the public site / portal
    //    reflect the new address + coordinates. Match by supabase_property_id,
    //    then by listing/vrm url as a fallback.
    const supabase = getSupabase();
    const prop = await base44.entities.Property.get(property_id);
    const sbId = prop?.supabase_property_id;
    const sbPayload = { address };
    if (coords) {
      sbPayload.latitude = coords.latitude;
      sbPayload.longitude = coords.longitude;
    }
    let sbUpdated = false;
    if (sbId && sbId !== 'null' && sbId !== 'undefined') {
      const { error } = await supabase.from('propertiesbase44').update(sbPayload).eq('row_id', sbId);
      sbUpdated = !error;
      if (error) console.warn('[geocodePropertyAddress] supabase update by row_id failed:', error.message);
    }
    if (!sbUpdated) {
      const lookupUrl = prop?.listing_url || prop?.vrm_url;
      if (lookupUrl) {
        const norm = lookupUrl.replace(/\/+$/, '').split('?')[0].split('#')[0];
        const attempts = [
          () => supabase.from('propertiesbase44').update(sbPayload).eq('vrm_url', lookupUrl),
          () => supabase.from('propertiesbase44').update(sbPayload).eq('url', lookupUrl),
          () => supabase.from('propertiesbase44').update(sbPayload).eq('vrm_url', norm),
          () => supabase.from('propertiesbase44').update(sbPayload).eq('url', norm),
        ];
        for (const attempt of attempts) {
          const { error } = await attempt();
          if (!error) { sbUpdated = true; break; }
        }
      }
    }

    return Response.json({
      geocoded: !!coords,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      supabase_updated: sbUpdated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}