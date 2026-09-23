import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { getNeonPool, json, newId, readBody } from "./neon-db.js";
import { takeResetResult } from "./reset-email.js";

const APP_ROLES = new Set(["admin", "operations", "onboarding", "finance", "marketing", "partner", "user"]);
const PARTNER_ROLES = new Set(["owner", "marketing", "finance", "operations"]);

function newAuthId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(32), (b) => chars[b % chars.length]).join("");
}

function asEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function requireAdmin(req: any) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return { error: 401 as const, message: "Sign in required" };
  if (session.user.role === "admin" || process.env.VITE_AUTH_DEV_ADMIN === "true") {
    return { session };
  }
  const email = asEmail(session.user.email);
  if (email) {
    const { rows } = await getNeonPool().query(
      `SELECT data->>'role' AS role FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
      [email]
    );
    if (rows[0]?.role === "admin") return { session };
  }
  return { error: 403 as const, message: "Admin access required" };
}

function parseIds(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

async function listUsers() {
  const pool = getNeonPool();
  const [authUsers, accounts, sessions, portalUsers, partners] = await Promise.all([
    pool.query(`SELECT id, name, email, role, partner_role, "emailVerified", "createdAt", "updatedAt", image FROM "user"`),
    pool.query(`SELECT "userId", "providerId", password FROM account`),
    pool.query(`SELECT DISTINCT ON ("userId") "userId", "updatedAt" AS last_seen FROM session ORDER BY "userId", "updatedAt" DESC`),
    pool.query(`SELECT id, created_date, updated_date, data FROM base44."user"`),
    pool.query(`SELECT id, data FROM base44.partner`),
  ]);

  const accountsByUser = new Map<string, { providers: string[]; hasPassword: boolean }>();
  for (const row of accounts.rows) {
    const current = accountsByUser.get(row.userId) || { providers: [], hasPassword: false };
    current.providers.push(row.providerId);
    if (row.providerId === "credential" && row.password) current.hasPassword = true;
    accountsByUser.set(row.userId, current);
  }

  const lastSeen = new Map(sessions.rows.map((row) => [row.userId, row.last_seen]));

  const partnerByUserId = new Map<string, { id: string; name: string }>();
  const partnerByEmail = new Map<string, { id: string; name: string }>();
  for (const row of partners.rows) {
    const data = row.data || {};
    const info = { id: row.id, name: data.partner_name || data.company_name || "" };
    const ids = [
      data.portal_user_id,
      ...parseIds(data.portal_user_ids),
    ].filter(Boolean);
    for (const id of ids) partnerByUserId.set(String(id), info);
    const email = asEmail(data.primary_contact_email);
    if (email) partnerByEmail.set(email, info);
  }

  const byEmail = new Map<string, any>();

  for (const row of authUsers.rows) {
    const email = asEmail(row.email);
    if (!email) continue;
    const acct = accountsByUser.get(row.id) || { providers: [], hasPassword: false };
    byEmail.set(email, {
      email,
      authId: row.id,
      portalId: null,
      name: row.name || "",
      role: row.role || "partner",
      partner_role: row.partner_role || "owner",
      emailVerified: !!row.emailVerified,
      hasPassword: acct.hasPassword,
      providers: acct.providers,
      canLogin: acct.providers.length > 0,
      lastSignIn: lastSeen.get(row.id) || null,
      createdAt: row.createdAt,
      disabled: false,
      partner: partnerByEmail.get(email) || null,
    });
  }

  for (const row of portalUsers.rows) {
    const data = row.data || {};
    const email = asEmail(data.email);
    if (!email) continue;
    const partner = partnerByUserId.get(row.id) || partnerByEmail.get(email) || null;
    const existing = byEmail.get(email);
    if (existing) {
      existing.portalId = row.id;
      existing.name = existing.name || data.full_name || "";
      existing.role = data.role || existing.role;
      existing.partner_role = data.partner_role || existing.partner_role;
      existing.disabled = !!data.disabled;
      existing.partner = existing.partner || partner;
      existing.createdAt = existing.createdAt || row.created_date || data.created_date;
      continue;
    }
    byEmail.set(email, {
      email,
      authId: null,
      portalId: row.id,
      name: data.full_name || "",
      role: data.role || "user",
      partner_role: data.partner_role || "owner",
      emailVerified: !!data.is_verified,
      hasPassword: false,
      providers: [],
      canLogin: false,
      lastSignIn: null,
      createdAt: row.created_date || data.created_date,
      disabled: !!data.disabled,
      partner,
    });
  }

  return [...byEmail.values()].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

async function findAuthUser(email: string) {
  const { rows } = await getNeonPool().query(
    `SELECT id, name, email, role, partner_role FROM "user" WHERE lower(email) = $1 LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findPortalUser(email: string) {
  const { rows } = await getNeonPool().query(
    `SELECT id, data FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function ensureAuthUser({
  email,
  name,
  role,
  partner_role,
}: {
  email: string;
  name?: string;
  role?: string;
  partner_role?: string;
}) {
  const existing = await findAuthUser(email);
  if (existing) return existing;
  const portal = await findPortalUser(email);
  const id = newAuthId();
  const resolvedName = name || portal?.data?.full_name || email.split("@")[0];
  const resolvedRole = role || portal?.data?.role || "partner";
  const resolvedPartnerRole = partner_role || portal?.data?.partner_role || "owner";
  await getNeonPool().query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, partner_role)
     VALUES ($1, $2, $3, false, now(), now(), $4, $5)`,
    [id, resolvedName, email, resolvedRole, resolvedPartnerRole]
  );
  return { id, name: resolvedName, email, role: resolvedRole, partner_role: resolvedPartnerRole };
}

async function ensurePortalUser({
  email,
  name,
  role,
  partner_role,
}: {
  email: string;
  name?: string;
  role?: string;
  partner_role?: string;
}) {
  const existing = await findPortalUser(email);
  if (existing) return existing;
  const id = newId();
  const data = {
    id,
    email,
    full_name: name || email.split("@")[0],
    role: role || "partner",
    partner_role: partner_role || "owner",
    created_date: new Date().toISOString(),
    updated_date: new Date().toISOString(),
    disabled: false,
    is_verified: false,
  };
  await getNeonPool().query(
    `INSERT INTO base44."user" (id, created_date, updated_date, data)
     VALUES ($1, now(), now(), $2::jsonb)`,
    [id, JSON.stringify(data)]
  );
  return { id, data };
}

async function setCredentialPassword(userId: string, password: string) {
  const hashed = await hashPassword(password);
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id FROM account WHERE "userId" = $1 AND "providerId" = 'credential' LIMIT 1`,
    [userId]
  );
  if (rows[0]) {
    await pool.query(
      `UPDATE account SET password = $1, "updatedAt" = now() WHERE id = $2`,
      [hashed, rows[0].id]
    );
    return;
  }
  await pool.query(
    `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, 'credential', $2, $3, now(), now())`,
    [newAuthId(), userId, hashed]
  );
}

function originFromRequest(req: any) {
  const host = req.headers?.host;
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  return host ? `http://${host}` : "http://localhost:5173";
}

async function sendReset(req: any, email: string) {
  const user = await ensureAuthUser({ email });
  await ensurePortalUser({ email, name: user.name, role: user.role, partner_role: user.partner_role });
  const redirectTo = `${originFromRequest(req)}/reset-password`;
  const api = auth.api as any;
  try {
    const headers = fromNodeHeaders(req.headers);
    if (typeof api.requestPasswordReset === "function") {
      await api.requestPasswordReset({ body: { email, redirectTo }, headers });
    } else if (typeof api.forgetPassword === "function") {
      await api.forgetPassword({ body: { email, redirectTo }, headers });
    } else {
      throw new Error("Password reset is not available");
    }
  } catch (error: any) {
    const captured = takeResetResult(email);
    if (captured?.url) {
      return { sent: !!captured.sent, error: error.message, skipped: captured.skipped, resetUrl: captured.url };
    }
    throw error;
  }
  const captured = takeResetResult(email);
  return {
    sent: !!captured?.sent,
    skipped: captured?.skipped,
    error: captured?.error,
    resetUrl: captured?.url || null,
  };
}

async function handleAction(req: any, body: any) {
  const action = body?.action;
  const email = asEmail(body?.email);

  if (action === "create_user") {
    if (!email || !email.includes("@")) return { status: 400, body: { error: "A valid email is required" } };
    if (await findAuthUser(email) || await findPortalUser(email)) {
      return { status: 409, body: { error: "A user with that email already exists" } };
    }
    const name = String(body.name || email.split("@")[0]).trim();
    const role = APP_ROLES.has(body.role) ? body.role : "partner";
    const partner_role = PARTNER_ROLES.has(body.partner_role) ? body.partner_role : "owner";
    const password = String(body.password || "");
    if (password && password.length < 8) {
      return { status: 400, body: { error: "Password must be at least 8 characters" } };
    }
    const portal = await ensurePortalUser({ email, name, role, partner_role });
    const authUser = await ensureAuthUser({ email, name, role, partner_role });
    if (password) await setCredentialPassword(authUser.id, password);
    return {
      status: 200,
      body: { ok: true, user: { email, name, role, partner_role, portalId: portal.id, authId: authUser.id } },
    };
  }

  if (!email) return { status: 400, body: { error: "email is required" } };

  if (action === "set_password") {
    const password = String(body.password || "");
    if (password.length < 8) return { status: 400, body: { error: "Password must be at least 8 characters" } };
    const portal = await findPortalUser(email);
    const authUser = await ensureAuthUser({
      email,
      name: body.name || portal?.data?.full_name,
      role: portal?.data?.role,
      partner_role: portal?.data?.partner_role,
    });
    await ensurePortalUser({ email, name: authUser.name, role: authUser.role, partner_role: authUser.partner_role });
    await setCredentialPassword(authUser.id, password);
    return { status: 200, body: { ok: true } };
  }

  if (action === "send_reset") {
    const result = await sendReset(req, email);
    return { status: 200, body: { ok: true, ...result } };
  }

  if (action === "update_role") {
    const role = String(body.role || "");
    if (!APP_ROLES.has(role)) return { status: 400, body: { error: "Invalid role" } };
    const partner_role = PARTNER_ROLES.has(body.partner_role) ? body.partner_role : undefined;
    const pool = getNeonPool();
    await pool.query(
      `UPDATE "user" SET role = $2, partner_role = COALESCE($3, partner_role), "updatedAt" = now() WHERE lower(email) = $1`,
      [email, role, partner_role || null]
    );
    await pool.query(
      `UPDATE base44."user"
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
       WHERE lower(data->>'email') = $1`,
      [email, JSON.stringify({ role, ...(partner_role ? { partner_role } : {}), updated_date: new Date().toISOString() })]
    );
    return { status: 200, body: { ok: true, role, partner_role } };
  }

  if (action === "set_disabled") {
    const disabled = !!body.disabled;
    await getNeonPool().query(
      `UPDATE base44."user"
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
       WHERE lower(data->>'email') = $1`,
      [email, JSON.stringify({ disabled, updated_date: new Date().toISOString() })]
    );
    return { status: 200, body: { ok: true, disabled } };
  }

  return { status: 400, body: { error: "Unknown action" } };
}

export async function handleAdminUsers(req: any, res: any) {
  try {
    const gate = await requireAdmin(req);
    if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

    if (req.method === "GET") {
      const users = await listUsers();
      return json(res, 200, { users, total: users.length });
    }

    if (req.method === "POST") {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const result = await handleAction(req, body);
      return json(res, result.status, result.body);
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error: any) {
    console.error("[admin-users]", error);
    return json(res, 500, { error: error.message || "User management error" });
  }
}
