import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

export async function requireSession(req: any) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return { error: 401 as const, message: "Sign in required" };
  return { session };
}
