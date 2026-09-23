import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { getNeonPool } from "./neon-db.js";

export async function requireSession(req: any) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return { error: 401 as const, message: "Sign in required" };
  return { session };
}

export async function requireAdmin(req: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return gate;
  const user = gate.session.user as { role?: string; email?: string };
  if (user.role === "admin" || process.env.VITE_AUTH_DEV_ADMIN === "true") return gate;
  const email = String(user.email || "").trim().toLowerCase();
  if (email) {
    const { rows } = await getNeonPool().query(
      `SELECT data->>'role' AS role FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
      [email]
    );
    if (rows[0]?.role === "admin") return gate;
  }
  return { error: 403 as const, message: "Admin access required" };
}
