/**
 * Migrate Sanity CDN images used by the live site into Vercel Blob, then
 * rewrite Neon cms.* URL fields (and VRM showcase imageUrls) so the portal
 * and public site serve Blob URLs.
 *
 * Usage:
 *   node scripts/migrate-sanity-images-to-blob.mjs [--dry-run] [--limit=N]
 *     [--only=destinations|vrms|showcase|properties|all]
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
loadEnvFile(join(root, "../hundred2024/.env.local"));
loadEnvFile(join(root, "../hundred2024/.env"));

const PROJECT = process.env.SANITY_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "b2yibrs1";
const DATASET = process.env.SANITY_DATASET || process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = (onlyArg?.split("=")[1] || "all").toLowerCase();

const MAX_BYTES = 15 * 1024 * 1024;
const CONCURRENCY = 4;

if (!dbUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!blobToken && !dryRun) {
  console.error("BLOB_READ_WRITE_TOKEN is required");
  process.exit(1);
}

function isSanityCdn(url) {
  return /cdn\.sanity\.io/i.test(String(url || ""));
}
function isVercelBlob(url) {
  return /blob\.vercel-storage\.com/i.test(String(url || ""));
}
function stripQuery(url) {
  return String(url || "").trim().split("?")[0].split("#")[0];
}
function sanityRefToUrl(ref) {
  const m = String(ref || "").match(/^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/i);
  if (!m) return null;
  return `https://cdn.sanity.io/images/${PROJECT}/${DATASET}/${m[1]}-${m[2]}.${m[3]}`;
}
function sanityFetchUrl(url) {
  const base = stripQuery(url);
  return `${base}?w=2400&q=80&fit=max&auto=format`;
}
function sniffImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
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
  return (
    {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
    }[contentType] || "jpg"
  );
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "100CollectionSanityToBlob/1.0",
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

/** Source-key → blob URL cache (in-memory for this run). */
const cache = new Map();
let uploaded = 0;
let reused = 0;
let failed = 0;

async function migrateUrl(sourceUrl, folder = "sanity-migrate") {
  const key = stripQuery(sourceUrl);
  if (!key) return null;
  if (isVercelBlob(key)) return key;
  if (!isSanityCdn(key) && !/^https?:\/\//i.test(key)) return null;
  if (cache.has(key)) {
    reused += 1;
    return cache.get(key);
  }
  if (dryRun) {
    const fake = `https://dry-run.blob.vercel-storage.com/${folder}/${createHash("sha1").update(key).digest("hex").slice(0, 10)}.jpg`;
    cache.set(key, fake);
    uploaded += 1;
    return fake;
  }
  const { buffer, contentType } = await downloadImage(
    isSanityCdn(key) ? sanityFetchUrl(key) : key
  );
  const hash = createHash("sha1").update(buffer).digest("hex").slice(0, 12);
  const ext = extForType(contentType);
  const pathname = `${folder}/${hash}.${ext}`;
  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token: blobToken,
  });
  cache.set(key, blob.url);
  uploaded += 1;
  if (uploaded % 25 === 0) console.log(`  … uploaded ${uploaded} (cache ${cache.size})`);
  return blob.url;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

