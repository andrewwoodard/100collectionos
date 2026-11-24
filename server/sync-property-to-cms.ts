/**
 * Keep Neon cms.properties in sync when portal Property / propertiesbase44 rows change.
 * cms.properties is the source of truth for public destination + property pages.
 */
import { getNeonPool } from "./neon-db.js";

function asString(value: unknown) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function asBool(value: unknown) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function slugify(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStatus(status: unknown, active: unknown) {
  const s = asString(status)?.toLowerCase();
  if (s) return s;
  if (active === false || active === "false") return "inactive";
  if (active === true || active === "true") return "active";
  return null;
}

/** Merge a portal/Base44/supabase property shape into cms.properties. */
export async function syncPropertyRecordToCms(
  source: Record<string, any> | null | undefined,
  opts: { base44Id?: string | null; supabaseId?: string | null } = {}
) {
  if (!source || typeof source !== "object") return { ok: false as const, reason: "no_source" };

  const base44Id =
    asString(opts.base44Id) ||
    asString(source.base44_property_id) ||
    (asString(source.id) && !String(source.id).includes(":") && !/^\d+$/.test(String(source.id))
      ? asString(source.id)
      : null);
  const supabaseId =
    asString(opts.supabaseId) ||
    asString(source.supabase_property_id) ||
    asString(source._supabaseRowId) ||
    asString(source.row_id) ||
    (asString(source.id) && /^\d+$/.test(String(source.id)) ? asString(source.id) : null);

  const name =
    asString(source.property_name) ||
    asString(source.name) ||
    asString(source.title);
  const partnerName = asString(source.partner_name);
  const partnerId = asString(source.partner_id);
  const status = normalizeStatus(source.status, source.active);
  const active =
    asBool(source.active) ??
    (status === "active" || status === "live" ? true : status ? false : null);
  const portalVisible =
    asBool(source.portal_visible) ??
    (status === "active" || status === "live" ? true : status ? false : null);

  const listingUrl = asString(source.listing_url) || asString(source.vrm_url) || asString(source.url);
  const destination = asString(source.destination) || asString(source.market);
  const cmsId = base44Id ? `base44:${base44Id}` : supabaseId ? `supabase:${supabaseId}` : null;
  if (!cmsId && !listingUrl && !name) {
    return { ok: false as const, reason: "missing_identity" };
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };
  if (name) {
    patch.name = name;
    patch.property_name = name;
  }
  if (partnerName) patch.partner_name = partnerName;
  if (partnerId) patch.partner_id = partnerId;
  if (status) patch.status = status;
  if (active != null) patch.active = active;
  if (portalVisible != null) patch.portal_visible = portalVisible;
  if (destination) {
    patch.destination = destination;
    patch.market = destination;
  }
  if (listingUrl) {
    patch.listing_url = listingUrl;
    if (!source.url) patch.vrm_url = listingUrl;
  }
  if (asString(source.url)) patch.url = asString(source.url);
  if (asString(source.vrm_url)) patch.vrm_url = asString(source.vrm_url);
  if (asString(source.address)) patch.address = asString(source.address);
  if (asString(source.location_full)) patch.location_full = asString(source.location_full);
  if (asString(source.location_city)) patch.location_city = asString(source.location_city);
  if (asString(source.location_state)) patch.location_state = asString(source.location_state);
  // Allow clearing SEO overrides with empty string → null
  if (source.seo_title !== undefined) patch.seo_title = asString(source.seo_title);
  if (source.seo_description !== undefined) patch.seo_description = asString(source.seo_description);
  if (source.excerpt !== undefined) patch.excerpt = asString(source.excerpt);
  if (source.text !== undefined) patch.text = asString(source.text);
  if (source.headline !== undefined) patch.headline = asString(source.headline);
  if (source.latitude != null && source.latitude !== "") patch.latitude = Number(source.latitude);
  if (source.longitude != null && source.longitude !== "") patch.longitude = Number(source.longitude);
  if (source.bedrooms != null) patch.bedrooms = String(source.bedrooms);
  if (source.bathrooms != null) patch.bathrooms = String(source.bathrooms);
  if (source.sleeps != null || source.occupancy != null) {
    const sleeps = source.sleeps ?? source.occupancy;
    patch.sleeps = String(sleeps);
    patch.occupancy = String(sleeps);
  }
  if (asString(source.property_type) || asString(source.house_type)) {
    const t = asString(source.property_type) || asString(source.house_type);
    patch.property_type = t;
    patch.house_type = t;
  }
  if (base44Id) patch.base44_property_id = base44Id;
  if (supabaseId) patch.supabase_property_id = supabaseId;
  if (asString(source.slug) || name) patch.slug = asString(source.slug) || slugify(name);
  if (asString(source.source)) patch.source = asString(source.source);
  else if (base44Id) patch.source = "base44";
  else if (supabaseId) patch.source = "supabase";
  if (source.partner_sort_order != null && source.partner_sort_order !== "") {
    const order = Number(source.partner_sort_order);
    if (Number.isFinite(order)) patch.partner_sort_order = order;
  }

  const pool = getNeonPool();
  const ids = [cmsId, base44Id, supabaseId, listingUrl].filter(Boolean) as string[];

  const { rows: existing } = await pool.query(
    `SELECT id FROM cms.properties
     WHERE ($1::text IS NOT NULL AND id = $1)
        OR ($2::text IS NOT NULL AND (id = 'base44:' || $2 OR base44_property_id = $2))
        OR ($3::text IS NOT NULL AND (id = 'supabase:' || $3 OR supabase_property_id = $3))
        OR ($4::text IS NOT NULL AND (listing_url = $4 OR vrm_url = $4 OR url = $4))
     ORDER BY CASE WHEN id LIKE 'base44:%' THEN 0 ELSE 1 END
     LIMIT 1`,
    [cmsId, base44Id, supabaseId, listingUrl]
  );

  if (existing[0]?.id) {
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ");
    const { rowCount } = await pool.query(
      `UPDATE cms.properties SET ${sets} WHERE id = $1`,
      [existing[0].id, ...keys.map((k) => patch[k])]
    );
    return { ok: true as const, id: existing[0].id, updated: rowCount || 0, created: false };
  }

  if (!cmsId) return { ok: false as const, reason: "no_cms_id" };

  const insertPatch = {
    id: cmsId,
    created_at: new Date().toISOString(),
    ...patch,
  };
  const keys = Object.keys(insertPatch);
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  await pool.query(
    `INSERT INTO cms.properties (${cols}) VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${keys
       .filter((k) => k !== "id" && k !== "created_at")
       .map((k) => `"${k}" = EXCLUDED."${k}"`)
       .join(", ")}`,
    keys.map((k) => insertPatch[k as keyof typeof insertPatch])
  );
  return { ok: true as const, id: cmsId, updated: 1, created: true, matchedIds: ids };
}
