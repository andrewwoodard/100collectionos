import { getNeonPool, json } from "./neon-db.js";
import { requireAdmin } from "./require-session.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function requestStatus(url: string, method: "HEAD" | "GET") {
  const res = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(method === "HEAD" ? 7000 : 8000),
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (method === "GET") await res.body?.cancel().catch(() => {});
  return { status: res.status, finalUrl: res.url || url };
}

export async function probeVrmUrl(url: string) {
  try {
    const head = await requestStatus(url, "HEAD");
    if (head.status !== 404 && head.status !== 405 && head.status !== 403 && head.status < 400) {
      return { status: head.status, finalUrl: head.finalUrl, error: null as string | null };
    }
    try {
      const get = await requestStatus(url, "GET");
      return { status: get.status, finalUrl: get.finalUrl, error: null as string | null };
    } catch (error: any) {
      if (head.status === 404) return { status: 404, finalUrl: head.finalUrl, error: null };
      return { status: head.status, finalUrl: head.finalUrl, error: error?.message || "Request failed" };
    }
  } catch (error: any) {
    try {
      const get = await requestStatus(url, "GET");
      return { status: get.status, finalUrl: get.finalUrl, error: null as string | null };
    } catch (getError: any) {
      return {
        status: null,
        finalUrl: url,
        error: getError?.message || error?.message || "Request failed",
      };
    }
  }
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      out[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return out;
}

export async function handleCheckPropertyLinks(req: any, res: any, body: any) {
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const pool = getNeonPool();
  const ids = (Array.isArray(body?.ids) ? body.ids : [])
    .map((id: unknown) => String(id || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!ids.length) {
    return json(res, 200, { ok: true, checked: 0, remaining: 0, total: 0, results: [] });
  }

  const { rows } = await pool.query(
    `SELECT id, name, vrm_url
     FROM supabase.propertiesbase44
     WHERE id = ANY($1::text[])
       AND vrm_url ~* '^https?://'`,
    [ids]
  );

  const checkedAt = new Date().toISOString();
  const results = await mapPool(rows, 4, async (row) => {
    const probe = await probeVrmUrl(String(row.vrm_url));
    const status = probe.status == null ? "error" : String(probe.status);
    const ok = status === "200" || status === "201" || status === "204" || (probe.status != null && probe.status >= 300 && probe.status < 400);
    await pool.query(
      `UPDATE supabase.propertiesbase44
       SET last_page_check_status = $2,
           last_page_check_ok = $3,
           last_page_check_at = $4,
           last_page_check_error = $5,
           last_page_check_final_url = $6
       WHERE id = $1`,
      [row.id, status, ok ? "true" : "false", checkedAt, probe.error, probe.finalUrl]
    );
    return {
      id: String(row.id),
      name: row.name,
      vrm_url: row.vrm_url,
      status,
      ok,
      checked_at: checkedAt,
      final_url: probe.finalUrl,
      error: probe.error,
    };
  });

  return json(res, 200, {
    ok: true,
    checked: results.length,
    remaining: 0,
    total: results.length,
    results,
  });
}
