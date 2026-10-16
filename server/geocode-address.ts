import { json } from "./neon-db.js";

/**
 * Geocode an address via OpenStreetMap Nominatim.
 * Used during Add Property so address + lat/lng can be stored on the submission
 * before a Property record exists.
 */
export async function geocodeAddressString(address: string) {
  const q = String(address || "").trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "The100Collection-OS/1.0 (geocode-property)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12000),
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
    };
  } catch (e: any) {
    console.warn("[geocodeAddress]", e?.message || e);
    return null;
  }
}

export async function handleGeocodeAddress(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const address = String(body?.address || "").trim();
  if (!address) {
    return json(res, 200, { geocoded: false, latitude: null, longitude: null, cleared: true });
  }
  const coords = await geocodeAddressString(address);
  return json(res, 200, {
    geocoded: !!coords,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    display_name: coords?.display_name ?? null,
  });
}
