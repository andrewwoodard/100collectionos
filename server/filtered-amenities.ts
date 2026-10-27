import { getNeonPool, json } from "./neon-db.js";
import { hasRemoteSupabase, mirrorPropertiesbase44ToRemote } from "./supabase-remote.js";
import { requireAdmin } from "./require-session.js";

export const FILTERED_AMENITY_KEYS = [
  "pet_friendly",
  "private_pool",
  "private_hot_tub",
  "mountain_view",
  "fire_pit",
  "outdoor_space",
  "workspace_wifi",
  "parking",
] as const;

export type FilteredAmenityKey = (typeof FILTERED_AMENITY_KEYS)[number];

const KEY_SET = new Set<string>(FILTERED_AMENITY_KEYS);

const HEURISTIC_PATTERNS: Array<{
  key: FilteredAmenityKey;
  patterns: RegExp[];
  negations?: RegExp[];
}> = [
  {
    key: "pet_friendly",
    patterns: [
      /\bpet[- ]?friendly\b/i,
      /\bpets?\s+allowed\b/i,
      /\bpets?\s+welcome\b/i,
      /\bdog[- ]?friendly\b/i,
      /\bcat[- ]?friendly\b/i,
      /\bbring\s+your\s+(dog|pet)\b/i,
    ],
    negations: [/\bno\s+pets?\b/i, /\bpets?\s+not\s+allowed\b/i, /\bpet[- ]?free\b/i],
  },
  {
    key: "private_pool",
    patterns: [/\bprivate\s+pool\b/i, /\bpool\b/i, /\bswimming\s+pool\b/i],
    negations: [/\bcommunity\s+pool\s+only\b/i, /\bno\s+pool\b/i],
  },
  {
    key: "private_hot_tub",
    patterns: [/\bhot\s*tub\b/i, /\bjacuzzi\b/i, /\bprivate\s+spa\b/i],
    negations: [/\bno\s+hot\s*tub\b/i],
  },
  {
    key: "mountain_view",
    patterns: [/\bmountain\s+views?\b/i, /\bmountain\s+vistas?\b/i],
  },
  {
    key: "fire_pit",
    patterns: [/\bfire\s*pit\b/i, /\bfirepit\b/i],
  },
  {
    key: "outdoor_space",
    patterns: [
      /\boutdoor\s+(space|living|dining|area)\b/i,
      /\b(private\s+)?deck\b/i,
      /\b(private\s+)?patio\b/i,
      /\bgrill\b/i,
      /\bbbq\b/i,
      /\bbarbecue\b/i,
      /\bfire\s*pit\b/i,
      /\blanai\b/i,
      /\bterrace\b/i,
    ],
  },
  {
    key: "workspace_wifi",
    patterns: [
      /\bwi[- ]?fi\b/i,
      /\bwifi\b/i,
      /\bworkspace\b/i,
      /\bwork\s+from\s+home\b/i,
      /\bdedicated\s+workspace\b/i,
      /\bhigh[- ]?speed\s+internet\b/i,
      /\bfast\s+wi[- ]?fi\b/i,
      /\bdesk\b/i,
    ],
  },
  {
    key: "parking",
    patterns: [
      /\bparking\b/i,
      /\bgarage\b/i,
      /\bev\s*(charger|charging|station)\b/i,
      /\belectric\s+vehicle\s+charg/i,
      /\bcar\s+port\b/i,
      /\bdriveway\b/i,
    ],
  },
];

function parseJsonArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x || "")).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x || "")).filter(Boolean);
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function normalizeFilteredAmenities(value: unknown): FilteredAmenityKey[] {
  const list = parseJsonArray(value);
  const out: FilteredAmenityKey[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const key = String(item || "").trim();
    if (!KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as FilteredAmenityKey);
  }
  return out;
}

function corpusFromRow(row: Record<string, any>, baseAmenities: string[] = []) {
  return [
    row.name || "",
    row.excerpt || "",
    row.text || "",
    row.unique_feature || "",
    row.headline || "",
    row.best_fit_guest || "",
    row.design_style_notes || "",
    typeof row.propdescription === "string"
      ? row.propdescription
      : row.propdescription
        ? JSON.stringify(row.propdescription)
        : "",
    ...parseJsonArray(row.categories),
    ...parseJsonArray(row.prop_categories),
    ...baseAmenities,
  ]
    .filter(Boolean)
    .join("\n");
}

