import { toNodeHandler } from "better-auth/node";
import { auth } from "../server/auth.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const handle = toNodeHandler(auth);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `https://${host}`);
  const forwarded = url.searchParams.get("path");
  if (forwarded != null) {
    url.pathname = `/api/auth/${forwarded}`;
    url.searchParams.delete("path");
    req.url = url.pathname + url.search;
  }
  return handle(req, res);
}
