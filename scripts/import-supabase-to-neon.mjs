/**
 * Copy every public Supabase table into Neon schema `supabase`.
 * Uses the service role (bypasses RLS) and the unpooled Neon URL.
 * Re-runnable: upserts by a stable row key.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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

const SUPABASE_URL = (process.env.BASE44_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.BASE44_SUPABASE_SERVICE_ROLE_KEY || "";
const PAGE_SIZE = Number(process.env.SUPABASE_PAGE_SIZE || 1000);
const SCHEMA = "supabase";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("BASE44_SUPABASE_URL and BASE44_SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  process.exit(1);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function rowKey(row) {
  if (row.id !== null && row.id !== undefined && row.id !== "") return String(row.id);
  if (row.row_id !== null && row.row_id !== undefined && row.row_id !== "") return String(row.row_id);
  if (row.uuid) return String(row.uuid);
  if (row.url) return `url:${row.url}`;
  return createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 32);
}

function propertyRowKey(row) {
  if (row.row_id !== null && row.row_id !== undefined && row.row_id !== "") return String(row.row_id);
  return rowKey(row);
}

const KNOWN_TABLES = [
  "activity_logs",
  "audit_entries",
  "billing_records",
  "destinations",
  "documents",
  "image_metadata",
  "job_applications",
  "job_postings",
  "license_records",
  "media_assets",
  "notes",
  "onboarding_items",
  "partner_applications",
  "partner_profiles",
  "partners",
  "properties",
  "propertiesbase44",
  "tasks",
  "vrms",
];

async function fetchWithRetry(url, options, label, attempts = 4) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || (res.status < 500 && res.status !== 408 && res.status !== 429)) return res;
      last = new Error(`${label} HTTP ${res.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, 1500 * i));
  }
  throw last;
}

async function listTables() {
  try {
    const res = await fetchWithRetry(
      `${SUPABASE_URL}/rest/v1/`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Accept: "application/openapi+json",
        },
      },
      "list tables"
    );
    if (!res.ok) throw new Error(`Failed to list tables: HTTP ${res.status}`);
    const spec = await res.json();
    const names = Object.keys(spec.paths || {})
      .filter((p) => p.startsWith("/") && !p.slice(1).includes("/"))
      .map((p) => p.slice(1))
      .filter((name) => name && !name.startsWith("rpc"))
      .sort();
    if (names.length) return names;
  } catch (error) {
    console.warn(`OpenAPI table list failed (${error.message}); using known table list`);
  }
  return KNOWN_TABLES;
}

async function fetchPage(table, offset) {
  const res = await fetchWithRetry(
    `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${PAGE_SIZE}&offset=${offset}`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "count=exact",
      },
    },
    table
  );
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${table} HTTP ${res.status}`);
    err.status = res.status;
    err.body = text.slice(0, 240);
    throw err;
  }
  const rows = text ? JSON.parse(text) : [];
  const range = res.headers.get("content-range") || "";
  const total = Number((range.split("/")[1] || "").trim());
  return { rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(total) ? total : null };
}

function ensureTableSql(table) {
  return `
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.${quoteIdent(table)} (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now()
    );
  `;
}

async function upsertRows(client, table, rows) {
  if (!rows.length) return 0;
  const values = [];
  const params = [];
  let i = 1;
  const seen = new Set();
  for (const row of rows) {
    const id = rowKey(row);
    if (seen.has(id)) continue;
    seen.add(id);
    values.push(`($${i++}, $${i++}::jsonb)`);
    params.push(id, JSON.stringify(row));
  }
  if (!values.length) return 0;
  await client.query(
    `INSERT INTO ${SCHEMA}.${quoteIdent(table)} (id, data)
     VALUES ${values.join(",")}
     ON CONFLICT (id) DO UPDATE SET
       data = EXCLUDED.data,
       imported_at = now()`,
    params
  );
  return values.length;
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);

async function isColumnarTable(name) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [SCHEMA, name]
  );
  const names = rows.map((r) => r.column_name);
  return names.includes("name") && !names.includes("data");
}

function emptyToNull(value) {
  if (value === undefined || value === null || value === "" || value === "null") return null;
  return value;
}

function asText(value) {
  const raw = emptyToNull(value);
  if (raw == null) return null;
  return typeof raw === "string" ? raw : String(raw);
}

function asBool(value) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function asNumber(value) {
  const raw = emptyToNull(value);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function asInt(value) {
  const n = asNumber(value);
  return n == null ? null : Math.trunc(n);
}

function asTimestamp(value) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asJson(value) {
  const raw = emptyToNull(value);
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

const PROP_TEXT = [
  "source_id", "name", "url", "vrm_url", "destination", "partner_name", "partner_id", "address",
  "bedrooms", "bathrooms", "occupancy", "house_type", "status", "onboarding_status",
  "photography_status", "pet_friendly", "unique_feature", "why_onehundred", "excerpt", "text",
  "headline", "property_image", "video_url", "designed_by", "designer_name", "design_style_notes",
  "location_city", "location_state", "location_country", "property_source", "property_html",
  "ai_search", "ai_fit_score", "best_fit_guest", "photo_count", "last_page_check_ok",
  "last_page_check_status", "last_page_check_error", "last_page_check_final_url",
];
const PROP_JSON = ["images", "vrm_images", "categories", "prop_categories", "tags", "reviews", "propdescription"];
const PROP_COLUMNS = [
  "id", ...PROP_TEXT, "active", "portal_visible", "latitude", "longitude", "row_id",
  "created_at", "last_scan", "last_page_check_at", "launch_date", "removal_date",
  ...PROP_JSON, "imported_at",
];
const VRM_TEXT = [
  "name", "slug", "title", "partner_name", "email", "phone", "vrm_email", "vrm_phone",
  "vrm_url", "website", "source", "sanity_id", "sanity_vrm_id",
  "doyen_name", "doyen_title", "doyen_short_description", "doyen_text", "doyen_image_url",
  "logo_image_url", "main_image_url", "first_destination_slug", "last_header_error",
  "last_header_final_url", "last_trademark_error", "last_trademark_final_url",
];
const VRM_JSON = [
  "body_json", "doyentext_json", "favorites_json", "showcase_json", "servicesoffered_json",
  "servicesavailable_json", "serviceofferedpicks_json", "destination_slugs",
];
const VRM_COLUMNS = [
  "id", "source_id", ...VRM_TEXT, "onboarded", "is_onboarded",
  "showproperties", "last_header_ok", "last_header_has_link", "last_trademark_ok",
  "unit_count", "last_header_status", "last_trademark_status",
  "sanity_created_at", "sanity_updated_at", "last_header_checked_at", "last_trademark_checked_at",
  "created_at", "updated_at", ...VRM_JSON, "imported_at",
];

function mapPropertyRow(row) {
  const id = propertyRowKey(row);
  const out = { id };
  for (const key of PROP_TEXT) {
    out[key] = key === "source_id" ? asText(row.id ?? row.source_id) : asText(row[key]);
  }
  out.active = asBool(row.active);
  out.portal_visible = asBool(row.portal_visible);
  out.latitude = asNumber(row.latitude);
  out.longitude = asNumber(row.longitude);
  out.row_id = asInt(row.row_id);
  out.created_at = asTimestamp(row.created_at);
  out.last_scan = asTimestamp(row.last_scan);
  out.last_page_check_at = asTimestamp(row.last_page_check_at);
  out.launch_date = asTimestamp(row.launch_date);
  out.removal_date = asTimestamp(row.removal_date);
  for (const key of PROP_JSON) out[key] = asJson(row[key]);
  if (!out.name) out.name = asText(row.name) || asText(row.property_name) || `Property ${id}`;
  out.imported_at = new Date().toISOString();
  return out;
}

function mapVrmRow(row) {
  const id = rowKey(row);
  const out = { id };
  for (const key of VRM_TEXT) {
    if (key === "sanity_vrmard_id") continue;
    out[key] = asText(row[key]);
  }
  out.source_id = asInt(row.id);
  out.unit_count = asInt(row.unit_count);
  out.last_header_status = asInt(row.last_header_status);
  out.last_trademark_status = asInt(row.last_trademark_status);
  out.onboarded = asBool(row.onboarded);
  out.is_onboarded = asBool(row.is_onboarded);
  out.showproperties = asBool(row.showproperties);
  out.last_header_ok = asBool(row.last_header_ok);
  out.last_header_has_link = asBool(row.last_header_has_link);
  out.last_trademark_ok = asBool(row.last_trademark_ok);
  out.sanity_created_at = asTimestamp(row.sanity_created_at);
  out.sanity_updated_at = asTimestamp(row.sanity_updated_at);
  out.last_header_checked_at = asTimestamp(row.last_header_checked_at);
  out.last_trademark_checked_at = asTimestamp(row.last_trademark_checked_at);
  out.created_at = asTimestamp(row.created_at);
  out.updated_at = asTimestamp(row.updated_at);
  for (const key of VRM_JSON) out[key] = asJson(row[key]);
  out.imported_at = new Date().toISOString();
  return out;
}

async function upsertColumnar(client, table, rows) {
  const jsonCols = new Set(table === "vrms" ? VRM_JSON : PROP_JSON);
  const columns = table === "vrms" ? VRM_COLUMNS : PROP_COLUMNS;
  const mapped = rows.map((row) => (table === "vrms" ? mapVrmRow(row) : mapPropertyRow(row)));
  let imported = 0;
  for (const row of mapped) {
    const params = columns.map((col) => {
      const value = row[col];
      if (jsonCols.has(col)) return value == null ? null : JSON.stringify(value);
      return value;
    });
    const placeholders = columns.map((col, i) => (jsonCols.has(col) ? `$${i + 1}::jsonb` : `$${i + 1}`));
    const updates = columns
      .filter((col) => col !== "id")
      .map((col) => `${quoteIdent(col)} = EXCLUDED.${quoteIdent(col)}`)
      .join(", ");
    if (table === "propertiesbase44" && row.row_id != null) {
      await client.query(
        `DELETE FROM ${SCHEMA}.${quoteIdent(table)} WHERE row_id = $1 AND id <> $2`,
        [row.row_id, row.id]
      );
    }
    await client.query(
      `INSERT INTO ${SCHEMA}.${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${updates}`,
      params
    );
    imported += 1;
  }
  return { imported, ids: mapped.map((row) => String(row.id)) };
}

async function pruneStale(client, table, keepIds, expected) {
  if (expected != null && keepIds.length < expected) return 0;
  if (expected == null && keepIds.length === 0) return 0;
  const result = await client.query(
    `DELETE FROM ${SCHEMA}.${quoteIdent(table)} WHERE id <> ALL($1::text[])`,
    [keepIds]
  );
  return result.rowCount || 0;
}

const only = (process.env.SUPABASE_TABLES || "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const tables = (await listTables()).filter((table) => !only.length || only.includes(table));
console.log(`Importing ${tables.length} Supabase tables into Neon schema ${SCHEMA}`);

const summary = [];
for (const table of tables) {
  try {
    const columnar = await isColumnarTable(table);
    if (!columnar) await client.query(ensureTableSql(table));
    let offset = 0;
    let imported = 0;
    let pages = 0;
    let expected = null;
    const keepIds = [];
    for (;;) {
      const page = await fetchPage(table, offset);
      expected = page.total;
      if (!page.rows.length) break;
      if (columnar) {
        const result = await upsertColumnar(client, table, page.rows);
        imported += result.imported;
        keepIds.push(...result.ids);
      } else {
        imported += await upsertRows(client, table, page.rows);
        for (const row of page.rows) keepIds.push(rowKey(row));
      }
      pages += 1;
      process.stdout.write(`\r  ${table}: ${imported}${expected != null ? `/${expected}` : ""} (${pages} pages)`);
      if (page.rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    const pruned = await pruneStale(client, table, [...new Set(keepIds)], expected);
    if (pruned) process.stdout.write(`  pruned ${pruned} stale`);
    if (pages === 0) process.stdout.write(`\r  ${table}: 0 rows`);
    process.stdout.write("\n");
    const stored = await client.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.${quoteIdent(table)}`);
    summary.push({ table, imported, stored: stored.rows[0].n, pruned, expected, status: "ok" });
  } catch (err) {
    console.log(`  ${table}: ${err.message}${err.body ? ` (${err.body})` : ""}`);
    summary.push({ table, imported: 0, stored: 0, status: err.message });
  }
}

await client.end();

console.log("\nNeon supabase tables:");
for (const row of summary) {
  console.log(
    `  ${row.table.padEnd(24)} ${String(row.imported).padStart(6)} imported  stored=${row.stored}  ${row.status}`
  );
}
