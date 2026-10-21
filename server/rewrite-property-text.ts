import { getNeonPool, json } from "./neon-db.js";
import { requireAdmin } from "./require-session.js";

type PropertyContext = {
  property_name?: string | null;
  market?: string | null;
  destination?: string | null;
  address?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  bedrooms?: string | number | null;
  bathrooms?: string | number | null;
  half_bathrooms?: string | number | null;
  sleeps?: string | number | null;
  property_type?: string | null;
  amenities?: unknown;
  unique_feature?: string | null;
  why_onehundred?: string | null;
  excerpt?: string | null;
  headline?: string | null;
  text?: string | null;
  partner_name?: string | null;
};

function trimStr(v: unknown, max = 4000) {
  const s = String(v ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function amenitiesList(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((a) => {
        if (typeof a === "string") return a;
        if (a && typeof a === "object") {
          const o = a as Record<string, unknown>;
          return String(o.name || o.label || o.title || "").trim();
        }
        return "";
      })
      .filter(Boolean)
      .slice(0, 40)
      .join(", ");
  }
  if (typeof value === "string") return trimStr(value, 800);
  return "";
}

async function loadPropertyContext(propertyId: string): Promise<PropertyContext | null> {
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.property
     WHERE id = $1 OR data->>'id' = $1
     LIMIT 1`,
    [propertyId]
  );
  const base = rows[0]?.data && typeof rows[0].data === "object" ? rows[0].data : null;

  let sb: Record<string, unknown> | null = null;
  try {
    const sbRes = await pool.query(
      `SELECT name, destination, address, location_city, location_state,
              bedrooms, bathrooms, half_bathrooms, occupancy, house_type,
              unique_feature, why_onehundred, excerpt, headline, text,
              partner_name, propdescription
       FROM supabase.propertiesbase44
       WHERE id = $1 OR source_id = $1 OR row_id = $1
          OR ($2::text IS NOT NULL AND lower(name) = lower($2))
       LIMIT 1`,
      [propertyId, base?.property_name || null]
    );
    if (sbRes.rows[0]) sb = sbRes.rows[0];
  } catch {
    /* propertiesbase44 optional */
  }

  if (!base && !sb) return null;

  return {
    property_name: (sb?.name as string) || base?.property_name || null,
    market: base?.market || (sb?.destination as string) || null,
    destination: (sb?.destination as string) || base?.market || null,
    address: (sb?.address as string) || base?.address || null,
    location_city: (sb?.location_city as string) || base?.location_city || null,
    location_state: (sb?.location_state as string) || base?.location_state || null,
    bedrooms: sb?.bedrooms ?? base?.bedrooms ?? null,
    bathrooms: sb?.bathrooms ?? base?.bathrooms ?? null,
    half_bathrooms: sb?.half_bathrooms ?? base?.half_bathrooms ?? null,
    sleeps: sb?.occupancy ?? base?.sleeps ?? null,
    property_type: (sb?.house_type as string) || base?.property_type || null,
    amenities: base?.amenities || null,
    unique_feature: (sb?.unique_feature as string) || base?.unique_feature || null,
    why_onehundred: (sb?.why_onehundred as string) || base?.why_onehundred || null,
    excerpt: (sb?.excerpt as string) || base?.excerpt || null,
    headline: (sb?.headline as string) || base?.headline || null,
    text: (sb?.text as string) || base?.text || (sb?.propdescription as string) || null,
    partner_name: (sb?.partner_name as string) || base?.partner_name || null,
  };
}

function buildPrompt(ctx: PropertyContext, opts: {
  currentText?: string;
  previousSuggestion?: string;
  notes?: string;
}) {
  const place = [ctx.location_city, ctx.location_state, ctx.market || ctx.destination, ctx.address]
    .filter(Boolean)
    .join(" · ");
  const beds = [ctx.bedrooms != null ? `${ctx.bedrooms} bedrooms` : "", ctx.bathrooms != null ? `${ctx.bathrooms} bathrooms` : "", ctx.sleeps != null ? `sleeps ${ctx.sleeps}` : ""]
    .filter(Boolean)
    .join(", ");
  const amenities = amenitiesList(ctx.amenities);

  return `You write property descriptions for The 100 Collection — a curated portfolio of luxury vacation rentals.

Write replacement body copy for the property's "text" section. Requirements:
- Informative and inviting, warm premium editorial voice (not salesy or clickbait)
- Clearly lay out the property's standout features and layout using only the facts provided
- Include a short section on great things to do nearby / in the area when location context exists — keep it plausible for that destination; do not invent specific businesses that are not implied by the location
- Prefer 3–5 short paragraphs separated by blank lines
- Do not invent amenities, bed counts, or views that are not in the facts
- Do not include a title/headline, markdown headings, bullet lists, or quotes around the whole piece
- Return ONLY the description text

Property facts:
- Name: ${trimStr(ctx.property_name) || "Unknown"}
- Partner: ${trimStr(ctx.partner_name) || "n/a"}
- Location: ${trimStr(place) || "n/a"}
- Type: ${trimStr(ctx.property_type) || "n/a"}
- Specs: ${beds || "n/a"}
- Amenities: ${amenities || "n/a"}
- Unique feature: ${trimStr(ctx.unique_feature) || "n/a"}
- Why 100 Collection: ${trimStr(ctx.why_onehundred) || "n/a"}
- Headline: ${trimStr(ctx.headline) || "n/a"}
- Excerpt: ${trimStr(ctx.excerpt) || "n/a"}
- Current text:
${trimStr(opts.currentText || ctx.text, 6000) || "(none)"}
${opts.previousSuggestion ? `\nPrevious suggestion to improve upon:\n${trimStr(opts.previousSuggestion, 6000)}\n` : ""}
${opts.notes ? `\nEditor notes for this rewrite:\n${trimStr(opts.notes, 1000)}\n` : ""}`;
}

async function callLlm(prompt: string): Promise<string> {
  const key = String(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || "").trim();
  const base = String(
    process.env.OPENAI_BASE_URL || process.env.AI_GATEWAY_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  if (!key) throw new Error("AI is not configured (missing OPENAI_API_KEY)");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 1400,
      messages: [
        {
          role: "system",
          content:
            "You are an editorial writer for The 100 Collection luxury vacation rentals. Output plain text only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status})${errText ? `: ${errText.slice(0, 200)}` : ""}`);
  }
  const data = await res.json();
  const text = String(data?.choices?.[0]?.message?.content || "")
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!text) throw new Error("AI returned empty text");
  return text;
}

export async function handleRewritePropertyText(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const propertyId = String(body?.property_id || "").trim();
  const clientCtx = body?.context && typeof body.context === "object" ? (body.context as PropertyContext) : null;

  let ctx: PropertyContext | null = null;
  if (propertyId) ctx = await loadPropertyContext(propertyId);
  if (!ctx && clientCtx) ctx = clientCtx;
  if (ctx && clientCtx) ctx = { ...ctx, ...clientCtx };
  if (!ctx) return json(res, 400, { error: "property_id or context is required" });

  const currentText = trimStr(body?.current_text ?? ctx.text, 6000);
  const previousSuggestion = trimStr(body?.previous_suggestion, 6000);
  const notes = trimStr(body?.notes, 1000);

  try {
    const prompt = buildPrompt(ctx, { currentText, previousSuggestion, notes });
    const text = await callLlm(prompt);
    return json(res, 200, { ok: true, text });
  } catch (e: any) {
    console.error("[rewritePropertyText]", e?.message || e);
    return json(res, 500, { error: e?.message || "Failed to generate text" });
  }
}
