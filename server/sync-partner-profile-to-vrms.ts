/**
 * Push PartnerProfile branding + owner favorites onto supabase.vrms
 * (Neon mirror + classic Supabase for the public destination page).
 */
import { getNeonPool, json } from "./neon-db.js";
import { requireSession } from "./require-session.js";
import { hasRemoteSupabase, supabaseRest } from "./supabase-remote.js";

function slugify(name: string) {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function marketToDestinationSlug(market: string | null | undefined) {
  return slugify(String(market || "").trim());
}

function buildFavoritesJson(profile: Record<string, any>) {
  const favorites = {
    restaurants: profile.favorite_restaurants || null,
    breweries: profile.favorite_breweries || null,
    bakery: profile.favorite_bakery || null,
    shops: profile.favorite_shops || null,
    things_to_do: profile.favorite_things_to_do || null,
  };
  const hasAny = Object.values(favorites).some((v) => String(v || "").trim());
  return hasAny ? favorites : null;
}

function buildVrmsPayload(profile: Record<string, any>, partner: Record<string, any> | null) {
  const partnerName =
    partner?.partner_name || profile.partner_name || profile.company_name || "";
  const email =
    profile.reservation_email ||
    partner?.primary_contact_email ||
    profile.partner_email ||
    "";
  const phone =
    profile.reservation_phone ||
    profile.personal_phone ||
    partner?.primary_contact_phone ||
    "";
  const bio = profile.about_bio || profile.company_bio || "";
  const market = partner?.market || profile.market || "";
  const destinationSlug = marketToDestinationSlug(market);
  const favorites_json = buildFavoritesJson(profile);

  return {
    favorites_json,
    name: partnerName,
    partner_name: partnerName,
    title: partnerName,
    slug: slugify(partnerName),
    doyen_name: profile.display_name || "",
    doyen_title: profile.title || "",
    doyen_short_description: profile.company_bio || bio.slice(0, 160),
    doyen_text: bio,
    doyen_image_url: profile.profile_photo_url || null,
    logo_image_url: profile.company_logo_url || null,
    // Destination hero is edited on the Destination About card (vrms.main_image_url).
    // Only push when the profile still has an explicit hero so we don't wipe it.
    ...(profile.destination_hero_image_url
      ? { main_image_url: profile.destination_hero_image_url }
      : {}),
    vrm_email: email,
    email,
    vrm_phone: phone,
    phone,
    website: profile.website_url || null,
    vrm_url: profile.website_url || null,
    first_destination_slug: destinationSlug || null,
    destination_slugs: destinationSlug ? [destinationSlug] : null,
    showproperties: true,
    onboarded: true,
    is_onboarded: true,
    source: "base44",
    updated_at: new Date().toISOString(),
  };
}

async function loadProfileAndPartner(body: any) {
  const pool = getNeonPool();
  const profileId = body.profileId || body.event?.entity_id || body.data?.id;
  const partnerEmail = body.partnerEmail || body.data?.partner_email || "";

  let profile: Record<string, any> | null =
    body.data?.partner_email || body.data?.favorite_restaurants ? body.data : null;

  if (!profile && profileId) {
    const { rows } = await pool.query(
      `SELECT id, data FROM base44.partner_profile WHERE id = $1 LIMIT 1`,
      [String(profileId)]
    );
    if (rows[0]) profile = { id: rows[0].id, ...(rows[0].data || {}) };
  }
  if (!profile && partnerEmail) {
    const { rows } = await pool.query(
      `SELECT id, data FROM base44.partner_profile
       WHERE lower(data->>'partner_email') = lower($1)
       ORDER BY updated_date DESC NULLS LAST
       LIMIT 1`,
      [String(partnerEmail)]
    );
    if (rows[0]) profile = { id: rows[0].id, ...(rows[0].data || {}) };
  }
  if (!profile) return { profile: null, partner: null };

  let partner: Record<string, any> | null = null;
  if (profile.partner_id) {
    const { rows } = await pool.query(
      `SELECT id, data FROM base44.partner WHERE id = $1 LIMIT 1`,
      [String(profile.partner_id)]
    );
    if (rows[0]) partner = { id: rows[0].id, ...(rows[0].data || {}) };
  }
  if (!partner && profile.partner_email) {
    const { rows } = await pool.query(
      `SELECT id, data FROM base44.partner
       WHERE lower(data->>'primary_contact_email') = lower($1)
          OR lower(data->>'partner_name') = lower($2)
       LIMIT 1`,
      [String(profile.partner_email), String(profile.company_name || profile.partner_name || "")]
    );
    if (rows[0]) partner = { id: rows[0].id, ...(rows[0].data || {}) };
  }
  // Resolve by partner entity id passed from admin card
  if (!partner && body.partnerId) {
    const { rows } = await pool.query(
      `SELECT id, data FROM base44.partner WHERE id = $1 LIMIT 1`,
      [String(body.partnerId)]
    );
    if (rows[0]) partner = { id: rows[0].id, ...(rows[0].data || {}) };
  }

  return { profile, partner };
}

async function upsertNeonVrms(payload: Record<string, any>) {
  const pool = getNeonPool();
  const { rows: existing } = await pool.query(
    `SELECT id FROM supabase.vrms
     WHERE partner_name = $1 OR slug = $2
     ORDER BY CASE WHEN partner_name = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [payload.partner_name, payload.slug]
  );

  const cols = [
    "name",
    "partner_name",
    "title",
    "slug",
    "doyen_name",
    "doyen_title",
    "doyen_short_description",
    "doyen_text",
    "doyen_image_url",
    "logo_image_url",
    "main_image_url",
    "vrm_email",
    "email",
    "vrm_phone",
    "phone",
    "website",
    "vrm_url",
    "first_destination_slug",
    "destination_slugs",
    "favorites_json",
    "showproperties",
    "onboarded",
    "is_onboarded",
    "source",
    "updated_at",
  ];

  const values = cols.map((col) => {
    if (col === "destination_slugs" || col === "favorites_json") {
      return payload[col] == null ? null : JSON.stringify(payload[col]);
    }
    return payload[col] ?? null;
  });

  if (existing[0]?.id) {
    const sets = cols.map((col, i) => {
      if (col === "destination_slugs" || col === "favorites_json") {
        return `${col} = $${i + 1}::jsonb`;
      }
      return `${col} = $${i + 1}`;
    });
    const { rows } = await pool.query(
      `UPDATE supabase.vrms SET ${sets.join(", ")} WHERE id = $${cols.length + 1}
       RETURNING id`,
      [...values, existing[0].id]
    );
    return { action: "updated" as const, vrms_id: rows[0]?.id };
  }

  const { rows: maxRows } = await pool.query(
    `SELECT COALESCE(MAX(id::bigint), 0)::bigint + 1 AS next_id FROM supabase.vrms`
  );
  const nextId = String(maxRows[0]?.next_id || Date.now());
  const placeholders = cols.map((col, i) =>
    col === "destination_slugs" || col === "favorites_json" ? `$${i + 2}::jsonb` : `$${i + 2}`
  );
  const { rows } = await pool.query(
    `INSERT INTO supabase.vrms (id, ${cols.join(", ")}, created_at, imported_at)
     VALUES ($1, ${placeholders.join(", ")}, NOW(), NOW())
     RETURNING id`,
    [nextId, ...values]
  );
  return { action: "created" as const, vrms_id: rows[0]?.id };
}

async function upsertRemoteVrms(payload: Record<string, any>, neonId?: string | number) {
  if (!hasRemoteSupabase()) {
    return { skipped: true as const, reason: "no remote supabase" };
  }

  const remotePayload = {
    ...payload,
    destination_slugs: payload.destination_slugs
      ? JSON.stringify(payload.destination_slugs)
      : null,
    favorites_json: payload.favorites_json ?? null,
  };

  const existing = await supabaseRest(
    `vrms?or=(partner_name.eq.${encodeURIComponent(payload.partner_name)},slug.eq.${encodeURIComponent(payload.slug)})&select=id&limit=5`
  );
  const match = Array.isArray(existing) ? existing[0] : null;
  if (match?.id != null) {
    const patched = await supabaseRest(`vrms?id=eq.${encodeURIComponent(String(match.id))}`, {
      method: "PATCH",
      body: JSON.stringify(remotePayload),
    });
    return { skipped: false as const, action: "updated" as const, id: match.id, row: patched };
  }

  const id = neonId != null ? Number(neonId) || neonId : undefined;
  const created = await supabaseRest("vrms", {
    method: "POST",
    body: JSON.stringify({
      ...(id != null ? { id } : {}),
      ...remotePayload,
      created_at: new Date().toISOString(),
    }),
  });
  return { skipped: false as const, action: "created" as const, row: created };
}

export async function handleSyncPartnerProfileToVrms(req: any, res: any, body: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const { profile, partner } = await loadProfileAndPartner(body);
  if (!profile) {
    json(res, 404, { error: "PartnerProfile not found" });
    return;
  }
  if (!partner?.partner_name && !profile.company_name && !profile.partner_name) {
    json(res, 404, { error: "Partner not found for profile" });
    return;
  }

  const payload = buildVrmsPayload(profile, partner);
  if (!payload.partner_name) {
    json(res, 400, { error: "partner_name required" });
    return;
  }

  const neon = await upsertNeonVrms(payload);
  let remote: any = { skipped: true };
  try {
    remote = await upsertRemoteVrms(payload, neon.vrms_id);
  } catch (error: any) {
    console.warn("[syncPartnerProfileToVrms] remote failed:", error?.message || error);
    remote = { skipped: false, error: error?.message || String(error) };
  }

  json(res, 200, {
    action: neon.action,
    vrms_id: neon.vrms_id,
    favorites: Boolean(payload.favorites_json),
    destination_slug: payload.first_destination_slug,
    remote,
  });
}
