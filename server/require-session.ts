import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { getNeonPool } from "./neon-db.js";

function isDevAdminEnabled() {
  const raw = String(process.env.VITE_AUTH_DEV_ADMIN || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export async function requireSession(req: any) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) return { error: 401 as const, message: "Sign in required" };
    return { session };
  } catch (error: any) {
    console.error("[requireSession]", error?.message || error);
    return { error: 401 as const, message: "Sign in required" };
  }
}

export async function requireAdmin(req: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return gate;
  const user = gate.session.user as { role?: string; email?: string };
  if (user.role === "admin" || isDevAdminEnabled()) return gate;
  const email = String(user.email || "").trim().toLowerCase();
  if (email) {
    try {
      const { rows } = await getNeonPool().query(
        `SELECT data->>'role' AS role FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
        [email]
      );
      if (rows[0]?.role === "admin") return gate;
    } catch (error: any) {
      console.error("[requireAdmin] role lookup failed", error?.message || error);
      return { error: 503 as const, message: "Unable to verify admin access" };
    }
  }
  return { error: 403 as const, message: "Admin access required" };
}
