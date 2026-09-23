/**
 * Flatten supabase.vrms and supabase.propertiesbase44 from a single jsonb
 * `data` blob into real columns. Nested Sanity/portable-text and image arrays
 * stay jsonb. Re-runnable: skips if the tables are already columnar.
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

function emptyToNull(value) {
  if (value === undefined || value === null || value === "" || value === "null") return null;
  return value;
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

function asTimestamp(value) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asInt(value) {
  const raw = emptyToNull(value);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asNumber(value) {
  const raw = emptyToNull(value);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function asBool(value) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function asText(value) {
  const raw = emptyToNull(value);
  if (raw == null) return null;
  return typeof raw === "string" ? raw : String(raw);
}

const VRMS_TEXT = [
  "name", "slug", "title", "partner_name", "email", "phone", "vrm_email", "vrm_phone",
  "vrm_url", "website", "source", "sanity_id", "sanity_vrm_id", "doyen_name", "doyen_title",
  "doyen_short_description", "doyen_text", "doyen_image_url", "logo_image_url", "main_image_url",
  "first_destination_slug", "last_header_error", "last_header_final_url", "last_trademark_error",
  "last_trademark_final_url",
];
const VRMS_BOOL = ["onboarded", "is_onboarded", "showproperties", "last_header_ok", "last_header_has_link", "last_trademark_ok"];
const VRMS_INT = ["source_id", "unit_count", "last_header_status", "last_trademark_status"];
const VRMS_TS = ["sanity_created_at", "sanity_updated_at", "last_header_checked_at", "last_trademark_checked_at", "created_at", "updated_at"];
const VRMS_JSON = [
  "body_json", "doyentext_json", "favorites_json", "showcase_json", "servicesoffered_json",
  "servicesavailable_json", "serviceofferedpicks_json", "destination_slugs",
];
const VRMS_COLUMNS = ["id", ...VRMS_TEXT, ...VRMS_BOOL, ...VRMS_INT, ...VRMS_TS, ...VRMS_JSON, "imported_at"];

const PROP_TEXT = [
  "source_id", "name", "url", "vrm_url", "destination", "partner_name", "partner_id", "address",
  "bedrooms", "bathrooms", "occupancy", "house_type", "status", "onboarding_status",
  "photography_status", "pet_friendly", "unique_feature", "why_onehundred", "excerpt", "text",
  "headline", "property_image", "video_url", "designed_by", "designer_name", "design_style_notes",
  "location_city", "location_state", "location_country", "property_source", "property_html",
  "ai_search", "ai_fit_score", "best_fit_guest", "photo_count", "last_page_check_ok",
  "last_page_check_status", "last_page_check_error", "last_page_check_final_url",
];
const PROP_BOOL = ["active", "portal_visible"];
const PROP_NUM = ["latitude", "longitude"];
const PROP_INT = ["row_id"];
const PROP_TS = ["created_at", "last_scan", "last_page_check_at", "launch_date", "removal_date"];
const PROP_JSON = ["images", "vrm_images", "categories", "prop_categories", "tags", "reviews", "propdescription"];
const PROP_COLUMNS = ["id", ...PROP_TEXT, ...PROP_BOOL, ...PROP_NUM, ...PROP_INT, ...PROP_TS, ...PROP_JSON, "imported_at"];

function mapVrm(id, data, importedAt) {
  const row = { id: String(id) };
  for (const key of VRMS_TEXT) row[key] = asText(data[key]);
  for (const key of VRMS_BOOL) row[key] = asBool(data[key]);
  row.source_id = asInt(data.id);
  row.unit_count = asInt(data.unit_count);
  row.last_header_status = asInt(data.last_header_status);
  row.last_trademark_status = asInt(data.last_trademark_status);
  for (const key of VRMS_TS) row[key] = asTimestamp(data[key]);
  for (const key of VRMS_JSON) row[key] = asJson(data[key]);
  row.imported_at = importedAt || new Date().toISOString();
  return row;
}

function mapProperty(id, data, importedAt) {
  const row = { id: String(id) };
  for (const key of PROP_TEXT) {
    if (key === "source_id") row.source_id = asText(data.id);
    else row[key] = asText(data[key]);
  }
  for (const key of PROP_BOOL) row[key] = asBool(data[key]);
  for (const key of PROP_NUM) row[key] = asNumber(data[key]);
  row.row_id = asInt(data.row_id);
  for (const key of PROP_TS) row[key] = asTimestamp(data[key]);
  for (const key of PROP_JSON) row[key] = asJson(data[key]);
  if (!row.name) row.name = asText(data.name) || `Property ${id}`;
  row.imported_at = importedAt || new Date().toISOString();
  return row;
}

function insertSql(schemaTable, columns) {
  const cols = columns.map((c) => `"${c}"`).join(", ");
  const values = columns.map((_, i) => `$${i + 1}`).join(", ");
  return `INSERT INTO ${schemaTable} (${cols}) VALUES (${values})`;
}

function valuesFor(row, columns, jsonCols) {
  return columns.map((c) => {
    const value = row[c];
    if (jsonCols.has(c)) return value == null ? null : JSON.stringify(value);
    return value;
  });
}

const CREATE_VRMS = `
CREATE TABLE supabase.vrms_new (
  id text PRIMARY KEY,
  source_id bigint,
  name text,
  slug text,
  title text,
  partner_name text,
  email text,
  phone text,
  vrm_email text,
  vrm_phone text,
  vrm_url text,
  website text,
  source text,
  sanity_id text,
  sanity_vrm_id text,
  sanity_created_at timestamptz,
  sanity_updated_at timestamptz,
  doyen_name text,
  doyen_title text,
  doyen_short_description text,
  doyen_text text,
  doyen_image_url text,
  logo_image_url text,
  main_image_url text,
  destination_slugs jsonb,
  first_destination_slug text,
  unit_count integer,
  onboarded boolean,
  is_onboarded boolean,
  showproperties boolean,
  last_header_ok boolean,
  last_header_has_link boolean,
  last_header_status integer,
  last_header_error text,
  last_header_final_url text,
  last_header_checked_at timestamptz,
  last_trademark_ok boolean,
  last_trademark_status integer,
  last_trademark_error text,
  last_trademark_final_url text,
  last_trademark_checked_at timestamptz,
  body_json jsonb,
  doyentext_json jsonb,
  favorites_json jsonb,
  showcase_json jsonb,
  servicesoffered_json jsonb,
  servicesavailable_json jsonb,
  serviceofferedpicks_json jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vrms_new_partner_name_idx ON supabase.vrms_new (partner_name);
CREATE INDEX vrms_new_slug_idx ON supabase.vrms_new (slug);
`;

const CREATE_PROPS = `
CREATE TABLE supabase.propertiesbase44_new (
  id text PRIMARY KEY,
  row_id bigint,
  source_id text,
  name text NOT NULL,
  url text,
  vrm_url text,
  destination text,
  partner_name text,
  partner_id text,
  address text,
  bedrooms text,
  bathrooms text,
  occupancy text,
  house_type text,
  status text,
  active boolean,
  portal_visible boolean,
  onboarding_status text,
  photography_status text,
  launch_date date,
  removal_date date,
  last_scan timestamptz,
  latitude double precision,
  longitude double precision,
  pet_friendly text,
  unique_feature text,
  why_onehundred text,
  excerpt text,
  text text,
  headline text,
  property_image text,
  video_url text,
  designed_by text,
  designer_name text,
  design_style_notes text,
  location_city text,
  location_state text,
  location_country text,
  property_source text,
  property_html text,
  ai_search text,
  ai_fit_score text,
  best_fit_guest text,
  photo_count text,
  last_page_check_at timestamptz,
  last_page_check_ok text,
  last_page_check_status text,
  last_page_check_error text,
  last_page_check_final_url text,
  created_at timestamptz,
  images jsonb,
  vrm_images jsonb,
  categories jsonb,
  prop_categories jsonb,
  tags jsonb,
  reviews jsonb,
  propdescription jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX propertiesbase44_new_row_id_idx ON supabase.propertiesbase44_new (row_id);
CREATE INDEX propertiesbase44_new_partner_id_idx ON supabase.propertiesbase44_new (partner_id);
CREATE INDEX propertiesbase44_new_partner_name_idx ON supabase.propertiesbase44_new (partner_name);
CREATE INDEX propertiesbase44_new_status_idx ON supabase.propertiesbase44_new (status);
CREATE INDEX propertiesbase44_new_vrm_url_idx ON supabase.propertiesbase44_new (vrm_url);
CREATE INDEX propertiesbase44_new_url_idx ON supabase.propertiesbase44_new (url);
`;

async function alreadyFlat(client, table, probeColumn) {
  const { rows } = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'supabase' AND table_name = $1 AND column_name = $2`,
    [table, probeColumn]
  );
  const dataCol = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'supabase' AND table_name = $1 AND column_name = 'data'`,
    [table]
  );
  return rows.length > 0 && dataCol.rows.length === 0;
}

async function copyTable(client, { table, createSql, newTable, columns, mapRow }) {
  await client.query(`DROP TABLE IF EXISTS supabase.${newTable} CASCADE`);
  await client.query(createSql);
  const { rows } = await client.query(`SELECT id, data, imported_at FROM supabase.${table}`);
  let copied = 0;
  for (const raw of rows) {
    const mapped = mapRow(raw.id, raw.data || {}, raw.imported_at);
    const jsonCols = new Set(table === "vrms" ? VRMS_JSON : PROP_JSON);
    const params = valuesFor(mapped, columns, jsonCols);
    const placeholders = columns.map((col, i) => (jsonCols.has(col) ? `$${i + 1}::jsonb` : `$${i + 1}`));
    await client.query(
      `INSERT INTO supabase.${newTable} (${columns.map((c) => `"${c}"`).join(", ")})
       VALUES (${placeholders.join(", ")})`,
      params
    );
    copied += 1;
  }
  return copied;
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const vrmsFlat = await alreadyFlat(client, "vrms", "partner_name");
  const propsFlat = await alreadyFlat(client, "propertiesbase44", "row_id");
  if (vrmsFlat && propsFlat) {
    console.log("Tables are already columnar. Nothing to do.");
    process.exit(0);
  }

  await client.query("BEGIN");

  if (!vrmsFlat) {
    const n = await copyTable(client, {
      table: "vrms",
      createSql: CREATE_VRMS,
      newTable: "vrms_new",
      columns: VRMS_COLUMNS,
      mapRow: mapVrm,
    });
    await client.query(`ALTER TABLE supabase.vrms RENAME TO vrms_jsonb_backup`);
    await client.query(`ALTER TABLE supabase.vrms_new RENAME TO vrms`);
    await client.query(`ALTER INDEX IF EXISTS supabase.vrms_new_partner_name_idx RENAME TO vrms_partner_name_idx`);
    await client.query(`ALTER INDEX IF EXISTS supabase.vrms_new_slug_idx RENAME TO vrms_slug_idx`);
    console.log(`vrms: ${n} rows flattened`);
  } else {
    console.log("vrms: already columnar");
  }

  if (!propsFlat) {
    const n = await copyTable(client, {
      table: "propertiesbase44",
      createSql: CREATE_PROPS,
      newTable: "propertiesbase44_new",
      columns: PROP_COLUMNS,
      mapRow: mapProperty,
    });
    await client.query(`ALTER TABLE supabase.propertiesbase44 RENAME TO propertiesbase44_jsonb_backup`);
    await client.query(`ALTER TABLE supabase.propertiesbase44_new RENAME TO propertiesbase44`);
    await client.query(`ALTER INDEX IF EXISTS supabase.propertiesbase44_new_row_id_idx RENAME TO propertiesbase44_row_id_idx`);
    await client.query(`ALTER INDEX IF EXISTS supabase.propertiesbase44_new_partner_id_idx RENAME TO propertiesbase44_partner_id_idx`);
    await client.query(`ALTER INDEX IF EXISTS supabase.propertiesbase44_new_partner_name_idx RENAME TO propertiesbase44_partner_name_idx`);
    await client.query(`ALTER INDEX IF EXISTS supabase.propertiesbase44_new_status_idx RENAME TO propertiesbase44_status_idx`);
    await client.query(`ALTER INDEX IF EXISTS supabase.propertiesbase44_new_vrm_url_idx RENAME TO propertiesbase44_vrm_url_idx`);
    await client.query(`ALTER INDEX IF EXISTS supabase.propertiesbase44_new_url_idx RENAME TO propertiesbase44_url_idx`);
    console.log(`propertiesbase44: ${n} rows flattened`);
  } else {
    console.log("propertiesbase44: already columnar");
  }

  const checks = (await client.query(`
    SELECT 'vrms' AS t, count(*)::int AS n FROM supabase.vrms
    UNION ALL SELECT 'propertiesbase44', count(*)::int FROM supabase.propertiesbase44
    UNION ALL SELECT 'vrms_backup', count(*)::int FROM supabase.vrms_jsonb_backup
    UNION ALL SELECT 'properties_backup', count(*)::int FROM supabase.propertiesbase44_jsonb_backup
  `)).rows;
  console.log("counts", checks);

  await client.query("COMMIT");
  console.log("Done. jsonb backups kept as supabase.vrms_jsonb_backup and supabase.propertiesbase44_jsonb_backup");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}

void insertSql;
