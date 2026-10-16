import { getNeonPool, json } from "./neon-db.js";
import { hasRemoteSupabase, supabaseRest } from "./supabase-remote.js";
import { geocodeAddressString } from "./geocode-address.js";

/**
 * Partner-facing direct property content update (no approval queue).
 * Writes Neon base44.property + Neon supabase.propertiesbase44 (+ remote Supabase when configured).
 */
export async function handleUpdatePropertyContent(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const { basePropertyId, supabaseRowId, supabaseUrl, fields } = body || {};
  if (!fields || typeof fields !== "object") {
    return json(res, 400, { error: "fields object required" });
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
    location_full,
    best_fit_guest,
    design_style_notes,
    headline,
    latitude: latIn,
    longitude: lonIn,
  } = fields;

  const results: Record<string, boolean | string | null> = {
    base44: false,
    supabase: false,
    geocoded: false,
    geocode_provider: null,
  };
  let latitude = latIn !== undefined ? (latIn === "" || latIn == null ? null : Number(latIn)) : undefined;
  let longitude = lonIn !== undefined ? (lonIn === "" || lonIn == null ? null : Number(lonIn)) : undefined;

  // Geocode when address is provided and coords weren't explicitly sent
  // (Nominatim first, Mapbox fallback — see geocodeAddressString)
  if (address !== undefined && String(address || "").trim()) {
    if (latitude === undefined && longitude === undefined) {
      const coords = await geocodeAddressString(String(address).trim());
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
        results.geocoded = true;
        results.geocode_provider = coords.provider;
      } else {
        latitude = null;
        longitude = null;
      }
    }
  } else if (address !== undefined && !String(address || "").trim()) {
    latitude = null;
    longitude = null;
  }

  const pool = getNeonPool();

  // 1. Update Neon base44.property
  if (basePropertyId) {
    const patch: Record<string, unknown> = {};
    if (short_summary !== undefined) {
      patch.short_summary = short_summary;
      patch.excerpt = short_summary;
    }
    if (description !== undefined) {
      patch.description = description;
      patch.text = description;
    }
    if (why_100_collection !== undefined) {
      patch.why_100_collection = why_100_collection;
      patch.why_onehundred = why_100_collection;
    }
    if (unique_features !== undefined) {
      patch.unique_features = unique_features;
      patch.unique_feature = unique_features;
    }
    if (amenities !== undefined) patch.amenities = Array.isArray(amenities) ? amenities : [];
    if (bedrooms !== undefined) patch.bedrooms = bedrooms === "" ? null : Number(bedrooms);
    if (bathrooms !== undefined) patch.bathrooms = bathrooms === "" ? null : Number(bathrooms);
    if (half_bathrooms !== undefined) {
      patch.half_bathrooms = half_bathrooms === "" ? null : Number(half_bathrooms);
    }
    if (sleeps !== undefined) patch.sleeps = sleeps === "" ? null : Number(sleeps);
    if (property_type !== undefined) patch.property_type = property_type;
    if (address !== undefined) patch.address = address || null;
    if (location_full !== undefined) patch.location_full = location_full || null;
    if (best_fit_guest !== undefined) patch.best_fit_guest = best_fit_guest;
    if (design_style_notes !== undefined) patch.design_style_notes = design_style_notes;
    if (headline !== undefined) patch.headline = headline;
    if (latitude !== undefined) patch.latitude = latitude;
    if (longitude !== undefined) patch.longitude = longitude;
    patch.updated_date = new Date().toISOString();

    if (Object.keys(patch).length > 1) {
      const { rowCount } = await pool.query(
        `UPDATE base44.property
         SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [String(basePropertyId), JSON.stringify(patch)]
      );
      results.base44 = (rowCount || 0) > 0;
    }
  }

  // 2. Update Neon supabase.propertiesbase44 (+ remote)
  const sbClean: Record<string, unknown> = {};
  if (short_summary !== undefined) sbClean.excerpt = short_summary;
  if (description !== undefined) sbClean.text = description;
  if (why_100_collection !== undefined) sbClean.why_onehundred = why_100_collection;
  if (unique_features !== undefined) sbClean.unique_feature = unique_features;
  if (amenities !== undefined) {
    const arr = Array.isArray(amenities) ? amenities : [];
    // Neon columns are jsonb — bind as JSON text with ::jsonb cast below
    sbClean.categories = JSON.stringify(arr);
    sbClean.prop_categories = JSON.stringify(arr);
  }
  // bedrooms / bathrooms / occupancy are text columns on propertiesbase44
  if (bedrooms !== undefined) {
    sbClean.bedrooms = bedrooms === "" || bedrooms == null ? null : String(bedrooms);
  }
  if (bathrooms !== undefined) {
    sbClean.bathrooms = bathrooms === "" || bathrooms == null ? null : String(bathrooms);
  }
  if (sleeps !== undefined) {
    sbClean.occupancy = sleeps === "" || sleeps == null ? null : String(sleeps);
  }
  if (property_type !== undefined) sbClean.house_type = property_type;
  if (address !== undefined) sbClean.address = address || null;
  if (location_full !== undefined) sbClean.destination = location_full || null;
  if (best_fit_guest !== undefined) sbClean.best_fit_guest = best_fit_guest;
  if (design_style_notes !== undefined) sbClean.design_style_notes = design_style_notes;
  if (headline !== undefined) sbClean.headline = headline;
  if (latitude !== undefined) sbClean.latitude = latitude;
  if (longitude !== undefined) sbClean.longitude = longitude;

  let resolvedListingUrl = String(supabaseUrl || "").trim();

  if (Object.keys(sbClean).length > 0 && (supabaseRowId || resolvedListingUrl || basePropertyId)) {
    let sbId = supabaseRowId ? String(supabaseRowId) : "";

    // Resolve supabase id from Base44 property if needed
    if (!sbId && basePropertyId) {
      const { rows } = await pool.query(
        `SELECT data->>'supabase_property_id' AS sb_id,
                data->>'listing_url' AS listing_url,
                data->>'vrm_url' AS vrm_url
         FROM base44.property WHERE id = $1`,
        [String(basePropertyId)]
      );
      sbId = rows[0]?.sb_id && rows[0].sb_id !== "null" ? rows[0].sb_id : "";
      if (!resolvedListingUrl) {
        resolvedListingUrl = rows[0]?.listing_url || rows[0]?.vrm_url || "";
      }
    }

    const sbKeys = Object.keys(sbClean);
    const setClauses = sbKeys
      .map((k, i) => {
        const param = `$${i + 2}`;
        return JSONB_SB_FIELDS.has(k)
          ? `${quoteIdentSafe(k)} = ${param}::jsonb`
          : `${quoteIdentSafe(k)} = ${param}`;
      })
      .join(", ");
    const values = Object.values(sbClean);

    if (sbId) {
      const { rowCount } = await pool.query(
        `UPDATE supabase.propertiesbase44
         SET ${setClauses}
         WHERE id::text = $1 OR row_id::text = $1`,
        [sbId, ...values]
      );
      results.supabase = (rowCount || 0) > 0;
    }

    const url = resolvedListingUrl.trim();
    if (!results.supabase && url) {
      const norm = url.replace(/\/+$/, "").split("?")[0].split("#")[0];
      const { rowCount } = await pool.query(
        `UPDATE supabase.propertiesbase44
         SET ${setClauses}
         WHERE vrm_url = $1 OR url = $1 OR vrm_url = $${values.length + 2} OR url = $${values.length + 2}`,
        [url, ...values, norm]
      );
      results.supabase = (rowCount || 0) > 0;
    }

    // Dual-write remote Supabase when configured
    if (hasRemoteSupabase() && (sbId || url)) {
      try {
        if (sbId) {
          await supabaseRest(
            `propertiesbase44?or=(id.eq.${encodeURIComponent(sbId)},row_id.eq.${encodeURIComponent(sbId)})`,
            { method: "PATCH", body: JSON.stringify(sbClean) }
          );
          results.supabase = true;
        } else if (url) {
          const norm = url.replace(/\/+$/, "").split("?")[0].split("#")[0];
          for (const filter of [
            `vrm_url=eq.${encodeURIComponent(url)}`,
            `url=eq.${encodeURIComponent(url)}`,
            `vrm_url=eq.${encodeURIComponent(norm)}`,
            `url=eq.${encodeURIComponent(norm)}`,
          ]) {
            try {
              await supabaseRest(`propertiesbase44?${filter}`, {
                method: "PATCH",
                body: JSON.stringify(sbClean),
              });
              results.supabase = true;
              break;
            } catch {
              /* try next */
            }
          }
        }
      } catch (e: any) {
        console.warn("[updatePropertyContent] remote supabase failed", e?.message || e);
      }
    }
  }

  if (!results.base44 && !results.supabase) {
    return json(res, 400, {
      error:
        "No property record could be updated. Ensure a Base44 property ID or Supabase row ID / URL is provided.",
    });
  }

  return json(res, 200, {
    success: true,
    results,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
  });
}

const JSONB_SB_FIELDS = new Set(["categories", "prop_categories"]);

function quoteIdentSafe(name: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid column: ${name}`);
  }
  return `"${name}"`;
}
