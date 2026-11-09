import { toNodeHandler } from "better-auth/node";
import { auth } from "../server/auth.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const handle = toNodeHandler(auth);

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Vercel rewrite target for /api/auth/*.
 *
 * Destination is /api/auth-handler/:path* (path in the URL path, not ?path=)
 * so the original query string (e.g. callbackURL, OAuth code/state) is kept.
 * Legacy ?path= rewrites are still accepted.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `https://${host}`);

  const legacyPath = url.searchParams.get("path");
  if (legacyPath != null) {
    url.pathname = `/api/auth/${legacyPath.replace(/^\/+/, "")}`;
    url.searchParams.delete("path");
    req.url = url.pathname + url.search;
    return handle(req, res);
  }

  if (url.pathname === "/api/auth-handler" || url.pathname.startsWith("/api/auth-handler/")) {
    const rest = url.pathname.slice("/api/auth-handler".length); // "" or "/reset-password/…"
    url.pathname = `/api/auth${rest || ""}`;
    req.url = url.pathname + url.search;
  }

  return handle(req, res);
}
