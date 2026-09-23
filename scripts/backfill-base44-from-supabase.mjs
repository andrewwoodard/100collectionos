/**
 * Fill empty Neon `base44.*` tables from the Base44-linked Supabase copy.
 * Does not overwrite tables that already have live Base44 API rows
 * (property, destination, job_posting, page_meta, etc.).
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

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const MAP = [
  ["activity_logs", "activity_log"],
  ["audit_entries", "audit_entry"],
  ["billing_records", "billing_record"],
  ["documents", "document"],
  ["license_records", "license_record"],
  ["media_assets", "media_asset"],
  ["notes", "note"],
  ["onboarding_items", "onboarding_item"],
  ["partner_applications", "partner_application"],
  ["partner_profiles", "partner_profile"],
  ["partners", "partner"],
  ["tasks", "task"],
];

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

const ensureSql = (table) => `
  CREATE TABLE IF NOT EXISTS base44.${quoteIdent(table)} (
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

console.log("Backfilling empty base44 tables from supabase copy");

for (const [from, to] of MAP) {
  await client.query(ensureSql(to));
  const before = await client.query(`SELECT count(*)::int AS n FROM base44.${quoteIdent(to)}`);
  const source = await client.query(`SELECT count(*)::int AS n FROM supabase.${quoteIdent(from)}`);
  const result = await client.query(
    `INSERT INTO base44.${quoteIdent(to)} (
        id, created_date, updated_date, created_by, created_by_id, is_sample, data
      )
      SELECT
        s.id,
        COALESCE(
          NULLIF(s.data->>'created_date', '')::timestamptz,
          NULLIF(s.data->>'created_at', '')::timestamptz
        ),
        COALESCE(
          NULLIF(s.data->>'updated_date', '')::timestamptz,
          NULLIF(s.data->>'updated_at', '')::timestamptz
        ),
        s.data->>'created_by',
        s.data->>'created_by_id',
        COALESCE((s.data->>'is_sample')::boolean, false),
        s.data
      FROM supabase.${quoteIdent(from)} s
      ON CONFLICT (id) DO UPDATE SET
        created_date = COALESCE(EXCLUDED.created_date, base44.${quoteIdent(to)}.created_date),
        updated_date = COALESCE(EXCLUDED.updated_date, base44.${quoteIdent(to)}.updated_date),
        created_by = COALESCE(EXCLUDED.created_by, base44.${quoteIdent(to)}.created_by),
        created_by_id = COALESCE(EXCLUDED.created_by_id, base44.${quoteIdent(to)}.created_by_id),
        data = EXCLUDED.data,
        imported_at = now()`,
  );
  const after = await client.query(`SELECT count(*)::int AS n FROM base44.${quoteIdent(to)}`);
  console.log(
    `  ${to.padEnd(22)} ${String(before.rows[0].n).padStart(4)} -> ${String(after.rows[0].n).padStart(4)}  (supabase.${from}=${source.rows[0].n}, upserted=${result.rowCount})`
  );
}

const { rows } = await client.query(`
  SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'base44' AND c.relkind = 'r'
  ORDER BY 1
`);
console.log("\nbase44 table counts:");
for (const row of rows) {
  const c = await client.query(`SELECT count(*)::int AS n FROM base44.${quoteIdent(row.table_name)}`);
  console.log(`  ${row.table_name.padEnd(28)} ${c.rows[0].n}`);
}

await client.end();
