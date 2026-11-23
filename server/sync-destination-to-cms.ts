/**
 * Keep Neon cms.destinations in sync when portal Destination entity rows change.
 */
import { getNeonPool } from "./neon-db.js";

function asString(value: unknown) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function slugify(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function syncDestinationRecordToCms(
  source: Record<string, any> | null | undefined,
  opts: { base44Id?: string | null } = {}
) {
  if (!source || typeof source !== "object") return { ok: false as const, reason: "no_source" };

  const base44Id = asString(opts.base44Id) || asString(source.id) || asString(source.base44_destination_id);
  const name = asString(source.name) || asString(source.title);
  const slug = asString(source.slug) || slugify(name);
  if (!base44Id && !slug && !name) return { ok: false as const, reason: "missing_identity" };

  const cmsId = base44Id ? `base44:${base44Id}` : `slug:${slug}`;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
    source: asString(source.source) || "base44",
  };
  if (name) {
    patch.name = name;
    if (!asString(source.title)) patch.title = name;
  }
  if (asString(source.title)) patch.title = asString(source.title);
  if (slug) patch.slug = slug;
  if (base44Id) patch.base44_destination_id = base44Id;
  if (source.is_exclusive != null) patch.is_exclusive = !!source.is_exclusive;
  if (asString(source.geocode_query)) patch.geocode_query = asString(source.geocode_query);
  if (source.latitude != null && source.latitude !== "") patch.latitude = Number(source.latitude);
  if (source.longitude != null && source.longitude !== "") patch.longitude = Number(source.longitude);
  if (asString(source.mux_playback_id)) patch.mux_playback_id = asString(source.mux_playback_id);
  if (asString(source.main_image_url)) patch.main_image_url = asString(source.main_image_url);
  if (asString(source.main_image_alt)) patch.main_image_alt = asString(source.main_image_alt);

  const pool = getNeonPool();
  const { rows: existing } = await pool.query(
    `SELECT id FROM cms.destinations
     WHERE ($1::text IS NOT NULL AND id = $1)
        OR ($2::text IS NOT NULL AND (id = 'base44:' || $2 OR base44_destination_id = $2))
        OR ($3::text IS NOT NULL AND lower(slug) = lower($3))
        OR ($4::text IS NOT NULL AND lower(name) = lower($4))
     ORDER BY CASE WHEN id LIKE 'base44:%' THEN 0 ELSE 1 END
     LIMIT 1`,
    [cmsId, base44Id, slug, name]
  );

  if (existing[0]?.id) {
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ");
    await pool.query(`UPDATE cms.destinations SET ${sets} WHERE id = $1`, [
      existing[0].id,
      ...keys.map((k) => patch[k]),
    ]);
    return { ok: true as const, id: existing[0].id, created: false };
  }

  const insertPatch = {
    id: cmsId,
    created_at: new Date().toISOString(),
    ...patch,
  };
  const keys = Object.keys(insertPatch);
  await pool.query(
    `INSERT INTO cms.destinations (${keys.map((k) => `"${k}"`).join(", ")})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})
     ON CONFLICT (id) DO UPDATE SET ${keys
       .filter((k) => k !== "id" && k !== "created_at")
       .map((k) => `"${k}" = EXCLUDED."${k}"`)
       .join(", ")}`,
    keys.map((k) => insertPatch[k as keyof typeof insertPatch])
  );
  return { ok: true as const, id: cmsId, created: true };
}
