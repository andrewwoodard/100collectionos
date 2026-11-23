/**
 * Create cms.destinations / cms.vrms / cms.properties and backfill from
 * Sanity + existing Neon supabase/base44 mirrors.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  process.exit(1);
}

const PROJECT = process.env.SANITY_PROJECT_ID || "b2yibrs1";
const DATASET = process.env.SANITY_DATASET || "production";
const API_VERSION = process.env.SANITY_API_VERSION || "2021-10-21";
const sanityToken =
  process.env.SANITY_API_READ_TOKEN ||
  process.env.SANITY_READ_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_TOKEN ||
  "";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return null;
  const text = blocks
    .map((block) => {
      if (block?._type === "block" && Array.isArray(block.children)) {
        return block.children.map((c) => c?.text || "").join("");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
  return text || null;
}

function imageUrl(img) {
  return img?.asset?.url || img?.url || null;
}

async function sanityQuery(query) {
  if (!sanityToken) throw new Error("SANITY_API_READ_TOKEN is not configured");
  const res = await fetch(
    `https://${PROJECT}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${sanityToken}`, Accept: "application/json" } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return data.result;
}

const JSONB_COLS = new Set([
  "months", "body_json", "main_image_json", "map_image_json", "footer_image_json",
  "slider_images_json", "category_titles", "destination_type_titles", "experience_titles",
  "categories_json", "destination_types_json", "experiences_json", "destination_slugs",
  "doyentext_json", "favorites_json", "showcase_json", "services_offered_json",
  "services_available_json", "services_offered_picks_json", "awards_json", "gallery_json",
  "categories_json", "destinations_json", "video_json", "doyen_image_json", "logo_image_json",
  "main_image_json", "images", "vrm_images", "photo_urls", "photo_alt_texts", "amenities",
  "filtered_amenities", "categories", "prop_categories", "tags", "reviews", "propdescription",
  "showcase_images_json",
]);

function normalizeJsonb(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      JSON.parse(trimmed); // validate
      return trimmed; // pass valid JSON text so node-pg doesn't treat arrays as PG arrays
    } catch {
      return null;
    }
  }
  // Always stringify objects/arrays — node-pg otherwise binds JS arrays as Postgres arrays.
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function prepareRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (JSONB_COLS.has(k)) out[k] = normalizeJsonb(v);
    else out[k] = v;
  }
  return out;
}

async function upsert(client, table, row, conflictCol = "id") {
  const prepared = prepareRow(row);
  const keys = Object.keys(prepared);
  if (!keys.length) return;
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const updates = keys
    .filter((k) => k !== conflictCol)
    .map((k) => `"${k}" = EXCLUDED."${k}"`)
    .join(", ");
  await client.query(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders})
     ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`,
    keys.map((k) => prepared[k])
  );
}

async function main() {
  const sql = readFileSync(join(root, "scripts/sql/create-cms-content-tables.sql"), "utf8");
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log("Applying cms schema DDL…");
  // Recreate tables so constraint changes apply cleanly on re-runs
  await client.query(`DROP TABLE IF EXISTS cms.properties CASCADE`);
  await client.query(`DROP TABLE IF EXISTS cms.vrms CASCADE`);
  await client.query(`DROP TABLE IF EXISTS cms.destinations CASCADE`);
  await client.query(sql);

  // ── Destinations: merge Base44 + supabase jsonb + Sanity ───────────────
  console.log("Backfilling cms.destinations…");
  const { rows: baseDests } = await client.query(
    `SELECT id, data FROM base44.destination`
  );
  const { rows: sbDests } = await client.query(
    `SELECT id, data FROM supabase.destinations`
  );
  const sanityDests = await sanityQuery(`*[_type=="destination"]{
    _id, _rev, _createdAt, _updatedAt,
    title, "slug": slug.current,
    SEOtitle, SEOdescription,
    destinationshortdescription, areadescriptor, area, region, states,
    seasoninfo, months, temporaryvrmurl, videoUrl, destinationnoton,
    location, body,
    mainImage, mapImage, footerImage, sliderImages,
    categories, destinationtypes, experiences,
    "mainImageUrl": mainImage.asset->url,
    "mainImageAlt": mainImage.alttext,
    "mapImageUrl": mapImage.asset->url,
    "footerImageUrl": footerImage.asset->url,
    "sliderImagesResolved": sliderImages[]{ "url": slideImage.asset->url, _key },
    "categoryTitles": categories[]->title,
    "typeTitles": destinationtypes[]->title,
    "experienceTitles": experiences[]->title
  }`);

  const destBySlug = new Map();
  const destByName = new Map();

  for (const row of baseDests) {
    const d = row.data || {};
    const slug = d.slug || slugify(d.name);
    const id = `base44:${row.id}`;
    const mapped = {
      id,
      base44_destination_id: row.id,
      name: d.name || null,
      slug: slug || null,
      is_exclusive: !!d.is_exclusive,
      geocode_query: d.geocode_query || null,
      latitude: d.latitude != null ? Number(d.latitude) : null,
      longitude: d.longitude != null ? Number(d.longitude) : null,
      created_at: d.created_date || null,
      updated_at: d.updated_date || null,
      synced_at: new Date().toISOString(),
      source: "base44",
    };
    await upsert(client, "cms.destinations", mapped);
    if (slug) destBySlug.set(slug, id);
    if (d.name) destByName.set(String(d.name).toLowerCase(), id);
  }

  for (const row of sbDests) {
    const d = row.data || {};
    const slug = d.slug || slugify(d.name);
    const existingId =
      (d.base44_destination_id && `base44:${d.base44_destination_id}`) ||
      (slug && destBySlug.get(slug)) ||
      (d.name && destByName.get(String(d.name).toLowerCase())) ||
      `supabase:${row.id}`;
    const mapped = {
      id: existingId,
      supabase_destination_id: String(d.id || row.id),
      base44_destination_id: d.base44_destination_id || null,
      name: d.name || null,
      slug: slug || null,
      is_exclusive: d.is_exclusive != null ? !!d.is_exclusive : null,
      latitude: d.latitude != null ? Number(d.latitude) : null,
      longitude: d.longitude != null ? Number(d.longitude) : null,
      created_at: d.created_at || null,
      updated_at: d.updated_at || null,
      synced_at: new Date().toISOString(),
      source: "supabase+base44",
    };
    // only set non-null fields via upsert of full row merge
    const { rows: existing } = await client.query(
      `SELECT * FROM cms.destinations WHERE id = $1`,
      [existingId]
    );
    await upsert(client, "cms.destinations", { ...(existing[0] || { id: existingId }), ...Object.fromEntries(Object.entries(mapped).filter(([, v]) => v != null)) });
    if (slug) destBySlug.set(slug, existingId);
  }

  for (const d of sanityDests || []) {
    const slug = d.slug || slugify(d.title);
    const existingId =
      (slug && destBySlug.get(slug)) ||
      (d.title && destByName.get(String(d.title).toLowerCase())) ||
      `sanity:${d._id}`;
    const { rows: existing } = await client.query(
      `SELECT * FROM cms.destinations WHERE id = $1 OR sanity_id = $2 LIMIT 1`,
      [existingId, d._id]
    );
    const base = existing[0] || { id: existingId };
    const mapped = {
      ...base,
      id: base.id || existingId,
      title: d.title || base.title || null,
      slug: slug || base.slug || null,
      name: base.name || d.title || null,
      seo_title: d.SEOtitle || null,
      seo_description: d.SEOdescription || null,
      short_description: d.destinationshortdescription || null,
      area_descriptor: d.areadescriptor || null,
      area: d.area || null,
      region: d.region || null,
      states: d.states || null,
      season_info: d.seasoninfo || null,
      months: d.months || null,
      temporary_vrm_url: d.temporaryvrmurl || null,
      video_url: d.videoUrl || null,
      destination_not_on: d.destinationnoton ?? null,
      location_lat: d.location?.lat ?? null,
      location_lng: d.location?.lng ?? null,
      // Portal map pins use latitude/longitude; keep them in sync with Sanity location.
      latitude: d.location?.lat ?? base.latitude ?? null,
      longitude: d.location?.lng ?? base.longitude ?? null,
      body_json: d.body || null,
      body_text: blocksToText(d.body),
      main_image_url: d.mainImageUrl || null,
      main_image_alt: d.mainImageAlt || null,
      map_image_url: d.mapImageUrl || null,
      footer_image_url: d.footerImageUrl || null,
      main_image_json: d.mainImage || null,
      map_image_json: d.mapImage || null,
      footer_image_json: d.footerImage || null,
      slider_images_json: d.sliderImagesResolved || d.sliderImages || null,
      category_titles: d.categoryTitles || null,
      destination_type_titles: d.typeTitles || null,
      experience_titles: d.experienceTitles || null,
      categories_json: d.categories || null,
      destination_types_json: d.destinationtypes || null,
      experiences_json: d.experiences || null,
      sanity_id: d._id,
      sanity_rev: d._rev || null,
      sanity_created_at: d._createdAt || null,
      sanity_updated_at: d._updatedAt || null,
      synced_at: new Date().toISOString(),
      source: base.source ? `${base.source}+sanity` : "sanity",
    };
    await upsert(client, "cms.destinations", mapped);
  }

  // ── VRMs: merge supabase.vrms + Sanity ─────────────────────────────────
  console.log("Backfilling cms.vrms…");
  const { rows: sbVrms } = await client.query(`SELECT * FROM supabase.vrms`);
  const sanityVrms = await sanityQuery(`*[_type=="vrm"]{
    _id, _rev, _createdAt, _updatedAt,
    title, "slug": slug.current,
    doyenName, doyenTitle, doyenneordoyen, doyenshortdescription, doyentext,
    attributeone, attributetwo, bedrooms, price, propclass, unitcount,
    videoUrl, vrmEmail, vrmPhone, vrmUrl, vrmnoton, publishedAt, showproperties,
    body, favorites, showcase, awards, gallery, sliderImages,
    servicesavailable, servicesoffered, servicesofferedpick,
    categories, destinations,
    doyenImage, logoImage, mainImage, video,
    "doyenImageUrl": doyenImage.asset->url,
    "logoImageUrl": logoImage.asset->url,
    "mainImageUrl": mainImage.asset->url,
    "galleryResolved": gallery[]{ _key, "url": galleryImage.asset->url },
    "sliderResolved": sliderImages[]{ _key, "url": slideImage.asset->url }
  }`);

  const vrmBySlug = new Map();
  const vrmBySanity = new Map();

  for (const v of sbVrms) {
    const id = `supabase:${v.id}`;
    const mapped = {
      id,
      source_id: v.source_id,
      name: v.name,
      slug: v.slug,
      title: v.title,
      partner_name: v.partner_name,
      email: v.email,
      phone: v.phone,
      vrm_email: v.vrm_email,
      vrm_phone: v.vrm_phone,
      vrm_url: v.vrm_url,
      website: v.website,
      source: v.source || "supabase",
      first_destination_slug: v.first_destination_slug,
      destination_slugs: v.destination_slugs,
      unit_count: v.unit_count,
      onboarded: v.onboarded,
      is_onboarded: v.is_onboarded,
      show_properties: v.showproperties,
      doyen_name: v.doyen_name,
      doyen_title: v.doyen_title,
      doyen_short_description: v.doyen_short_description,
      doyen_text: v.doyen_text,
      doyen_image_url: v.doyen_image_url,
      logo_image_url: v.logo_image_url,
      main_image_url: v.main_image_url,
      body_json: v.body_json,
      body_text: blocksToText(normalizeJsonb(v.body_json)),
      doyentext_json: v.doyentext_json,
      favorites_json: v.favorites_json,
      showcase_json: v.showcase_json,
      services_offered_json: v.servicesoffered_json,
      services_available_json: v.servicesavailable_json,
      services_offered_picks_json: v.serviceofferedpicks_json,
      last_header_ok: v.last_header_ok,
      last_header_has_link: v.last_header_has_link,
      last_header_status: v.last_header_status,
      last_header_error: v.last_header_error,
      last_header_final_url: v.last_header_final_url,
      last_header_checked_at: v.last_header_checked_at,
      last_trademark_ok: v.last_trademark_ok,
      last_trademark_status: v.last_trademark_status,
      last_trademark_error: v.last_trademark_error,
      last_trademark_final_url: v.last_trademark_final_url,
      last_trademark_checked_at: v.last_trademark_checked_at,
      sanity_id: v.sanity_id || v.sanity_vrm_id || null,
      sanity_vrm_id: v.sanity_vrm_id,
      sanity_created_at: v.sanity_created_at,
      sanity_updated_at: v.sanity_updated_at,
      created_at: v.created_at,
      updated_at: v.updated_at,
      synced_at: new Date().toISOString(),
    };
    await upsert(client, "cms.vrms", mapped);
    if (v.slug) vrmBySlug.set(v.slug, id);
    if (mapped.sanity_id) vrmBySanity.set(mapped.sanity_id, id);
  }

  for (const v of sanityVrms || []) {
    const existingId =
      vrmBySanity.get(v._id) ||
      (v.slug && vrmBySlug.get(v.slug)) ||
      `sanity:${v._id}`;
    const { rows: existing } = await client.query(
      `SELECT * FROM cms.vrms WHERE id = $1 OR sanity_id = $2 LIMIT 1`,
      [existingId, v._id]
    );
    const base = existing[0] || { id: existingId };
    const mapped = {
      ...base,
      id: base.id || existingId,
      slug: v.slug || base.slug || null,
      title: v.title || base.title || null,
      name: base.name || v.title || null,
      doyen_name: v.doyenName || base.doyen_name || null,
      doyen_title: v.doyenTitle || base.doyen_title || null,
      doyen_or_doyenne: v.doyenneordoyen || null,
      doyen_short_description: v.doyenshortdescription || base.doyen_short_description || null,
      doyen_text: base.doyen_text || blocksToText(v.doyentext),
      doyen_image_url: v.doyenImageUrl || base.doyen_image_url || null,
      logo_image_url: v.logoImageUrl || base.logo_image_url || null,
      main_image_url: v.mainImageUrl || base.main_image_url || null,
      attribute_one: v.attributeone || null,
      attribute_two: v.attributetwo || null,
      bedrooms: v.bedrooms || null,
      price: v.price || null,
      prop_class: v.propclass || null,
      unit_count: v.unitcount ?? base.unit_count ?? null,
      video_url: v.videoUrl || null,
      vrm_email: v.vrmEmail || base.vrm_email || null,
      vrm_phone: v.vrmPhone || base.vrm_phone || null,
      vrm_url: v.vrmUrl || base.vrm_url || null,
      vrm_not_on: v.vrmnoton ?? null,
      published_at: v.publishedAt || null,
      show_properties: v.showproperties ?? base.show_properties ?? null,
      body_json: v.body || base.body_json || null,
      body_text: blocksToText(v.body) || base.body_text || null,
      doyentext_json: v.doyentext || base.doyentext_json || null,
      favorites_json: v.favorites || base.favorites_json || null,
      showcase_json: v.showcase || base.showcase_json || null,
      awards_json: v.awards || null,
      gallery_json: v.galleryResolved || v.gallery || null,
      slider_images_json: v.sliderResolved || v.sliderImages || null,
      services_offered_json: v.servicesoffered || base.services_offered_json || null,
      services_available_json: v.servicesavailable || base.services_available_json || null,
      services_offered_picks_json: v.servicesofferedpick || base.services_offered_picks_json || null,
      categories_json: v.categories || null,
      destinations_json: v.destinations || null,
      video_json: v.video || null,
      doyen_image_json: v.doyenImage || null,
      logo_image_json: v.logoImage || null,
      main_image_json: v.mainImage || null,
      sanity_id: v._id,
      sanity_vrm_id: base.sanity_vrm_id || v._id,
      sanity_rev: v._rev || null,
      sanity_created_at: v._createdAt || base.sanity_created_at || null,
      sanity_updated_at: v._updatedAt || base.sanity_updated_at || null,
      synced_at: new Date().toISOString(),
      source: base.source ? `${base.source}+sanity` : "sanity",
    };
    await upsert(client, "cms.vrms", mapped);
  }

  // ── Properties: merge base44.property + propertiesbase44 ───────────────
  console.log("Backfilling cms.properties…");
  const { rows: baseProps } = await client.query(`SELECT id, data FROM base44.property`);
  const { rows: sbProps } = await client.query(`SELECT * FROM supabase.propertiesbase44`);

  const propByBase44 = new Map();
  const propByUrl = new Map();

  for (const row of baseProps) {
    const p = row.data || {};
    const id = `base44:${row.id}`;
    const mapped = {
      id,
      base44_property_id: row.id,
      supabase_property_id: p.supabase_property_id ? String(p.supabase_property_id) : null,
      name: p.name || p.property_name || null,
      property_name: p.property_name || p.name || null,
      listing_url: p.listing_url || null,
      vrm_url: p.vrm_url || null,
      url: p.listing_url || p.vrm_url || null,
      hundred_collection_url: p.hundred_collection_url || null,
      partner_id: p.partner_id || null,
      partner_name: p.partner_name || null,
      destination: p.destination || p.market || null,
      market: p.market || null,
      address: p.address || null,
      location_full: p.location_full || null,
      location_city: p.location_city || null,
      location_state: p.location_state || null,
      location_country: p.location_country || null,
      latitude: p.latitude != null ? Number(p.latitude) : null,
      longitude: p.longitude != null ? Number(p.longitude) : null,
      bedrooms: p.bedrooms != null ? String(p.bedrooms) : null,
      bathrooms: p.bathrooms != null ? String(p.bathrooms) : null,
      half_bathrooms: p.half_bathrooms != null ? String(p.half_bathrooms) : null,
      sleeps: p.sleeps != null ? String(p.sleeps) : null,
      occupancy: p.sleeps != null ? String(p.sleeps) : null,
      house_type: p.property_type || null,
      property_type: p.property_type || null,
      pet_friendly: p.pet_friendly != null ? String(p.pet_friendly) : null,
      status: p.status || null,
      active: p.active ?? null,
      portal_visible: p.portal_visible ?? null,
      onboarding_status: p.onboarding_status || null,
      photography_status: p.photography_status || null,
      launch_date: p.launch_date || null,
      termination_date: p.termination_date || null,
      headline: p.headline || null,
      excerpt: p.excerpt || null,
      short_summary: p.short_summary || null,
      text: p.text || null,
      description: p.description || null,
      unique_feature: p.unique_feature || null,
      unique_features: p.unique_features || null,
      why_onehundred: p.why_onehundred || null,
      why_100_collection: p.why_100_collection || null,
      best_fit_guest: p.best_fit_guest || null,
      design_style_notes: p.design_style_notes || null,
      photo_urls: p.photo_urls || null,
      photo_alt_texts: p.photo_alt_texts || null,
      amenities: p.amenities || null,
      filtered_amenities: p.filtered_amenities || null,
      tags: p.tags || null,
      internal_notes: p.internal_notes || null,
      archived_at: p.archived_at || null,
      archived_by_user_id: p.archived_by_user_id || null,
      offboarding_status: p.offboarding_status || null,
      offboarding_reason: p.offboarding_reason || null,
      offboarding_initiated_at: p.offboarding_initiated_at || null,
      offboarding_initiated_by: p.offboarding_initiated_by || null,
      offboarding_approved_at: p.offboarding_approved_at || null,
      offboarding_approved_by: p.offboarding_approved_by || null,
      created_at: p.created_date || null,
      updated_at: p.updated_date || null,
      synced_at: new Date().toISOString(),
      source: "base44",
    };
    await upsert(client, "cms.properties", mapped);
    propByBase44.set(row.id, id);
    const url = mapped.url || mapped.vrm_url;
    if (url) propByUrl.set(String(url).toLowerCase(), id);
  }

  for (const p of sbProps) {
    const url = (p.url || p.vrm_url || "").toLowerCase();
    const existingId =
      (p.id && propByBase44.get(String(p.id))) ||
      (url && propByUrl.get(url)) ||
      `supabase:${p.id || p.row_id}`;
    const { rows: existing } = await client.query(
      `SELECT * FROM cms.properties WHERE id = $1 LIMIT 1`,
      [existingId]
    );
    const base = existing[0] || { id: existingId };
    const mapped = {
      ...base,
      id: base.id || existingId,
      row_id: p.row_id ?? base.row_id ?? null,
      source_id: p.source_id || base.source_id || null,
      supabase_property_id: String(p.id || p.row_id),
      name: p.name || base.name || null,
      property_name: base.property_name || p.name || null,
      url: p.url || base.url || null,
      vrm_url: p.vrm_url || base.vrm_url || null,
      listing_url: base.listing_url || p.url || p.vrm_url || null,
      partner_id: p.partner_id || base.partner_id || null,
      partner_name: p.partner_name || base.partner_name || null,
      destination: p.destination || base.destination || null,
      address: p.address || base.address || null,
      location_city: p.location_city || base.location_city || null,
      location_state: p.location_state || base.location_state || null,
      location_country: p.location_country || base.location_country || null,
      latitude: p.latitude ?? base.latitude ?? null,
      longitude: p.longitude ?? base.longitude ?? null,
      bedrooms: p.bedrooms || base.bedrooms || null,
      bathrooms: p.bathrooms || base.bathrooms || null,
      half_bathrooms: p.half_bathrooms || base.half_bathrooms || null,
      occupancy: p.occupancy || base.occupancy || null,
      house_type: p.house_type || base.house_type || null,
      property_type: base.property_type || p.house_type || null,
      pet_friendly: p.pet_friendly || base.pet_friendly || null,
      pet_policy_url: p.pet_policy_url || null,
      status: p.status || base.status || null,
      active: p.active ?? base.active ?? null,
      portal_visible: p.portal_visible ?? base.portal_visible ?? null,
      onboarding_status: p.onboarding_status || base.onboarding_status || null,
      photography_status: p.photography_status || base.photography_status || null,
      launch_date: p.launch_date || base.launch_date || null,
      removal_date: p.removal_date || null,
      last_scan: p.last_scan || null,
      headline: p.headline || base.headline || null,
      excerpt: p.excerpt || base.excerpt || null,
      text: p.text || base.text || null,
      unique_feature: p.unique_feature || base.unique_feature || null,
      why_onehundred: p.why_onehundred || base.why_onehundred || null,
      best_fit_guest: p.best_fit_guest || base.best_fit_guest || null,
      designed_by: p.designed_by || null,
      designer_name: p.designer_name || null,
      design_style_notes: p.design_style_notes || base.design_style_notes || null,
      property_source: p.property_source || null,
      property_html: p.property_html || null,
      ai_search: p.ai_search || null,
      ai_fit_score: p.ai_fit_score || null,
      photo_count: p.photo_count || null,
      property_image: p.property_image || null,
      video_url: p.video_url || null,
      images: p.images || base.images || null,
      vrm_images: p.vrm_images || null,
      categories: p.categories || null,
      prop_categories: p.prop_categories || null,
      tags: p.tags || base.tags || null,
      reviews: p.reviews || null,
      propdescription: p.propdescription || null,
      filtered_amenities: p.filtered_amenities || base.filtered_amenities || null,
      last_page_check_at: p.last_page_check_at || null,
      last_page_check_ok: p.last_page_check_ok || null,
      last_page_check_status: p.last_page_check_status || null,
      last_page_check_error: p.last_page_check_error || null,
      last_page_check_final_url: p.last_page_check_final_url || null,
      created_at: p.created_at || base.created_at || null,
      synced_at: new Date().toISOString(),
      source: base.source ? `${base.source}+supabase` : "supabase",
    };
    await upsert(client, "cms.properties", mapped);
  }

  // Report
  const { rows: tables } = await client.query(`
    SELECT c.relname AS table_name,
           (SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'cms' AND table_name = c.relname) AS column_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'cms' AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  console.log("\n=== New tables in schema cms ===");
  for (const t of tables) {
    const { rows: counts } = await client.query(`SELECT count(*)::int AS n FROM cms.${t.table_name}`);
    console.log(`cms.${t.table_name}  —  ${t.column_count} columns, ${counts[0].n} rows`);
    const { rows: cols } = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'cms' AND table_name = $1
       ORDER BY ordinal_position`,
      [t.table_name]
    );
    console.log(cols.map((c) => `  ${c.column_name} ${c.data_type}`).join("\n"));
    console.log("");
  }

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
