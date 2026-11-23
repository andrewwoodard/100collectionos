/**
 * Push PartnerProfile branding + owner favorites onto Neon cms.vrms
 * (portal source of truth). Optionally mirrors to supabase.vrms for
 * transitional readers still on the old Neon mirror.
 */
import { getNeonPool, json, newId } from "./neon-db.js";
import { requireSession } from "./require-session.js";

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

async function upsertCmsVrms(payload: Record<string, any>) {
  const pool = getNeonPool();
  const { rows: existing } = await pool.query(
    `SELECT id FROM cms.vrms
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
    "show_properties",
    "onboarded",
    "is_onboarded",
    "source",
    "updated_at",
    "synced_at",
  ];

  // Map legacy showproperties → cms.show_properties
  const row = {
    ...payload,
    show_properties: payload.showproperties ?? payload.show_properties ?? true,
    synced_at: new Date().toISOString(),
  };

  const updateCols = cols.filter(
    (col) => col !== "main_image_url" || Object.prototype.hasOwnProperty.call(payload, "main_image_url")
  );

  const valuesFor = (useCols: string[]) =>
    useCols.map((col) => {
      if (col === "destination_slugs" || col === "favorites_json") {
        return row[col] == null ? null : JSON.stringify(row[col]);
      }
      return row[col] ?? null;
    });

  if (existing[0]?.id) {
    const values = valuesFor(updateCols);
    const sets = updateCols.map((col, i) => {
      if (col === "destination_slugs" || col === "favorites_json") {
        return `${col} = $${i + 1}::jsonb`;
      }
      return `${col} = $${i + 1}`;
    });
    const { rows } = await pool.query(
      `UPDATE cms.vrms SET ${sets.join(", ")} WHERE id = $${updateCols.length + 1}
       RETURNING id`,
      [...values, existing[0].id]
    );
    return { action: "updated" as const, vrms_id: rows[0]?.id };
  }

  const nextId = `vrm:${newId()}`;
  const insertCols = updateCols;
  const insertValues = valuesFor(insertCols);
  const placeholders = insertCols.map((col, i) =>
    col === "destination_slugs" || col === "favorites_json" ? `$${i + 2}::jsonb` : `$${i + 2}`
  );
  const { rows } = await pool.query(
    `INSERT INTO cms.vrms (id, ${insertCols.join(", ")}, created_at)
     VALUES ($1, ${placeholders.join(", ")}, NOW())
     RETURNING id`,
    [nextId, ...insertValues]
  );
  return { action: "created" as const, vrms_id: rows[0]?.id };
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

  const neon = await upsertCmsVrms(payload);

  json(res, 200, {
    action: neon.action,
    vrms_id: neon.vrms_id,
    favorites: Boolean(payload.favorites_json),
    destination_slug: payload.first_destination_slug,
    store: "cms.vrms",
  });
}
