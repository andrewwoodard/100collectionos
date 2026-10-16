import { getNeonPool, json } from "./neon-db.js";
import { requireAdmin, requireSession } from "./require-session.js";

const VISION_PROMPT =
  "Describe this property photo concisely for accessibility alt text. Focus on what is visible: the room or outdoor space, key features, lighting, and atmosphere. Keep it under 125 characters. Do not start with 'Image of' or 'Photo of'. Return only the description.";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (v == null ? "" : String(v)));
}

function contextualAlt(
  index: number,
  opts: { name: string; market: string; type: string }
): string {
  const name = opts.name || "Luxury vacation rental";
  const market = opts.market;
  const type = opts.type || "property";
  const n = index + 1;
  const variants = market
    ? [
        `${name}, a luxury ${type} in ${market} — photo ${n}`,
        `${name} vacation rental in ${market} (image ${n})`,
        `Interior or exterior view of ${name} in ${market}`,
        `${name} in ${market} — curated property photography ${n}`,
      ]
    : [
        `${name}, a luxury ${type} — photo ${n}`,
        `${name} vacation rental (image ${n})`,
        `Interior or exterior view of ${name}`,
        `${name} — curated property photography ${n}`,
      ];
  return variants[index % variants.length];
}

function needsAlt(existing: string | null | undefined) {
  return !String(existing || "").trim();
}

async function visionAltForUrl(imageUrl: string): Promise<string | null> {
  const key = String(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || "").trim();
  const base =
    String(process.env.OPENAI_BASE_URL || process.env.AI_GATEWAY_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
  if (!key) return null;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
        max_tokens: 80,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[generatePropertyAltText] vision status", res.status);
      return null;
    }
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content || "")
      .replace(/^["']|["']$/g, "")
      .trim();
    return text.slice(0, 200) || null;
  } catch (e: any) {
    console.warn("[generatePropertyAltText] vision failed", e?.message || e);
    return null;
  }
}

async function loadProperty(propertyId: string) {
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.property
     WHERE id = $1 OR data->>'id' = $1
     LIMIT 1`,
    [propertyId]
  );
  if (!rows[0]) return null;
  const data = rows[0].data && typeof rows[0].data === "object" ? rows[0].data : {};
  return { id: rows[0].id, data };
}

/**
 * Ensure every photo_url has a non-empty alt text. Fills gaps with contextual
 * descriptions; optionally upgrades empty slots via vision when an API key is set.
 */
export async function ensurePropertyAltTexts(
  propertyId: string,
  opts: { useVision?: boolean; visionLimit?: number } = {}
) {
  const row = await loadProperty(propertyId);
  if (!row) return { error: "Property not found", status: 404 as const };

  const photoUrls = asStringArray(row.data.photo_urls).filter(Boolean);
  if (!photoUrls.length) {
    return {
      success: true,
      property_id: row.id,
      photo_alt_texts: [],
      generated_count: 0,
      total: 0,
      filled: 0,
    };
  }

  const existing = asStringArray(row.data.photo_alt_texts);
  const alts: string[] = photoUrls.map((_, i) => String(existing[i] || "").trim());
  const meta = {
    name: String(row.data.property_name || "Property").trim() || "Property",
    market: String(row.data.market || row.data.location_full || row.data.location_city || "").trim(),
    type: String(row.data.property_type || "home").trim().toLowerCase() || "home",
  };

  let filled = 0;
  let visionUsed = 0;
  const visionLimit = Math.max(0, Number(opts.visionLimit ?? 12) || 0);
  const useVision = !!opts.useVision;

  for (let i = 0; i < photoUrls.length; i++) {
    if (!needsAlt(alts[i])) continue;

    let alt: string | null = null;
    if (useVision && visionUsed < visionLimit) {
      alt = await visionAltForUrl(photoUrls[i]);
      if (alt) visionUsed += 1;
    }
    if (!alt) alt = contextualAlt(i, meta);
    alts[i] = alt;
    filled += 1;
  }

  if (filled > 0) {
    const pool = getNeonPool();
    await pool.query(
      `UPDATE base44.property
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
           updated_date = NOW()
       WHERE id = $1`,
      [
        row.id,
        JSON.stringify({
          photo_alt_texts: alts,
          updated_date: new Date().toISOString(),
        }),
      ]
    );
  }

  return {
    success: true,
    property_id: row.id,
    photo_alt_texts: alts,
    generated_count: filled,
    vision_count: visionUsed,
    total: photoUrls.length,
    filled,
  };
}

/** Backfill every property that has photos but missing/short alt arrays. */
export async function ensureAllPropertyAltTexts(opts: { limit?: number } = {}) {
  const pool = getNeonPool();
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 200));
  const { rows } = await pool.query(
    `SELECT id
     FROM base44.property
     WHERE jsonb_array_length(COALESCE(data->'photo_urls','[]'::jsonb)) > 0
       AND (
         data->'photo_alt_texts' IS NULL
         OR jsonb_typeof(data->'photo_alt_texts') <> 'array'
         OR jsonb_array_length(COALESCE(data->'photo_alt_texts','[]'::jsonb))
            < jsonb_array_length(data->'photo_urls')
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(data->'photo_alt_texts','[]'::jsonb)) t(v)
           WHERE trim(v) = ''
         )
       )
     ORDER BY updated_date DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  const results: Array<{ id: string; filled?: number; error?: string }> = [];
  for (const r of rows) {
    try {
      const out = await ensurePropertyAltTexts(String(r.id), { useVision: false });
      if ("error" in out && out.error) results.push({ id: r.id, error: out.error });
      else results.push({ id: r.id, filled: (out as any).filled || 0 });
    } catch (e: any) {
      results.push({ id: r.id, error: e?.message || "failed" });
    }
  }
  return {
    success: true,
    processed: results.length,
    results,
  };
}

export async function handleGeneratePropertyAltText(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const wantsVision = body?.use_vision === true || body?.action === "ensure_all";
  // Bulk backfill + vision upgrades are admin-only. Gap-fill (contextual alts) is
  // allowed for any signed-in user so portal property pages can auto-ensure.
  const gate = wantsVision ? await requireAdmin(req) : await requireSession(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  if (body?.action === "ensure_all") {
    const out = await ensureAllPropertyAltTexts({ limit: body?.limit });
    return json(res, 200, out);
  }

  const propertyId = String(body?.property_id || "").trim();
  if (!propertyId) return json(res, 400, { error: "property_id is required" });

  const useVision = body?.use_vision === true;
  const out = await ensurePropertyAltTexts(propertyId, {
    useVision,
    visionLimit: body?.vision_limit ?? 12,
  });
  if ("status" in out && out.status) return json(res, out.status, { error: out.error });
  return json(res, 200, out);
}
