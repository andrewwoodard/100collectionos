import { getNeonPool, json } from "./neon-db.js";
import { hasRemoteSupabase, supabaseRest } from "./supabase-remote.js";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  display_name: string | null;
  provider: "nominatim" | "mapbox";
};

function mapboxToken() {
  return (
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.MAPBOX_API_KEY ||
    process.env.MAPBOX_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    ""
  )
    .replace(/\s/g, "")
    .trim();
}

async function geocodeWithNominatim(q: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "The100Collection-OS/1.0 (geocode-property; contact@the100collection.com)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      latitude: lat,
      longitude: lon,
      display_name: data[0].display_name || null,
      provider: "nominatim",
    };
  } catch (e: any) {
    console.warn("[geocodeAddress] nominatim", e?.message || e);
    return null;
  }
}

async function geocodeWithMapbox(
  q: string,
  opts: { country?: string | null } = {}
): Promise<GeocodeResult | null> {
  const token = mapboxToken();
  if (!token) {
    console.warn("[geocodeAddress] Mapbox fallback skipped — MAPBOX_ACCESS_TOKEN not set");
    return null;
  }

  // Semicolons are illegal in Mapbox search_text
  const cleaned = q.replace(/;/g, ",").slice(0, 256);
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("types", "address,place,locality,neighborhood,poi,region,country");
  // Properties default to US bias; destination place names pass country: null.
  if (opts.country) url.searchParams.set("country", opts.country);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn("[geocodeAddress] mapbox status", res.status);
      return null;
    }
    const data = (await res.json()) as {
      features?: Array<{ center?: [number, number]; place_name?: string }>;
    };
    const feature = data.features?.[0];
    if (!feature?.center || feature.center.length < 2) return null;
    const [longitude, latitude] = feature.center;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      display_name: feature.place_name || null,
      provider: "mapbox",
    };
  } catch (e: any) {
    console.warn("[geocodeAddress] mapbox", e?.message || e);
    return null;
  }
}

/**
 * Geocode an address: Nominatim first, Mapbox if that returns no match.
 * Pass country: null for worldwide place/destination lookups (no US bias).
 */
export async function geocodeAddressString(
  address: string,
  opts: { country?: string | null } = { country: "us" }
): Promise<GeocodeResult | null> {
  const q = String(address || "").trim();
  if (!q) return null;
  const primary = await geocodeWithNominatim(q);
  if (primary) return primary;
  return geocodeWithMapbox(q, opts);
}

export async function handleGeocodeAddress(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const address = String(body?.address || body?.query || "").trim();
  if (!address) {
    return json(res, 200, { geocoded: false, latitude: null, longitude: null, cleared: true });
  }
  // body.country === null | "" → worldwide; omit → US property bias; string → that country
  const country =
    body?.country === null || body?.country === ""
      ? null
      : body?.country != null
        ? String(body.country)
        : body?.worldwide || body?.scope === "destination"
          ? null
          : "us";
  const coords = await geocodeAddressString(address, { country });
  return json(res, 200, {
    geocoded: !!coords,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    display_name: coords?.display_name ?? null,
    provider: coords?.provider ?? null,
  });
}

/**
 * Persist address (+ geocoded lat/lng) onto Neon base44.property and
 * supabase.propertiesbase44. Replaces the Base44 cloud geocodePropertyAddress
 * function so admin/portal saves work under Better Auth.
 */
export async function handleGeocodePropertyAddress(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const propertyId = String(body?.property_id || "").trim();
  if (!propertyId) return json(res, 400, { error: "property_id is required" });

  const addressRaw = body?.address;
  const address =
    addressRaw == null || String(addressRaw).trim() === ""
      ? null
      : String(addressRaw).trim();

  let latitude: number | null = null;
  let longitude: number | null = null;
  let geocoded = false;
  let provider: string | null = null;

  if (address) {
    const coords = await geocodeAddressString(address);
    if (coords) {
      latitude = coords.latitude;
      longitude = coords.longitude;
      geocoded = true;
      provider = coords.provider;
    }
  }

  const pool = getNeonPool();
  const patch = {
    address,
    latitude,
    longitude,
    updated_date: new Date().toISOString(),
  };

  const { rowCount } = await pool.query(
    `UPDATE base44.property
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb
     WHERE id = $1 OR data->>'id' = $1`,
    [propertyId, JSON.stringify(patch)]
  );

  if (!rowCount) {
    return json(res, 404, { error: "Property not found" });
  }

  const { rows } = await pool.query(
    `SELECT data->>'supabase_property_id' AS sb_id,
            data->>'listing_url' AS listing_url,
            data->>'vrm_url' AS vrm_url
     FROM base44.property
     WHERE id = $1 OR data->>'id' = $1
     LIMIT 1`,
    [propertyId]
  );

  const sbId =
    rows[0]?.sb_id && rows[0].sb_id !== "null" && rows[0].sb_id !== "undefined"
      ? String(rows[0].sb_id)
      : "";
  const listingUrl = String(rows[0]?.listing_url || rows[0]?.vrm_url || "").trim();
  const sbPayload = { address, latitude, longitude };
  let supabaseUpdated = false;

  if (sbId) {
    const { rowCount: n } = await pool.query(
      `UPDATE supabase.propertiesbase44
       SET address = $2, latitude = $3, longitude = $4
       WHERE id::text = $1 OR row_id::text = $1`,
      [sbId, address, latitude, longitude]
    );
    supabaseUpdated = (n || 0) > 0;
  }

  if (!supabaseUpdated && listingUrl) {
    const norm = listingUrl.replace(/\/+$/, "").split("?")[0].split("#")[0];
    const { rowCount: n } = await pool.query(
      `UPDATE supabase.propertiesbase44
       SET address = $3, latitude = $4, longitude = $5
       WHERE vrm_url IN ($1, $2) OR url IN ($1, $2)`,
      [listingUrl, norm, address, latitude, longitude]
    );
    supabaseUpdated = (n || 0) > 0;
  }

  if (hasRemoteSupabase() && (sbId || listingUrl)) {
    try {
      if (sbId) {
        await supabaseRest(
          `propertiesbase44?or=(id.eq.${encodeURIComponent(sbId)},row_id.eq.${encodeURIComponent(sbId)})`,
          { method: "PATCH", body: JSON.stringify(sbPayload) }
        );
        supabaseUpdated = true;
      } else if (listingUrl) {
        const norm = listingUrl.replace(/\/+$/, "").split("?")[0].split("#")[0];
        for (const filter of [
          `vrm_url=eq.${encodeURIComponent(listingUrl)}`,
          `url=eq.${encodeURIComponent(listingUrl)}`,
          `vrm_url=eq.${encodeURIComponent(norm)}`,
          `url=eq.${encodeURIComponent(norm)}`,
        ]) {
          try {
            await supabaseRest(`propertiesbase44?${filter}`, {
              method: "PATCH",
              body: JSON.stringify(sbPayload),
            });
            supabaseUpdated = true;
            break;
          } catch {
            /* try next */
          }
        }
      }
    } catch (e: any) {
      console.warn("[geocodePropertyAddress] remote supabase failed", e?.message || e);
    }
  }

  return json(res, 200, {
    geocoded,
    cleared: !address,
    latitude,
    longitude,
    provider,
    supabase_updated: supabaseUpdated,
  });
}
