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
  return createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 32);
}

async function listTables() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/openapi+json",
    },
  });
  if (!res.ok) throw new Error(`Failed to list tables: HTTP ${res.status}`);
  const spec = await res.json();
  return Object.keys(spec.paths || {})
    .filter((p) => p.startsWith("/") && !p.slice(1).includes("/"))
    .map((p) => p.slice(1))
    .filter((name) => name && !name.startsWith("rpc"))
    .sort();
}

async function fetchPage(table, offset) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${PAGE_SIZE}&offset=${offset}`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "count=exact",
      },
    }
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

const tables = await listTables();
console.log(`Importing ${tables.length} Supabase tables into Neon schema ${SCHEMA}`);

const summary = [];
for (const table of tables) {
  try {
    if (await isColumnarTable(table)) {
      console.log(`  ${table}: skipped (already flattened to columns; re-import would overwrite the structured table)`);
      const stored = await client.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.${quoteIdent(table)}`);
      summary.push({ table, imported: 0, stored: stored.rows[0].n, status: "skipped-columnar" });
      continue;
    }
    await client.query(ensureTableSql(table));
    let offset = 0;
    let imported = 0;
    let pages = 0;
    let expected = null;
    for (;;) {
      const page = await fetchPage(table, offset);
      expected = page.total;
      if (!page.rows.length) break;
      imported += await upsertRows(client, table, page.rows);
      pages += 1;
      process.stdout.write(`\r  ${table}: ${imported}${expected != null ? `/${expected}` : ""} (${pages} pages)`);
      if (page.rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    if (pages === 0) process.stdout.write(`\r  ${table}: 0 rows`);
    process.stdout.write("\n");
    const stored = await client.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.${quoteIdent(table)}`);
    summary.push({ table, imported, stored: stored.rows[0].n, status: "ok" });
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
