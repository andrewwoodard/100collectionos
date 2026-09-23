/**
 * Copy every Base44 entity into Neon schema `base44`.
 * Uses the unpooled connection. Re-runnable (upsert by id).
 *
 * Public entities import without a token. RLS-protected entities need
 * BASE44_ACCESS_TOKEN or BASE44_SERVICE_TOKEN (admin / service role).
 */
import { readdirSync, readFileSync } from "node:fs";
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

function toSnake(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function parseTs(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const APP_ID = process.env.VITE_BASE44_APP_ID || "69aee092656fb9813439389b";
const APP_BASE = (process.env.VITE_BASE44_APP_BASE_URL || "https://100c-os.base44.app").replace(
  /\/$/,
  ""
);
const TOKEN = process.env.BASE44_SERVICE_TOKEN || process.env.BASE44_ACCESS_TOKEN || "";
const PAGE_SIZE = Number(process.env.BASE44_PAGE_SIZE || 100);

const entities = readdirSync(join(root, "base44/entities"))
  .filter((f) => f.endsWith(".jsonc"))
  .map((f) => f.replace(/\.jsonc$/, ""))
  .sort();

async function fetchJson(path) {
  const url = `${APP_BASE}/api${path}`;
  const headers = { "X-App-Id": APP_ID };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${path} HTTP ${res.status}`);
    err.status = res.status;
    err.body = text.slice(0, 240);
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function fetchPage(entityName, skip) {
  const path = `/apps/${APP_ID}/entities/${entityName}?limit=${PAGE_SIZE}&skip=${skip}`;
  const data = await fetchJson(path);
  return Array.isArray(data) ? data : [];
}

function ensureTableSql(table) {
  return `
    CREATE TABLE IF NOT EXISTS base44.${table} (
      id text PRIMARY KEY,
      created_date timestamptz,
      updated_date timestamptz,
      created_by text,
      created_by_id text,
      is_sample boolean,
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
  for (const row of rows) {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}::jsonb)`);
    params.push(
      String(row.id),
      parseTs(row.created_date),
      parseTs(row.updated_date),
      row.created_by ?? null,
      row.created_by_id ?? null,
      row.is_sample === true,
      JSON.stringify(row)
    );
  }
  await client.query(
    `INSERT INTO base44.${table} (
        id, created_date, updated_date, created_by, created_by_id, is_sample, data
      ) VALUES ${values.join(",")}
      ON CONFLICT (id) DO UPDATE SET
        created_date = EXCLUDED.created_date,
        updated_date = EXCLUDED.updated_date,
        created_by = EXCLUDED.created_by,
        created_by_id = EXCLUDED.created_by_id,
        is_sample = EXCLUDED.is_sample,
        data = EXCLUDED.data,
        imported_at = now()`,
    params
  );
  return rows.length;
}

async function importEntity(client, entityName) {
  const tableName = `"${toSnake(entityName)}"`;
  await client.query(ensureTableSql(tableName));

  let skip = 0;
  let imported = 0;
  let pages = 0;
  const seen = new Set();
  for (;;) {
    const items = (await fetchPage(entityName, skip)).filter((row) => {
      if (!row?.id) return false;
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    imported += await upsertRows(client, tableName, items);
    pages += 1;
    process.stdout.write(`\r  ${entityName}: ${imported} rows (${pages} pages)`);
    if (items.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  process.stdout.write("\n");
  return imported;
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query("CREATE SCHEMA IF NOT EXISTS base44");

console.log(`Importing ${entities.length} Base44 entities into Neon schema base44`);
console.log(`Auth: ${TOKEN ? "token present" : "anonymous (public entities only)"}`);

const summary = [];
for (const name of entities) {
  try {
    const count = await importEntity(client, name);
    summary.push({ entity: name, table: toSnake(name), rows: count, status: "ok" });
  } catch (err) {
    summary.push({
      entity: name,
      table: toSnake(name),
      rows: 0,
      status: `error ${err.status || ""} ${err.message}`.trim(),
    });
    console.log(`  ${name}: ${err.message}${err.body ? ` (${err.body})` : ""}`);
  }
}

const exactCounts = {};
for (const row of summary) {
  if (row.status !== "ok") continue;
  const r = await client.query(`SELECT count(*)::int AS n FROM base44."${row.table}"`);
  exactCounts[row.table] = r.rows[0].n;
}

await client.end();

console.log("\nNeon base44 tables:");
for (const row of summary) {
  const n = exactCounts[row.table];
  const stored = n === undefined ? "" : ` stored=${n}`;
  console.log(`  ${row.table.padEnd(28)} ${String(row.rows).padStart(6)} imported  ${row.status}${stored}`);
}
console.log(TOKEN ? "\nDone." : "\nDone. Private tables are empty until BASE44_ACCESS_TOKEN or BASE44_SERVICE_TOKEN is set.");
