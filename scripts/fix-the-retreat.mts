/**
 * One-shot repair: merge The Retreat duplicates and republish.
 *
 * Keeper:  1a1a225c9c1b5f83684  (original Active record with rich copy + address)
 * Duplicate: 1a1c713bc931d2299c3 (null-status stub that overwrote the public row to draft)
 * Public:  1793721747988
 *
 * Run: node --import tsx scripts/fix-the-retreat.mts
 */
import pg from "pg";
import { hasRemoteSupabase, supabaseRest } from "../server/supabase-remote.ts";

const KEEPER_ID = "1a1a225c9c1b5f83684";
const DUPLICATE_ID = "1a1c713bc931d2299c3";
const PUBLIC_ID = "1793721747988";

const ORIGINAL_PHOTOS = [
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Beachside-View.png",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Pool-View.png",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Greatroom.jpg",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Pool-Louvres.jpg",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Beachside-Night.png",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Outdoor-Dining.png",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Kitchen.jpg",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Kitchen-Atrium.png",
  "https://hummingbirdluxury.com/wp-content/uploads/2026/06/Atrium-Deck.png",
];

const ALT = ORIGINAL_PHOTOS.map(
  (_, i) => `The Retreat, Turks and Caicos — photo ${i + 1}`
);

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

async function load(id: string) {
  const { rows } = await pool.query(`SELECT id, data FROM base44.property WHERE id = $1`, [id]);
  if (!rows[0]) throw new Error(`Property ${id} not found`);
  return rows[0];
}

async function patchProperty(id: string, patch: Record<string, unknown>) {
  await pool.query(
    `UPDATE base44.property
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
         updated_date = now()
     WHERE id = $1`,
    [id, JSON.stringify({ ...patch, updated_date: new Date().toISOString() })]
  );
}

