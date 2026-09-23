import { json, readBuffer } from "./neon-db.js";
import { handleNeonEntity } from "./neon-entities.js";
import { handleNeonFunction, LOCAL_FUNCTIONS } from "./neon-functions.js";
import { requireSession } from "./require-session.js";

const BASE44_ORIGIN = process.env.VITE_BASE44_APP_BASE_URL || "https://100c-os.base44.app";

function requestUrl(req: any) {
  const host = req.headers.host || "localhost";
  const proto = String(req.headers["x-forwarded-proto"] || "https");
  return new URL(req.url || "/", `${proto}://${host}`);
}

function parseAppsPath(url: URL) {
  let forwarded = url.searchParams.get("path");
  url.searchParams.delete("path");
  if (forwarded == null) {
    forwarded = (url.pathname || "").replace(/^\/api\/apps\/?/, "");
  }
  const segments = String(forwarded || "").split("/").filter(Boolean);
  return { segments, search: url.searchParams };
}

async function proxyBase44(req: any, res: any, segments: string[], search: URLSearchParams) {
  const qs = search.toString();
  const dest = `${BASE44_ORIGIN}/api/apps/${segments.map(encodeURIComponent).join("/")}${qs ? `?${qs}` : ""}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (!value || key === "host" || key === "connection" || key === "content-length") continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const method = (req.method || "GET").toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await readBuffer(req);
  const upstream = await fetch(dest, { method, headers, body, redirect: "manual" });
  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (key === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

export async function handleAppsRequest(req: any, res: any) {
  try {
    const { segments, search } = parseAppsPath(requestUrl(req));
    const [, kind, name, ...restParts] = segments;
    const rest = restParts.join("/");

    if (kind === "entities" && name) {
      const gate = await requireSession(req);
      if ("error" in gate && gate.error) {
        const method = (req.method || "GET").toUpperCase();
        if (method === "GET" && !rest) return json(res, 200, []);
        if (method === "GET" && rest === "count") return json(res, 200, { count: 0 });
        if (method === "GET" && (rest === "v2/list" || rest === "v2/list/")) {
          return json(res, 200, { items: [], has_more: false, next_cursor: null });
        }
        return json(res, gate.error, { message: gate.message });
      }
      return handleNeonEntity(req, res, name, rest, search);
    }

    if (kind === "functions" && name && LOCAL_FUNCTIONS.has(name)) {
      const gate = await requireSession(req);
      if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });
      const handled = await handleNeonFunction(req, res, name);
      if (handled) return;
    }

    if (!segments.length) return json(res, 404, { message: "Not found" });
    return proxyBase44(req, res, segments, search);
  } catch (error: any) {
    console.error("[apps-http]", error);
    return json(res, 500, { message: error.message || "Apps handler error" });
  }
}