export function inferFilteredAmenities(
  row: Record<string, any>,
  baseAmenities: string[] = []
): FilteredAmenityKey[] {
  const keys = new Set<FilteredAmenityKey>();
  const corpus = corpusFromRow(row, baseAmenities);
  const petFlag = row.pet_friendly;
  if (petFlag === true || petFlag === "true" || petFlag === "True" || petFlag === 1 || petFlag === "1") {
    keys.add("pet_friendly");
  }
  for (const rule of HEURISTIC_PATTERNS) {
    if (rule.negations?.some((re) => re.test(corpus))) continue;
    if (rule.patterns.some((re) => re.test(corpus))) keys.add(rule.key);
  }
  const amenityBlob = baseAmenities.map((a) => a.toLowerCase()).join(" | ");
  if (
    keys.has("private_pool") &&
    /\bcommunity\s+pool\b/.test(amenityBlob) &&
    !/\bprivate\s+pool\b/.test(amenityBlob) &&
    !/\bprivate\s+pool\b/i.test(corpus)
  ) {
    keys.delete("private_pool");
  }
  return FILTERED_AMENITY_KEYS.filter((k) => keys.has(k));
}

async function ensureFilteredAmenitiesColumn(pool: ReturnType<typeof getNeonPool>) {
  await pool.query(`
    ALTER TABLE supabase.propertiesbase44
      ADD COLUMN IF NOT EXISTS filtered_amenities jsonb,
      ADD COLUMN IF NOT EXISTS pet_policy_url text
  `);
}

async function callAmenityLlm(prompt: string): Promise<FilteredAmenityKey[]> {
  const key = String(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || "").trim();
  const base = String(
    process.env.OPENAI_BASE_URL || process.env.AI_GATEWAY_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  if (!key) return [];

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract vacation rental filter amenities. Only include an amenity when the listing clearly has it. Never invent. Reply with JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content || "").trim();
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.amenities) ? parsed.amenities : Array.isArray(parsed) ? parsed : [];
    return normalizeFilteredAmenities(list);
  } catch {
    return [];
  }
}

function buildAiPrompt(row: Record<string, any>, baseAmenities: string[], heuristic: string[]) {
  return `From this vacation rental listing, which of these filter amenities does it CLEARLY have?

Allowed keys only:
- pet_friendly
- private_pool
- private_hot_tub
- mountain_view
- fire_pit
- outdoor_space (deck, grill, fire pit, patio, outdoor dining)
- workspace_wifi
- parking (incl. EV charging if mentioned)

Rules:
- Only include keys you can support from the text/amenities below.
- Do not guess. Community pool alone is NOT private_pool unless private is stated.
- Prefer omitting over inventing.

Already detected (may keep if still valid): ${heuristic.join(", ") || "(none)"}
Existing amenity tags: ${baseAmenities.join(", ") || "(none)"}
pet_friendly flag: ${row.pet_friendly ?? "(none)"}

Name: ${row.name || ""}
Excerpt: ${(row.excerpt || "").slice(0, 600)}
Unique feature: ${(row.unique_feature || "").slice(0, 400)}
Text: ${(row.text || "").slice(0, 2500)}

Return JSON: {"amenities":["key",...]}`;
}

async function loadBaseAmenitiesMap(pool: ReturnType<typeof getNeonPool>) {
  const { rows } = await pool.query(`
    SELECT id, data->>'amenities' AS amenities, data->>'supabase_property_id' AS sb_id,
           data->>'listing_url' AS listing_url, data->>'vrm_url' AS vrm_url,
           data->>'pet_policy_url' AS pet_policy_url
    FROM base44.property
  `);
  const bySbId = new Map<string, { amenities: string[]; pet_policy_url: string | null; baseId: string }>();
  const byUrl = new Map<string, { amenities: string[]; pet_policy_url: string | null; baseId: string }>();
  const norm = (u: string) => u.replace(/\/+$/, "").split("?")[0].split("#")[0];
  for (const row of rows) {
    const amenities = parseJsonArray(row.amenities);
    const entry = {
      amenities,
      pet_policy_url: row.pet_policy_url || null,
      baseId: String(row.id),
    };
    if (row.sb_id) bySbId.set(String(row.sb_id), entry);
    if (row.listing_url) byUrl.set(norm(String(row.listing_url)), entry);
    if (row.vrm_url) byUrl.set(norm(String(row.vrm_url)), entry);
  }
  return { bySbId, byUrl, norm };
}

