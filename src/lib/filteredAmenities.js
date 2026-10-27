/**
 * Curated amenity filters for public discovery + admin Property Detail.
 * Keys are stable for the frontend; labels are display copy.
 */
export const FILTERED_AMENITIES = [
  {
    key: "pet_friendly",
    label: "Pet-friendly",
    description: "Link to the partner’s pet policy when available (fees vary).",
    needsPolicyUrl: true,
  },
  { key: "private_pool", label: "Private pool" },
  { key: "private_hot_tub", label: "Private hot tub" },
  { key: "mountain_view", label: "Mountain view" },
  { key: "fire_pit", label: "Fire pit" },
  {
    key: "outdoor_space",
    label: "Outdoor space",
    description: "Deck, grill, fire pit, or similar outdoor living.",
  },
  {
    key: "workspace_wifi",
    label: "Workspace and reliable Wi-Fi",
  },
  {
    key: "parking",
    label: "Parking",
    description: "Includes EV charging when the partner supplies it.",
  },
];

export const FILTERED_AMENITY_KEYS = FILTERED_AMENITIES.map((a) => a.key);

export const FILTERED_AMENITY_LABELS = Object.fromEntries(
  FILTERED_AMENITIES.map((a) => [a.key, a.label])
);

const KEY_SET = new Set(FILTERED_AMENITY_KEYS);

/** Patterns that map free-form amenity / copy text → filter keys. */
const HEURISTIC_PATTERNS = [
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
    patterns: [
      /\bprivate\s+pool\b/i,
      /\bpool\b/i,
      /\bswimming\s+pool\b/i,
    ],
    // Prefer private; still allow generic "pool" unless clearly shared/community-only.
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

export function normalizeFilteredAmenities(value) {
  if (!value) return [];
  let list = value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      list = parsed;
    } catch {
      list = value.split(",").map((s) => s.trim());
    }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const key =
      typeof item === "string"
        ? item.trim()
        : item && typeof item === "object"
          ? String(item.key || item.id || "").trim()
          : "";
    if (!KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function corpusFromProperty(property = {}) {
  const amenityBits = [];
  const pushList = (raw) => {
    if (!raw) return;
    if (Array.isArray(raw)) {
      for (const a of raw) amenityBits.push(String(a || ""));
      return;
    }
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const a of parsed) amenityBits.push(String(a || ""));
          return;
        }
      } catch {
        /* plain string */
      }
      amenityBits.push(raw);
    }
  };
  pushList(property.amenities);
  pushList(property.categories);
  pushList(property.prop_categories);
  pushList(property.filtered_amenities);

  return [
    property.property_name || property.name || "",
    property.excerpt || "",
    property.text || property.description || "",
    property.unique_feature || property.unique_features || "",
    property.headline || "",
    property.best_fit_guest || "",
    property.design_style_notes || "",
    typeof property.propdescription === "string"
      ? property.propdescription
      : property.propdescription
        ? JSON.stringify(property.propdescription)
        : "",
    typeof property.internal_notes === "string" ? property.internal_notes : "",
    amenityBits.join(" | "),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Infer filter keys from existing amenities / copy / pet_friendly flag.
 * Conservative: only adds when patterns match; respects simple negations.
 */
export function inferFilteredAmenities(property = {}) {
  const keys = new Set();
  const corpus = corpusFromProperty(property);

  const petFlag = property.pet_friendly;
  if (petFlag === true || petFlag === "true" || petFlag === "True" || petFlag === 1 || petFlag === "1") {
    keys.add("pet_friendly");
  }

  for (const rule of HEURISTIC_PATTERNS) {
    if (rule.negations?.some((re) => re.test(corpus))) continue;
    if (rule.patterns.some((re) => re.test(corpus))) keys.add(rule.key);
  }

  // Community-pool-only: drop private_pool if amenity list says community and not private.
  const amenityBlob = [
    ...(Array.isArray(property.amenities) ? property.amenities : []),
  ]
    .map((a) => String(a || "").toLowerCase())
    .join(" | ");
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

export function mergeFilteredAmenities(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const key of normalizeFilteredAmenities(list)) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
