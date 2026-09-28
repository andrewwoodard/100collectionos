import { getNeonPool } from "./neon-db.js";

const APP_ID = process.env.VITE_BASE44_APP_ID || "69aee092656fb9813439389b";
const APP_BASE = (process.env.VITE_BASE44_APP_BASE_URL || "https://100c-os.base44.app").replace(
  /\/$/,
  ""
);

let schemaReady: Promise<void> | null = null;

export function ensurePasswordMigrationSchema(query: (sql: string) => Promise<unknown>) {
  if (!schemaReady) {
    schemaReady = Promise.resolve(
      query(
        `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false`
      )
    ).then(() => undefined);
  }
  return schemaReady;
}

/**
 * Confirm an email/password pair against live Base44. Hashes are not exported,
 * so this is the only way to honor an existing portal password. The access
 * token is discarded.
 */
export async function verifyBase44Password(email: string, password: string) {
  const key = String(email || "").trim().toLowerCase();
  if (!key || !key.includes("@") || !password) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${APP_BASE}/api/apps/${APP_ID}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": APP_ID,
      },
      body: JSON.stringify({ email: key, password }),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
    return Boolean(data?.access_token);
  } catch (error) {
    console.warn("[auth] Base44 password check failed", (error as Error).message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function clearMustChangePassword(userId: string) {
  if (!userId) return;
  await ensurePasswordMigrationSchema((sql) => getNeonPool().query(sql));
  await getNeonPool().query(
    `UPDATE "user" SET "mustChangePassword" = false, "updatedAt" = now() WHERE id = $1`,
    [userId]
  );
}
