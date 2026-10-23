import { getNeonPool, json } from "./neon-db.js";
import { hasRemoteSupabase, supabaseRest } from "./supabase-remote.js";

function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function destRecord(row: any) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return { ...data, id: row.id };
}

async function loadDestination(destinationId: string, bodyData?: Record<string, any> | null) {
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.destination WHERE id = $1 OR data->>'id' = $1 LIMIT 1`,
    [destinationId]
  );
  const stored = rows[0] ? destRecord(rows[0]) : null;
  if (!stored && !bodyData?.name) return null;
  return { ...(stored || {}), ...(bodyData || {}), id: stored?.id || bodyData?.id || destinationId };
}

async function upsertRemoteDestination(dest: Record<string, any>) {
  if (!hasRemoteSupabase()) {
    return { skipped: true as const, reason: "Supabase credentials missing" };
  }

  const payload: Record<string, any> = {
    base44_destination_id: String(dest.id),
    name: dest.name,
    slug: dest.slug || slugify(dest.name),
    is_exclusive: !!dest.is_exclusive,
    geocode_query: dest.geocode_query || null,
    latitude: toNum(dest.latitude),
    longitude: toNum(dest.longitude),
    updated_at: new Date().toISOString(),
  };

  const existing = await supabaseRest(
    `destinations?base44_destination_id=eq.${encodeURIComponent(payload.base44_destination_id)}&select=id&limit=1`
  );
  const match = Array.isArray(existing) ? existing[0] : null;

  const tryWrite = async (fields: Record<string, any>, method: "PATCH" | "POST", path: string) => {
    try {
      return await supabaseRest(path, { method, body: JSON.stringify(fields) });
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Older destinations tables may lack lat/lng columns — retry without them.
      if (/geocode_query|latitude|longitude/i.test(msg)) {
        const {
          geocode_query: _g,
          latitude: _lat,
          longitude: _lng,
          ...legacy
        } = fields;
        return await supabaseRest(path, { method, body: JSON.stringify(legacy) });
      }
      throw err;
    }
  };

  if (match?.id != null) {
    const patched = await tryWrite(payload, "PATCH", `destinations?id=eq.${encodeURIComponent(String(match.id))}`);
    return {
      skipped: false as const,
      action: "updated" as const,
      supabase_id: match.id,
      row: Array.isArray(patched) ? patched[0] : patched,
    };
  }

  const created = await tryWrite(
    { ...payload, created_at: new Date().toISOString() },
    "POST",
    "destinations"
  );
  return {
    skipped: false as const,
    action: "created" as const,
    row: Array.isArray(created) ? created[0] : created,
  };
}

export async function handleSyncDestinationToSupabase(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const action = body?.action || "sync";
  const destinationId = body?.destinationId || body?.event?.entity_id || body?.data?.id;

  // Optional: run when SUPABASE_DB_PASSWORD is set (adds lat/lng columns).
  if (action === "create_table" || action === "ensure_columns") {
    const pw =
      process.env.SUPABASE_DB_PASSWORD ||
      process.env.BASE44_SUPABASE_DB_PASSWORD ||
      "";
    const url = (process.env.BASE44_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
    if (!pw || !url) {
      return json(res, 200, {
        status: "skipped",
        message: "Set SUPABASE_DB_PASSWORD to add geocode columns on classic destinations.",
      });
    }
    const { Client } = await import("pg");
    const projectRef = url.replace("https://", "").split(".")[0];
    const client = new Client({
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: pw,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      await client.query(`
        ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS geocode_query TEXT;
        ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
        ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
      `);
    } finally {
      await client.end();
    }
    return json(res, 200, { status: "ok", message: "destinations geocode columns ensured" });
  }

  if (action === "sync") {
    if (!destinationId) return json(res, 400, { error: "destinationId required" });
    const dest = await loadDestination(String(destinationId), body?.data || null);
    if (!dest?.name) return json(res, 404, { error: "Destination not found" });
    const result = await upsertRemoteDestination(dest);
    return json(res, 200, { id: dest.id, name: dest.name, ...result });
  }

  if (action === "backfill") {
    const pool = getNeonPool();
    const { rows } = await pool.query(
      `SELECT id, data FROM base44.destination ORDER BY created_date DESC NULLS LAST LIMIT 500`
    );
    const results: any[] = [];
    const errors: any[] = [];
    for (const row of rows) {
      const dest = destRecord(row);
      try {
        results.push({ id: dest.id, name: dest.name, ...(await upsertRemoteDestination(dest)) });
      } catch (e: any) {
        errors.push({ id: dest.id, name: dest.name, error: e?.message || String(e) });
      }
    }
    return json(res, 200, { total: rows.length, synced: results.length, results, errors });
  }

  return json(res, 400, { error: "Unknown action" });
}
