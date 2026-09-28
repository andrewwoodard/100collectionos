/**
 * Create Better Auth users for every Base44 User (by email).
 *
 * Existing Better Auth accounts are left in place (same id, Google/password
 * links). Roles and names are synced from Base44. Passwords are not copied;
 * people sign in with magic link, Google, or a password reset.
 *
 * Usage: npm run import:betterauth-users
 */
import { randomBytes } from "node:crypto";
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

const APP_ROLES = new Set(["admin", "operations", "onboarding", "finance", "marketing", "partner", "user"]);
const PARTNER_ROLES = new Set(["owner", "marketing", "finance", "operations"]);
const APP_ID = process.env.VITE_BASE44_APP_ID || "69aee092656fb9813439389b";
const APP_BASE = (process.env.VITE_BASE44_APP_BASE_URL || "https://100c-os.base44.app").replace(/\/$/, "");
const TOKEN = process.env.BASE44_SERVICE_TOKEN || process.env.BASE44_ACCESS_TOKEN || "";
const PAGE_SIZE = 100;

function asEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function newAuthId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(32), (b) => chars[b % chars.length]).join("");
}

function asBool(value) {
  return value === true || value === "true" || value === "t" || value === 1 || value === "1";
}

function asRole(value, fallback = "partner") {
  const role = String(value || "").trim().toLowerCase();
  return APP_ROLES.has(role) ? role : fallback;
}

function asPartnerRole(value, fallback = "owner") {
  const role = String(value || "").trim().toLowerCase();
  return PARTNER_ROLES.has(role) ? role : fallback;
}

function parseTs(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchLiveBase44Users() {
  if (!TOKEN) return [];
  const headers = { "X-App-Id": APP_ID, Authorization: `Bearer ${TOKEN}` };
  const rows = [];
  const seen = new Set();
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const res = await fetch(
      `${APP_BASE}/api/apps/${APP_ID}/entities/User?limit=${PAGE_SIZE}&skip=${skip}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`Base44 User list HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    for (const row of data) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function normalizePortalUser(row) {
  const data = row.data && typeof row.data === "object" ? row.data : row;
  const email = asEmail(data.email);
  if (!email || !email.includes("@")) return null;
  if (asBool(data.is_service)) return null;
  return {
    portalId: String(row.id || data.id || ""),
    email,
    name: String(data.full_name || data.name || email.split("@")[0]).trim() || email.split("@")[0],
    role: asRole(data.role, "user"),
    partner_role: asPartnerRole(data.partner_role, "owner"),
    emailVerified: asBool(data.is_verified),
    createdAt: parseTs(data.created_date || row.created_date) || new Date(),
    image: data.image || data.profile_image || null,
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is required");
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows: neonRows } = await client.query(
      `SELECT id, created_date, data FROM base44."user"`
    );
    let liveRows = [];
    try {
      liveRows = await fetchLiveBase44Users();
    } catch (error) {
      console.warn(`[import] live Base44 fetch failed (${error.message}); using Neon copy`);
    }

    const byEmail = new Map();
    for (const row of neonRows) {
      const user = normalizePortalUser(row);
      if (user) byEmail.set(user.email, user);
    }
    for (const row of liveRows) {
      const user = normalizePortalUser(row);
      if (user) byEmail.set(user.email, user);
    }

    const portalUsers = [...byEmail.values()];
    if (!portalUsers.length) {
      throw new Error("No Base44 users found to import");
    }

    const { rows: authRows } = await client.query(
      `SELECT id, email, name, role, partner_role, "emailVerified" FROM "user"`
    );
    const authByEmail = new Map(authRows.map((row) => [asEmail(row.email), row]));

    const summary = { inserted: 0, updated: 0, unchanged: 0, skipped: 0 };
    const insertedEmails = [];
    const updatedEmails = [];

    await client.query("BEGIN");
    try {
      for (const user of portalUsers) {
        const existing = authByEmail.get(user.email);
        if (!existing) {
          await client.query(
            `INSERT INTO "user"
              (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, partner_role)
             VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)`,
            [
              newAuthId(),
              user.name,
              user.email,
              user.emailVerified,
              user.image,
              user.createdAt,
              user.role,
              user.partner_role,
            ]
          );
          summary.inserted += 1;
          insertedEmails.push(user.email);
          continue;
        }

        const nextName = existing.name && existing.name !== existing.email.split("@")[0]
          ? existing.name
          : user.name;
        const nextVerified = Boolean(existing.emailVerified) || user.emailVerified;
        const roleChanged = existing.role !== user.role || existing.partner_role !== user.partner_role;
        const nameChanged = nextName !== existing.name;
        const verifiedChanged = nextVerified !== Boolean(existing.emailVerified);
        if (!roleChanged && !nameChanged && !verifiedChanged) {
          summary.unchanged += 1;
          continue;
        }

        await client.query(
          `UPDATE "user"
           SET name = $2,
               role = $3,
               partner_role = $4,
               "emailVerified" = $5,
               "updatedAt" = now()
           WHERE id = $1`,
          [existing.id, nextName, user.role, user.partner_role, nextVerified]
        );
        summary.updated += 1;
        updatedEmails.push(user.email);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const { rows: afterAuth } = await client.query(
      `SELECT lower(email) AS email, role FROM "user"`
    );
    const afterEmails = new Set(afterAuth.map((row) => row.email));
    const missing = portalUsers.filter((user) => !afterEmails.has(user.email)).map((user) => user.email);
    const extra = afterAuth
      .map((row) => row.email)
      .filter((email) => !byEmail.has(email));
    const roleCounts = {};
    for (const row of afterAuth) {
      roleCounts[row.role || "(none)"] = (roleCounts[row.role || "(none)"] || 0) + 1;
    }

    console.log(JSON.stringify({
      source: {
        neonBase44: neonRows.length,
        liveBase44: liveRows.length,
        uniquePortalEmails: portalUsers.length,
      },
      betterAuth: {
        before: authRows.length,
        after: afterAuth.length,
        inserted: summary.inserted,
        updated: summary.updated,
        unchanged: summary.unchanged,
        skipped: summary.skipped,
        roleCounts,
      },
      match: {
        allPortalUsersInBetterAuth: missing.length === 0,
        missingFromBetterAuth: missing,
        betterAuthOnly: extra,
      },
      insertedSample: insertedEmails.slice(0, 8),
      updated: updatedEmails,
    }, null, 2));

    if (missing.length) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[import:betterauth-users]", error.message || error);
  process.exit(1);
});
