/**
 * Pull Sanity destination main images into Vercel Blob and store alt text
 * on cms.destinations.main_image_alt (prefer Sanity mainImage.alttext).
 *
 * Usage: node scripts/backfill-destination-main-images.mjs [--dry-run] [--limit=N]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";
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
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const MAX_BYTES = 15 * 1024 * 1024;
const CONCURRENCY = 3;

if (!dbUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!token) {
  console.error("SANITY_API_READ_TOKEN is required");
  process.exit(1);
}
if (!blobToken && !dryRun) {
  console.error("BLOB_READ_WRITE_TOKEN is required");
  process.exit(1);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSanityCdn(url) {
  return /cdn\.sanity\.io/i.test(String(url || ""));
}

function isVercelBlob(url) {
  return /blob\.vercel-storage\.com/i.test(String(url || ""));
}

function buildAlt({ alttext, title, name, states, area }) {
  const fromSanity = String(alttext || "").trim();
  if (fromSanity) return fromSanity;
  const place = String(title || name || "this destination").trim();
  const locParts = [states, area]
    .map((v) => String(v || "").trim())
    .filter((v) => v && v.toUpperCase() !== "USA");
  if (locParts.length) return `Scenic view of ${place}, ${locParts.join(", ")}`;
  return `Scenic view of ${place}`;
}

function sanityFetchUrl(url) {
  // Downscale large originals so uploads stay under Blob size limits.
  const base = String(url || "").split("?")[0];
  return `${base}?w=2400&q=80&fit=max&auto=format`;
}

function sniffImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer.length >= 6) {
    const gif = buffer.toString("ascii", 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function extForType(contentType) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return map[contentType] || "jpg";
}

async function sanityQuery(query) {
  const res = await fetch(
    `https://${PROJECT}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return data.result || [];
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "100CollectionDestImageMigrate/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error("empty image");
  if (buffer.length > MAX_BYTES) throw new Error(`image too large (${buffer.length})`);
  const headerType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const contentType = headerType.startsWith("image/") ? headerType : sniffImageType(buffer);
  return { buffer, contentType };
}

async function uploadToBlob({ buffer, contentType, slug }) {
  const ext = extForType(contentType);
  const hash = createHash("sha1").update(buffer).digest("hex").slice(0, 10);
  const safeSlug = slugify(slug) || "destination";
  const pathname = `destinations/${safeSlug}-main-${hash}.${ext}`;
  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token: blobToken,
  });
  return blob.url;
}

async function mapPool(items, concurrency, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log("Ensuring cms.destinations.main_image_alt…");
  await client.query(`
    ALTER TABLE cms.destinations
    ADD COLUMN IF NOT EXISTS main_image_alt text
  `);

  console.log("Loading Sanity destination main images…");
  const sanityDests = await sanityQuery(`*[_type == "destination" && defined(mainImage.asset) && !(_id in path("drafts.**"))]{
    _id,
    title,
    "slug": slug.current,
    area,
    region,
    states,
    "alttext": mainImage.alttext,
    "mainImageUrl": mainImage.asset->url
  }`);

  const bySlug = new Map();
  const byTitle = new Map();
  for (const d of sanityDests) {
    const slug = slugify(d.slug || d.title);
    if (slug) bySlug.set(slug, d);
    if (d.title) byTitle.set(String(d.title).toLowerCase().trim(), d);
  }
  console.log(`Sanity destinations with mainImage: ${sanityDests.length}`);

  const { rows: destinations } = await client.query(`
    SELECT id, name, slug, title, area, region, states, main_image_url, main_image_alt, sanity_id
    FROM cms.destinations
    ORDER BY name
  `);

  let candidates = destinations.filter((d) => {
    const url = d.main_image_url;
    const hit =
      bySlug.get(slugify(d.slug)) ||
      byTitle.get(String(d.name || "").toLowerCase().trim()) ||
      bySlug.get(slugify(d.name));
    return Boolean(url || hit?.mainImageUrl);
  });
  if (Number.isFinite(limit) && limit > 0) candidates = candidates.slice(0, limit);

  console.log(`Candidates: ${candidates.length}${dryRun ? " (dry-run)" : ""}`);

  let uploaded = 0;
  let altOnly = 0;
  let skipped = 0;
  let failed = 0;

  await mapPool(candidates, CONCURRENCY, async (dest) => {
    const sanity =
      bySlug.get(slugify(dest.slug)) ||
      byTitle.get(String(dest.name || "").toLowerCase().trim()) ||
      bySlug.get(slugify(dest.name)) ||
      null;

    const sourceUrl = isSanityCdn(dest.main_image_url)
      ? dest.main_image_url
      : sanity?.mainImageUrl || dest.main_image_url;

    const alt = buildAlt({
      alttext: sanity?.alttext,
      title: dest.title || sanity?.title,
      name: dest.name,
      states: dest.states || sanity?.states,
      area: dest.area || sanity?.area,
    });

    const needsUpload = sourceUrl && !isVercelBlob(dest.main_image_url);
    const needsAlt = !dest.main_image_alt || dest.main_image_alt !== alt;

    if (!needsUpload && !needsAlt) {
      skipped += 1;
      return;
    }

    try {
      let blobUrl = dest.main_image_url;
      if (needsUpload) {
        if (dryRun) {
          console.log(`[dry-run] would upload ${dest.slug || dest.name} ← ${sourceUrl}`);
        } else {
          const { buffer, contentType } = await downloadImage(sanityFetchUrl(sourceUrl));
          blobUrl = await uploadToBlob({
            buffer,
            contentType,
            slug: dest.slug || dest.name,
          });
          uploaded += 1;
          console.log(`✓ blob ${dest.slug || dest.name}`);
        }
      } else if (needsAlt) {
        altOnly += 1;
      }

      if (!dryRun) {
        await client.query(
          `UPDATE cms.destinations
           SET main_image_url = COALESCE($2, main_image_url),
               main_image_alt = $3,
               updated_at = now(),
               synced_at = now()
           WHERE id = $1`,
          [dest.id, needsUpload ? blobUrl : null, alt]
        );
      } else if (needsAlt && !needsUpload) {
        console.log(`[dry-run] would set alt for ${dest.slug || dest.name}: ${alt}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`✗ ${dest.slug || dest.name}:`, err?.message || err);
    }
  });

  const { rows: summary } = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE main_image_url IS NOT NULL AND main_image_url <> '')::int AS with_main,
      count(*) FILTER (WHERE main_image_url ILIKE '%cdn.sanity.io%')::int AS still_sanity,
      count(*) FILTER (WHERE main_image_url ILIKE '%blob.vercel-storage.com%')::int AS on_blob,
      count(*) FILTER (WHERE main_image_alt IS NOT NULL AND main_image_alt <> '')::int AS with_alt
    FROM cms.destinations
  `);

  console.log("\nDone.");
  console.log({ uploaded, altOnly, skipped, failed, dryRun });
  console.log("Coverage:", summary[0]);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