function collectShowcaseImageUrls(item) {
  const out = [];
  const images = Array.isArray(item?.images) ? item.images : [];
  for (const img of images) {
    const ref = img?.galleryImage?.asset?._ref;
    const fromRef = sanityRefToUrl(ref);
    if (fromRef) out.push(fromRef);
    const direct =
      img?.url ||
      img?.galleryImage?.url ||
      img?.galleryImage?.asset?.url;
    if (typeof direct === "string" && /^https?:\/\//i.test(direct)) out.push(stripQuery(direct));
  }
  if (Array.isArray(item?.imageUrls)) {
    for (const u of item.imageUrls) {
      if (typeof u === "string" && /^https?:\/\//i.test(u)) out.push(stripQuery(u));
    }
  }
  return [...new Set(out)];
}

function rewriteStringUrl(value, mapped) {
  if (typeof value !== "string") return value;
  const key = stripQuery(value);
  if (mapped.has(key)) {
    // Preserve query string? Prefer clean blob URL.
    return mapped.get(key);
  }
  return value;
}

function rewriteJsonUrls(value, mapped) {
  if (value == null) return value;
  if (typeof value === "string") return rewriteStringUrl(value, mapped);
  if (Array.isArray(value)) return value.map((v) => rewriteJsonUrls(v, mapped));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteJsonUrls(v, mapped);
    return out;
  }
  return value;
}

async function migrateDestinations(client) {
  if (only !== "all" && only !== "destinations") return;
  console.log("\n== Destinations map/footer ==");
  const { rows } = await client.query(`
    SELECT id, slug, name, map_image_url, footer_image_url
    FROM cms.destinations
    WHERE map_image_url ILIKE '%cdn.sanity.io%'
       OR footer_image_url ILIKE '%cdn.sanity.io%'
    ORDER BY slug
  `);
  let list = rows;
  if (Number.isFinite(limit) && limit > 0) list = list.slice(0, limit);
  console.log(`rows: ${list.length}`);

  await mapPool(list, CONCURRENCY, async (row) => {
    try {
      const patch = {};
      if (isSanityCdn(row.map_image_url)) {
        patch.map_image_url = await migrateUrl(row.map_image_url, "destinations/map");
      }
      if (isSanityCdn(row.footer_image_url)) {
        patch.footer_image_url = await migrateUrl(row.footer_image_url, "destinations/footer");
      }
      if (!Object.keys(patch).length || dryRun) return;
      const keys = Object.keys(patch);
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
      await client.query(
        `UPDATE cms.destinations SET ${sets}, updated_at = now(), synced_at = now() WHERE id = $1`,
        [row.id, ...keys.map((k) => patch[k])]
      );
    } catch (err) {
      failed += 1;
      console.error(`✗ dest ${row.slug}:`, err?.message || err);
    }
  });
}

async function migrateVrmFlatImages(client) {
  if (only !== "all" && only !== "vrms") return;
  console.log("\n== VRM main / doyen / logo ==");
  const { rows } = await client.query(`
    SELECT id, partner_name, slug, main_image_url, doyen_image_url, logo_image_url
    FROM cms.vrms
    WHERE main_image_url ILIKE '%cdn.sanity.io%'
       OR doyen_image_url ILIKE '%cdn.sanity.io%'
       OR logo_image_url ILIKE '%cdn.sanity.io%'
    ORDER BY partner_name NULLS LAST
  `);
  let list = rows;
  if (Number.isFinite(limit) && limit > 0) list = list.slice(0, limit);
  console.log(`rows: ${list.length}`);

  await mapPool(list, CONCURRENCY, async (row) => {
    try {
      const patch = {};
      for (const col of ["main_image_url", "doyen_image_url", "logo_image_url"]) {
        if (isSanityCdn(row[col])) {
          patch[col] = await migrateUrl(row[col], `vrms/${col.replace("_image_url", "")}`);
        }
      }
      if (!Object.keys(patch).length || dryRun) return;
      const keys = Object.keys(patch);
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
      await client.query(
        `UPDATE cms.vrms SET ${sets}, updated_at = now(), synced_at = now() WHERE id = $1`,
        [row.id, ...keys.map((k) => patch[k])]
      );
      console.log(`✓ vrm ${row.partner_name || row.slug || row.id}`);
    } catch (err) {
      failed += 1;
      console.error(`✗ vrm ${row.partner_name || row.id}:`, err?.message || err);
    }
  });
}

async function migrateShowcase(client) {
  if (only !== "all" && only !== "showcase") return;
  console.log("\n== VRM showcase galleries → imageUrls (Blob) ==");
  const { rows } = await client.query(`
    SELECT id, partner_name, slug, showcase_json
    FROM cms.vrms
    WHERE showcase_json IS NOT NULL
      AND jsonb_typeof(showcase_json) = 'array'
      AND jsonb_array_length(showcase_json) > 0
    ORDER BY partner_name NULLS LAST
  `);
  let list = rows;
  if (Number.isFinite(limit) && limit > 0) list = list.slice(0, limit);
  console.log(`vrms: ${list.length}`);

  for (const row of list) {
    try {
      const showcase = typeof row.showcase_json === "string"
        ? JSON.parse(row.showcase_json)
        : row.showcase_json;
      if (!Array.isArray(showcase)) continue;

      let changed = false;
      const next = [];
      for (const item of showcase) {
        const sources = collectShowcaseImageUrls(item).filter(
          (u) => isSanityCdn(u) || !isVercelBlob(u)
        );
        // Prefer migrating only Sanity sources; keep existing blob imageUrls.
        const sanitySources = collectShowcaseImageUrls(item).filter((u) => isSanityCdn(u));
        const existingBlob = (Array.isArray(item.imageUrls) ? item.imageUrls : [])
          .map(stripQuery)
          .filter((u) => isVercelBlob(u));

        if (!sanitySources.length && existingBlob.length) {
          next.push(item);
          continue;
        }
        if (!sanitySources.length && !sources.length) {
          next.push(item);
          continue;
        }

        const migrated = [];
        for (const src of sanitySources.length ? sanitySources : sources.filter(isSanityCdn)) {
          try {
            const blobUrl = await migrateUrl(src, "showcase");
            if (blobUrl) migrated.push(blobUrl);
          } catch (err) {
            failed += 1;
            console.error(`  ✗ showcase img ${item?.name}:`, err?.message || err);
          }
        }
        const imageUrls = [...new Set([...existingBlob, ...migrated])];
        if (imageUrls.length) {
          next.push({ ...item, imageUrls });
          changed = true;
        } else {
          next.push(item);
        }
      }

      if (!changed || dryRun) {
        if (dryRun && changed) console.log(`[dry-run] would update showcase ${row.partner_name || row.id}`);
        continue;
      }
      await client.query(
        `UPDATE cms.vrms
         SET showcase_json = $2::jsonb, updated_at = now(), synced_at = now()
         WHERE id = $1`,
        [row.id, JSON.stringify(next)]
      );
      console.log(`✓ showcase ${row.partner_name || row.slug || row.id} (${next.length} props)`);
    } catch (err) {
      failed += 1;
      console.error(`✗ showcase ${row.partner_name || row.id}:`, err?.message || err);
    }
  }
}

async function migrateProperties(client) {
  if (only !== "all" && only !== "properties") return;
  console.log("\n== Active properties with Sanity CDN URLs ==");
  const { rows } = await client.query(`
    SELECT id, name, property_image, images, photo_urls
    FROM cms.properties
    WHERE COALESCE(active, true) = true
      AND archived_at IS NULL
      AND (
        property_image ILIKE '%cdn.sanity.io%'
        OR images::text ILIKE '%cdn.sanity.io%'
        OR photo_urls::text ILIKE '%cdn.sanity.io%'
      )
    ORDER BY name
  `);
  let list = rows;
  if (Number.isFinite(limit) && limit > 0) list = list.slice(0, limit);
  console.log(`rows: ${list.length}`);

  await mapPool(list, CONCURRENCY, async (row) => {
    try {
      const mapped = new Map();
      const collect = (v) => {
        if (typeof v === "string" && isSanityCdn(v)) mapped.set(stripQuery(v), null);
        else if (Array.isArray(v)) v.forEach(collect);
      };
      collect(row.property_image);
      collect(row.images);
      collect(row.photo_urls);

      for (const key of [...mapped.keys()]) {
        mapped.set(key, await migrateUrl(key, "properties"));
      }

      if (![...mapped.values()].some(Boolean) || dryRun) return;

      const property_image = rewriteStringUrl(row.property_image, mapped);
      const images = rewriteJsonUrls(row.images, mapped);
      const photo_urls = rewriteJsonUrls(row.photo_urls, mapped);

      await client.query(
        `UPDATE cms.properties
         SET property_image = $2,
             images = $3::jsonb,
             photo_urls = $4::jsonb,
             updated_at = now(),
             synced_at = now()
         WHERE id = $1`,
        [
          row.id,
          property_image,
          images == null ? null : JSON.stringify(images),
          photo_urls == null ? null : JSON.stringify(photo_urls),
        ]
      );
      console.log(`✓ property ${row.name || row.id}`);
    } catch (err) {
      failed += 1;
      console.error(`✗ property ${row.name || row.id}:`, err?.message || err);
    }
  });
}

async function summary(client) {
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*) FROM cms.destinations WHERE map_image_url ILIKE '%cdn.sanity.io%' OR footer_image_url ILIKE '%cdn.sanity.io%')::int AS dest_sanity,
      (SELECT count(*) FROM cms.vrms WHERE main_image_url ILIKE '%cdn.sanity.io%' OR doyen_image_url ILIKE '%cdn.sanity.io%' OR logo_image_url ILIKE '%cdn.sanity.io%')::int AS vrm_flat_sanity,
      (SELECT count(*) FROM cms.vrms WHERE showcase_json::text ILIKE '%cdn.sanity.io%' OR showcase_json::text ILIKE '%"_ref": "image-%')::int AS vrm_showcase_sanityish,
      (SELECT count(*) FROM cms.properties WHERE COALESCE(active,true)=true AND archived_at IS NULL AND (property_image ILIKE '%cdn.sanity.io%' OR images::text ILIKE '%cdn.sanity.io%' OR photo_urls::text ILIKE '%cdn.sanity.io%'))::int AS props_sanity
  `);
  return rows[0];
}

async function main() {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Migrate Sanity → Blob (${dryRun ? "dry-run" : "live"}, only=${only})`);
  console.log("Before:", await summary(client));

  await migrateDestinations(client);
  await migrateVrmFlatImages(client);
  await migrateShowcase(client);
  await migrateProperties(client);

  console.log("\nDone.", { uploaded, reused, failed, cache: cache.size, dryRun });
  console.log("After:", await summary(client));
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
