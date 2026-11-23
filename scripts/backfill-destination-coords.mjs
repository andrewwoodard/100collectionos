/**
 * Ensure every cms.destinations row has latitude/longitude.
 * Prefer existing location_lat/location_lng, then Sanity destination.location.
 * Mirrors coords onto base44.destination for partner-market matching.
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

const PROJECT = process.env.SANITY_PROJECT_ID || "b2yibrs1";
const DATASET = process.env.SANITY_DATASET || "production";
const API_VERSION = process.env.SANITY_API_VERSION || "2021-10-21";
const token =
  process.env.SANITY_API_READ_TOKEN ||
  process.env.SANITY_READ_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_TOKEN ||
  "";
const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function sanityQuery(query) {
  if (!token) return [];
  const res = await fetch(
    `https://${PROJECT}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return data.result || [];
}

async function main() {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log("Loading Sanity destination locations…");
  const sanityDests = await sanityQuery(`*[_type == "destination"]{
    title,
    "slug": slug.current,
    "lat": location.lat,
    "lng": location.lng
  }`);
  const bySlug = new Map();
  const byTitle = new Map();
  for (const d of sanityDests) {
    if (d.lat == null || d.lng == null) continue;
    const lat = Number(d.lat);
    const lng = Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (d.slug) bySlug.set(slugify(d.slug), { lat, lng });
    if (d.title) byTitle.set(String(d.title).toLowerCase().trim(), { lat, lng });
  }
  console.log(`Sanity locations available: ${bySlug.size}`);

  const { rows: destinations } = await client.query(
    `SELECT id, name, slug, latitude, longitude, location_lat, location_lng, base44_destination_id
     FROM cms.destinations
     ORDER BY name`
  );

  let updated = 0;
  let skipped = 0;
  const stillMissing = [];

  for (const dest of destinations) {
    let lat =
      dest.latitude != null
        ? Number(dest.latitude)
        : dest.location_lat != null
          ? Number(dest.location_lat)
          : null;
    let lng =
      dest.longitude != null
        ? Number(dest.longitude)
        : dest.location_lng != null
          ? Number(dest.location_lng)
          : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const hit =
        bySlug.get(slugify(dest.slug)) ||
        byTitle.get(String(dest.name || "").toLowerCase().trim()) ||
        bySlug.get(slugify(dest.name));
      if (hit) {
        lat = hit.lat;
        lng = hit.lng;
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      stillMissing.push(dest.slug || dest.name || dest.id);
      skipped += 1;
      continue;
    }

    const needsUpdate =
      dest.latitude == null ||
      dest.longitude == null ||
      dest.location_lat == null ||
      dest.location_lng == null ||
      Number(dest.latitude) !== lat ||
      Number(dest.longitude) !== lng;

    if (!needsUpdate) {
      skipped += 1;
      continue;
    }

    await client.query(
      `UPDATE cms.destinations
       SET latitude = $2,
           longitude = $3,
           location_lat = COALESCE(location_lat, $2),
           location_lng = COALESCE(location_lng, $3),
           updated_at = now(),
           synced_at = now()
       WHERE id = $1`,
      [dest.id, lat, lng]
    );

    // Mirror onto Base44 destination entity when linked / matched by name
    const base44Id = dest.base44_destination_id;
    if (base44Id) {
      await client.query(
        `UPDATE base44.destination
         SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
             updated_date = now()
         WHERE id = $1`,
        [
          base44Id,
          JSON.stringify({
            latitude: lat,
            longitude: lng,
            updated_date: new Date().toISOString(),
          }),
        ]
      );
    } else if (dest.name) {
      await client.query(
        `UPDATE base44.destination
         SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
             updated_date = now()
         WHERE lower(data->>'name') = lower($1)
            OR data->>'slug' = $3`,
        [
          dest.name,
          JSON.stringify({
            latitude: lat,
            longitude: lng,
            updated_date: new Date().toISOString(),
          }),
          dest.slug || slugify(dest.name),
        ]
      );
    }

    updated += 1;
    console.log(`✓ ${dest.slug || dest.name}: ${lat}, ${lng}`);
  }

  const { rows: summary } = await client.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::int AS with_coords
    FROM cms.destinations
  `);
  console.log(`\nUpdated ${updated}. Still missing: ${stillMissing.length}`);
  if (stillMissing.length) console.log("Missing:", stillMissing.join(", "));
  console.log(`Coverage: ${summary[0].with_coords}/${summary[0].total}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
