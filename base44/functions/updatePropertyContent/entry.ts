import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
}

/**
 * Updates partner-editable property content (short_summary, description,
 * why_100_collection, unique_features) directly in both Base44 and Supabase,
 * bypassing the submission/approval workflow. Runs as service role so partners
 * can update properties they didn't create (admin-seeded records).
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { basePropertyId, supabaseRowId, supabaseUrl, fields } = body;

    if (!fields || typeof fields !== 'object') {
      return Response.json({ error: 'fields object required' }, { status: 400 });
    }

    const {
      short_summary,
      description,
      why_100_collection,
      unique_features,
      amenities,
      bedrooms,
      bathrooms,
      half_bathrooms,
      sleeps,
      property_type,
      address,
    } = fields;

    const results = { base44: false, supabase: false };

    // 1. Update Base44 Property (service role — bypasses RLS)
    if (basePropertyId) {
      try {
        const patch = {
          short_summary,
          description,
          why_100_collection,
          unique_features,
        };
        if (amenities !== undefined) {
          patch.amenities = Array.isArray(amenities) ? amenities : [];
        }
        if (bedrooms !== undefined) patch.bedrooms = bedrooms === "" ? null : Number(bedrooms);
        if (bathrooms !== undefined) patch.bathrooms = bathrooms === "" ? null : Number(bathrooms);
        if (half_bathrooms !== undefined) patch.half_bathrooms = half_bathrooms === "" ? null : Number(half_bathrooms);
        if (sleeps !== undefined) patch.sleeps = sleeps === "" ? null : Number(sleeps);
        if (property_type !== undefined) patch.property_type = property_type;
        if (address !== undefined) patch.address = address;
        await base44.asServiceRole.entities.Property.update(basePropertyId, patch);
        results.base44 = true;
      } catch (e) {
        console.error('[updatePropertyContent] base44 update failed:', e.message);
      }
    }

    // 2. Update Supabase property (propertiesbase44 table)
    //    Field mapping: Base44 → Supabase columns
    const sbId = supabaseRowId;
    const url = supabaseUrl;
    if (sbId || url) {
      const supabase = getSupabase();
      const clean = {};
      if (short_summary !== undefined) clean.excerpt = short_summary;
      if (description !== undefined) clean.text = description;
      if (why_100_collection !== undefined) clean.why_onehundred = why_100_collection;
      if (unique_features !== undefined) clean.unique_feature = unique_features;
      if (amenities !== undefined) {
        const arr = Array.isArray(amenities) ? amenities : [];
        clean.categories = arr.join(", ");
        clean.prop_categories = JSON.stringify(arr);
      }
      if (bedrooms !== undefined) clean.bedrooms = bedrooms === "" ? null : Number(bedrooms);
      if (bathrooms !== undefined) clean.bathrooms = bathrooms === "" ? null : Number(bathrooms);
      if (sleeps !== undefined) clean.occupancy = sleeps === "" ? null : Number(sleeps);
      if (property_type !== undefined) clean.house_type = property_type;
      if (address !== undefined) clean.address = address;

      if (Object.keys(clean).length > 0) {
        if (sbId) {
          const { error } = await supabase.from('propertiesbase44').update(clean).eq('row_id', sbId);
          if (error) {
            console.error('[updatePropertyContent] supabase update by id failed:', error.message);
          } else {
            results.supabase = true;
          }
        } else if (url) {
          const normalized = url.replace(/\/+$/, '').split('?')[0].split('#')[0];
          const attempts = [
            () => supabase.from('propertiesbase44').update(clean).eq('vrm_url', url),
            () => supabase.from('propertiesbase44').update(clean).eq('url', url),
            () => supabase.from('propertiesbase44').update(clean).eq('vrm_url', normalized),
            () => supabase.from('propertiesbase44').update(clean).eq('url', normalized),
          ];
          for (const attempt of attempts) {
            const { data, error } = await attempt();
            if (!error && data) { results.supabase = true; break; }
            if (error) console.error('[updatePropertyContent] supabase url attempt failed:', error.message);
          }
        }
      }
    }

    if (!results.base44 && !results.supabase) {
      return Response.json({ error: 'No property record could be updated. Ensure a Base44 property ID or Supabase row ID / URL is provided.' }, { status: 400 });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error('[updatePropertyContent] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}