async function persistFiltered(
  pool: ReturnType<typeof getNeonPool>,
  row: Record<string, any>,
  amenities: FilteredAmenityKey[],
  petPolicyUrl: string | null,
  baseId: string | null,
  { mirrorRemote = true }: { mirrorRemote?: boolean } = {}
) {
  const payload = JSON.stringify(amenities);
  const { rows } = await pool.query(
    `UPDATE supabase.propertiesbase44
     SET filtered_amenities = $2::jsonb,
         pet_policy_url = COALESCE($3, pet_policy_url),
         pet_friendly = CASE
           WHEN $4::boolean THEN 'true'
           ELSE pet_friendly
         END,
         imported_at = now()
     WHERE id = $1 OR row_id::text = $1
     RETURNING *`,
    [String(row.id), payload, petPolicyUrl, amenities.includes("pet_friendly")]
  );

  if (baseId) {
    await pool.query(
      `UPDATE base44.property
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
           updated_date = now()
       WHERE id = $1`,
      [
        baseId,
        JSON.stringify({
          filtered_amenities: amenities,
          ...(petPolicyUrl ? { pet_policy_url: petPolicyUrl } : {}),
          ...(amenities.includes("pet_friendly") ? { pet_friendly: true } : {}),
          updated_date: new Date().toISOString(),
        }),
      ]
    );
  }

  if (mirrorRemote && rows[0] && hasRemoteSupabase()) {
    try {
      await mirrorPropertiesbase44ToRemote({
        ...rows[0],
        filtered_amenities: amenities,
        pet_policy_url: petPolicyUrl || rows[0].pet_policy_url,
      });
    } catch (e: any) {
      console.warn("[filteredAmenities] remote mirror failed:", e?.message || e);
    }
  }

  return rows[0] || null;
}

/**
 * Backfill filtered_amenities for active properties (heuristic + optional AI).
 * body: { use_ai?: boolean, limit?: number, offset?: number, dry_run?: boolean, ids?: string[] }
 */
export async function handleBackfillFilteredAmenities(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const useAi = body?.use_ai !== false;
  const dryRun = !!body?.dry_run;
  const limit = Math.min(Math.max(Number(body?.limit) || 200, 1), 1000);
  const offset = Math.max(Number(body?.offset) || 0, 0);
  const onlyIds = Array.isArray(body?.ids) ? body.ids.map(String) : null;

  const pool = getNeonPool();
  await ensureFilteredAmenitiesColumn(pool);

  const { bySbId, byUrl, norm } = await loadBaseAmenitiesMap(pool);

  let rows: any[];
  if (onlyIds?.length) {
    const { rows: r } = await pool.query(
      `SELECT * FROM supabase.propertiesbase44
       WHERE id = ANY($1::text[]) OR row_id::text = ANY($1::text[])`,
      [onlyIds]
    );
    rows = r;
  } else {
    const { rows: r } = await pool.query(
      `SELECT * FROM supabase.propertiesbase44
       WHERE status = 'active' OR active = true
       ORDER BY created_at DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    rows = r;
  }

  const results: any[] = [];
  let updated = 0;
  let aiUsed = 0;

  for (const row of rows) {
    const base =
      bySbId.get(String(row.id)) ||
      (row.url ? byUrl.get(norm(String(row.url))) : null) ||
      (row.vrm_url ? byUrl.get(norm(String(row.vrm_url))) : null) ||
      null;
    const baseAmenities = base?.amenities || [];
    let amenities = inferFilteredAmenities(row, baseAmenities);
    let usedAi = false;

    const hasCopy = String(row.text || row.excerpt || "").trim().length > 80;
    if (useAi && hasCopy) {
      const aiKeys = await callAmenityLlm(buildAiPrompt(row, baseAmenities, amenities));
      if (aiKeys.length) {
        const merged = new Set([...amenities, ...aiKeys]);
        amenities = FILTERED_AMENITY_KEYS.filter((k) => merged.has(k));
        usedAi = true;
        aiUsed += 1;
      }
    }

    // Keep any previously curated keys (manual edits) unless body.overwrite
    if (!body?.overwrite) {
      const existing = normalizeFilteredAmenities(row.filtered_amenities);
      if (existing.length) {
        const merged = new Set([...existing, ...amenities]);
        amenities = FILTERED_AMENITY_KEYS.filter((k) => merged.has(k));
      }
    }

    const petPolicyUrl = base?.pet_policy_url || row.pet_policy_url || null;

    if (!dryRun) {
      await persistFiltered(pool, row, amenities, petPolicyUrl, base?.baseId || null, {
        mirrorRemote: body?.mirror_remote !== false,
      });
      updated += 1;
    }

    results.push({
      id: row.id,
      name: row.name,
      amenities,
      used_ai: usedAi,
      base_amenities: baseAmenities.length,
    });
  }

  return json(res, 200, {
    ok: true,
    dry_run: dryRun,
    scanned: rows.length,
    updated,
    ai_used: aiUsed,
    offset,
    limit,
    results: results.slice(0, 50),
    next_offset: onlyIds ? null : offset + rows.length,
  });
}

export async function ensureFilteredAmenitiesSchema() {
  const pool = getNeonPool();
  await ensureFilteredAmenitiesColumn(pool);
}