async function main() {
  const keeper = await load(KEEPER_ID);
  const dup = await load(DUPLICATE_ID);
  console.log("Keeper before:", {
    status: keeper.data?.status,
    photos: (keeper.data?.photo_urls || []).length,
    sb: keeper.data?.supabase_property_id,
  });
  console.log("Duplicate before:", {
    status: dup.data?.status,
    photos: (dup.data?.photo_urls || []).length,
    sb: dup.data?.supabase_property_id,
  });

  // 1. Fix keeper: 9 original photos, Active + portal visible, stamp public id.
  await patchProperty(KEEPER_ID, {
    status: "active",
    portal_visible: true,
    photo_urls: ORIGINAL_PHOTOS,
    photo_alt_texts: ALT,
    supabase_property_id: PUBLIC_ID,
    market: "Turks and Caicos",
  });
  console.log("✓ Keeper set Active + 9 original photos");

  // 2. Detach + archive the duplicate so a future sync can't overwrite the public row again.
  await patchProperty(DUPLICATE_ID, {
    status: "inactive",
    portal_visible: false,
    supabase_property_id: null,
    admin_notes: `Duplicate of ${KEEPER_ID}. Detached ${new Date().toISOString()} after it overwrote the public The Retreat row to draft.`,
  });
  console.log("✓ Duplicate archived and detached from public id");

  // 3. Republish Neon public row.
  const { rows: afterKeeper } = await pool.query(
    `SELECT data FROM base44.property WHERE id = $1`,
    [KEEPER_ID]
  );
  const p = afterKeeper[0].data || {};
  const dest = String(p.market || "Turks and Caicos");
  const destSlug = slugify(dest);
  const propSlug = slugify(p.property_name || "The Retreat");
  const siteUrl = `/destinations/${destSlug}/${propSlug}`;
  const listingUrl = String(p.listing_url || p.vrm_url || "https://hummingbirdluxury.com/the-retreat/");

  const publicPatch: Record<string, unknown> = {
    name: "The Retreat",
    destination: dest,
    url: siteUrl,
    vrm_url: listingUrl,
    bedrooms: p.bedrooms != null ? Number(p.bedrooms) : 4,
    bathrooms: p.bathrooms != null ? String(p.bathrooms) : "8",
    occupancy: p.sleeps != null ? Number(p.sleeps) : 8,
    house_type: p.property_type || "house",
    partner_name: p.partner_name || "Hummingbird Luxury",
    partner_id: p.partner_id || "1a1a220ab383cb8a383",
    address: p.address || null,
    location_city: p.location_city || p.city || null,
    location_state: p.location_state || p.state || null,
    location_country: p.location_country || p.country || null,
    latitude: p.latitude != null ? Number(p.latitude) : null,
    longitude: p.longitude != null ? Number(p.longitude) : null,
    propdescription: p.description || p.text || null,
    excerpt: p.excerpt || p.short_summary || null,
    text: p.text || p.description || null,
    status: "active",
    active: true,
    portal_visible: true,
    onboarding_status: "complete",
    photography_status: "approved",
    images: JSON.stringify(ORIGINAL_PHOTOS),
    vrm_images: JSON.stringify(ORIGINAL_PHOTOS),
    property_image: ORIGINAL_PHOTOS[0],
    photo_count: "9",
  };

  const JSON_COLS = new Set([
    "images",
    "vrm_images",
    "propdescription",
    "categories",
    "prop_categories",
    "tags",
    "reviews",
  ]);
  const cols = Object.keys(publicPatch);
  const vals = cols.map((k) => {
    const v = publicPatch[k];
    if (!JSON_COLS.has(k)) return v;
    // jsonb columns need real JSON tokens — plain prose must be JSON-encoded.
    if (v == null) return null;
    if (typeof v === "string") {
      const t = v.trim();
      if (t.startsWith("{") || t.startsWith("[")) return t;
      return JSON.stringify(v);
    }
    return JSON.stringify(v);
  });
  const sets = cols
    .map((col, i) => {
      const param = `$${i + 2}`;
      if (JSON_COLS.has(col)) return `"${col}" = ${param}::jsonb`;
      return `"${col}" = ${param}`;
    })
    .join(", ");

  const { rows: neonRows } = await pool.query(
    `UPDATE supabase.propertiesbase44 SET ${sets}
     WHERE id = $1 OR row_id::text = $1
     RETURNING id, name, url, status, active, portal_visible, photo_count, destination`,
    [PUBLIC_ID, ...vals]
  );
  console.log("✓ Neon public row:", neonRows[0]);

  // 4. Dual-write classic Supabase (what the100collection.com reads).
  if (!hasRemoteSupabase()) {
    throw new Error("BASE44_SUPABASE_* credentials missing — cannot update the live site");
  }
  const remotePayload = {
    id: PUBLIC_ID,
    row_id: Number(PUBLIC_ID),
    name: "The Retreat",
    destination: dest,
    url: siteUrl,
    vrm_url: listingUrl,
    bedrooms: publicPatch.bedrooms,
    bathrooms: publicPatch.bathrooms,
    occupancy: publicPatch.occupancy,
    house_type: publicPatch.house_type,
    partner_name: publicPatch.partner_name,
    partner_id: publicPatch.partner_id,
    address: publicPatch.address,
    location_city: publicPatch.location_city,
    location_state: publicPatch.location_state,
    location_country: publicPatch.location_country,
    latitude: publicPatch.latitude,
    longitude: publicPatch.longitude,
    propdescription: publicPatch.propdescription,
    excerpt: publicPatch.excerpt,
    text: publicPatch.text,
    status: "active",
    active: true,
    portal_visible: true,
    onboarding_status: "complete",
    photography_status: "approved",
    images: ORIGINAL_PHOTOS,
    vrm_images: ORIGINAL_PHOTOS,
    property_image: ORIGINAL_PHOTOS[0],
    photo_count: "9",
  };

  const existing = await supabaseRest(
    `propertiesbase44?or=(id.eq.${PUBLIC_ID},row_id.eq.${PUBLIC_ID})&select=id,row_id,status,active,portal_visible,photo_count&limit=1`
  );
  console.log("Remote before:", existing?.[0] || existing);

  const patched = await supabaseRest(`propertiesbase44?id=eq.${PUBLIC_ID}`, {
    method: "PATCH",
    body: JSON.stringify(remotePayload),
  });
  console.log("✓ Remote Supabase patched:", Array.isArray(patched) ? patched[0] : patched);

  // Verify
  const verify = await supabaseRest(
    `propertiesbase44?id=eq.${PUBLIC_ID}&select=id,name,url,status,active,portal_visible,photo_count,destination`
  );
  console.log("Remote after:", verify?.[0] || verify);

  await pool.end();
  console.log("\nDone. Check https://the100collection.com/destinations/turks-and-caicos/the-retreat");
  console.log("CDN may still 307 for a minute — hard refresh or wait for cache.");
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
