import { json } from "./neon-db.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_PHOTOS = 180;
const FETCH_MS = 18000;

const BAD_SUBSTRINGS = [
  "logo",
  "favicon",
  "sprite",
  "icon-",
  "placeholder",
  "avatar",
  "headshot",
  ".svg",
  "marker-icon",
  "leaflet",
  "map-placeholder",
  "search-history-icon",
];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function nameFromUrlSlug(listingUrl: string) {
  try {
    const slug = new URL(listingUrl).pathname.split("/").filter(Boolean).pop() || "";
    if (!slug || slug.length < 3) return "";
    return slug
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b([a-z]?[a-z]{0,3})(\d+)\b/gi, (_, letters, digits) => `${letters.toUpperCase()}${digits}`)
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .trim();
  } catch {
    return "";
  }
}

function isBlockedHtml(html: string, status?: number) {
  if (status && status >= 400) return true;
  const sample = String(html || "").slice(0, 4000).toLowerCase();
  return (
    /<title[^>]*>\s*403\s*forbidden/i.test(html) ||
    /<title[^>]*>\s*access denied/i.test(html) ||
    /<title[^>]*>\s*attention required/i.test(html) ||
    sample.includes("just a moment") ||
    sample.includes("cf-browser-verification") ||
    sample.includes("connection was blocked by the security system") ||
    sample.includes("your connection was blocked") ||
    sample.includes("sorry, you have been blocked") ||
    sample.includes("enable javascript and cookies to continue")
  );
}

function isBadPropertyName(name: string) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return true;
  return (
    n === "403 forbidden" ||
    n === "404 not found" ||
    n === "access denied" ||
    n === "attention required" ||
    n.includes("just a moment") ||
    n.startsWith("403 ") ||
    n.startsWith("404 ")
  );
}

function resolveUrl(raw: string, baseUrl: string) {
  let u = String(raw || "")
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/\\\//g, "/");
  if (!u || u.startsWith("data:") || u.startsWith("blob:")) return "";
  if (u.startsWith("//")) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) {
    try {
      u = new URL(u, baseUrl).href;
    } catch {
      return "";
    }
  }
  return /^https?:\/\//i.test(u) ? u : "";
}

function looksLikePhoto(url: string) {
  const lower = url.toLowerCase();
  if (BAD_SUBSTRINGS.some((s) => lower.includes(s))) return false;
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower)) return false;
  // Prefer real image URLs; also keep known VRS / CDN hosts without extensions.
  if (/\.(jpe?g|png|webp|avif)(\?|$|&|#)/i.test(lower)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.includes("streamlinevrs") ||
      host.includes("cloudfront.net") ||
      host.includes("rezfusion") ||
      host.includes("trackhs.com") ||
      host.includes("imgix") ||
      host.includes("guesty.com")
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function preferFullSize(url: string) {
  let next = url.replace(/\/thumbnail_/gi, "/image_").replace(/[-_]thumb(nail)?(?=\.|$)/gi, "");
  // Guesty: keep a large f_auto transform so browsers get image/jpeg
  // (raw paths often return application/octet-stream and won't render in <img>).
  if (/assets\.guesty\.com/i.test(next)) {
    next = next.split("?")[0];
    if (/\/image\/upload\/w_[^/]+\//i.test(next)) {
      next = next.replace(
        /\/image\/upload\/w_[^/]+\//i,
        "/image/upload/w_1600,c_limit,q_auto,f_auto/"
      );
    } else if (/\/image\/upload\//i.test(next) && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(next)) {
      next = next.replace(
        /\/image\/upload\//i,
        "/image/upload/w_1600,c_limit,q_auto,f_auto/"
      );
    }
    return next;
  }
  return next;
}

function photoDedupeKey(url: string) {
  let key = String(url || "").split("?")[0].toLowerCase();
  if (/assets\.guesty\.com/i.test(key)) {
    key = key.replace(/\/image\/upload\/(?:w_[^/]+\/)?/i, "/image/upload/");
  }
  return key.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
}

/** Decode entities, strip tags, and fix glued sentences from Streamline HTML. */
function decodeEntities(value: string) {
  let text = String(value || "");
  if (!text.trim()) return "";

  text = text
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&ensp;/gi, " ")
    .replace(/&emsp;/gi, " ")
    .replace(/&thinsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&#39;|&apos;|&lsquo;|&rsquo;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, " ");

  // "table.Bed Sizes" / "Room!Bed Sizes" / "BedsIt's time"
  text = text
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2");

  return text.replace(/\s+/g, " ").trim();
}

function metaContent(html: string, property: string) {
  const re1 = new RegExp(
    `property=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `content=["']([^"']+)["'][^>]*property=["']${property}["']`,
    "i"
  );
  const re3 = new RegExp(`name=["']${property}["'][^>]*content=["']([^"']+)["']`, "i");
  return decodeEntities(html.match(re1)?.[1] || html.match(re2)?.[1] || html.match(re3)?.[1] || "");
}

function extractJsonLd(html: string) {
  const items: any[] = [];
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) items.push(...parsed);
      else if (parsed) items.push(parsed);
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return items;
}

function extractTitle(html: string, jsonLd: any[]) {
  for (const item of jsonLd) {
    const name = item?.name || item?.headline;
    if (typeof name === "string" && name.trim()) return decodeEntities(name);
  }
  const og = metaContent(html, "og:title");
  if (og) return og;
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return title ? decodeEntities(title) : "";
}

function cleanPropertyName(title: string, host: string) {
  let name = decodeEntities(title || "");
  // Drop common site suffixes: "SNH263 Gone Coastal - Coastal Carolina Vacations"
  // "Gold Cove: 9-Bedroom Lake Anna Rental - Lakefront Luxury"
  name = name
    .replace(/\s*[\-|–|—]\s*Coastal Carolina Vacations\s*$/i, "")
    .replace(/\s*[\-|–|—]\s*Lakefront Luxury\s*$/i, "")
    .replace(/\s*[\-|–|—]\s*.+\s+Vacations?\s*$/i, "")
    .replace(/\s*\|\s*.+$/i, "")
    .replace(/:\s*\d+-Bedroom\b.+$/i, "")
    .trim();
  return name || host || "Untitled Property";
}

/** Homerunner / YOOtheme section bodies: Notes, Space, Access, Transit, Interaction. */
function extractLabeledSection(html: string, label: string) {
  const re = new RegExp(
    `>${label}<\\/span>\\s*<\\/div>\\s*<div[^>]*class="[^"]*el-content[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`,
    "i"
  );
  const m = html.match(re);
  if (!m?.[1]) return "";
  return decodeEntities(
    m[1]
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/\s*p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Trim house-rules / verification legalese from Notes while keeping the soft intro. */
function trimHouseRules(notes: string) {
  if (!notes) return "";
  let text = notes;
  const cut = text.search(
    /\*\*\s*Additional Information|\*\*\s*Guest Requirements|All guests shall abide|Damage protection is required|Guest Verification process/i
  );
  if (cut > 120) text = text.slice(0, cut).trim();
  return text;
}

/**
 * Build a multi-paragraph property description from Homerunner listing copy.
 * Prefer hero + Space + Notes (+ Access/Transit when useful) over thin OG blurbs.
 */
function extractRichDescription(html: string, jsonLd: any[], ogDesc: string) {
  const paragraphs: string[] = [];
  const push = (raw: string) => {
    const text = String(raw || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 40) return;
    // Skip thin marketing one-liners that duplicate OG when we already have body copy
    if (paragraphs.some((p) => p.slice(0, 80) === text.slice(0, 80))) return;
    paragraphs.push(text);
  };

  // Hero intro paragraph(s) above "Read More"
  const heroBlocks = [
    ...html.matchAll(
      /<div[^>]*class="[^"]*uk-panel[^"]*uk-margin[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/gi
    ),
  ];
  for (const m of heroBlocks.slice(0, 2)) {
    const text = decodeEntities(m[1].replace(/<[^>]+>/g, " "));
    if (text.length > 80 && !/book direct|see photos, amenities/i.test(text)) push(text);
  }

  const space = extractLabeledSection(html, "Space");
  if (space) {
    // Space often has two paragraphs separated by blank lines
    for (const part of space.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, " ").trim())) {
      if (part.length > 60) push(part);
    }
  }

  const notes = trimHouseRules(extractLabeledSection(html, "Notes"));
  if (notes) {
    for (const part of notes.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, " ").trim())) {
      if (part.length > 60) push(part);
    }
  }

  const interaction = extractLabeledSection(html, "Interaction");
  // Interaction appears twice on Homerunner (host note + neighborhood). Keep longer ones.
  if (interaction && interaction.length > 80) {
    for (const part of interaction.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, " ").trim())) {
      if (part.length > 80) push(part);
    }
  }

  const access = extractLabeledSection(html, "Access");
  if (access && access.length > 80) push(access);

  const transit = extractLabeledSection(html, "Transit");
  if (transit && transit.length > 60) push(transit);

  // JSON-LD description as fallback intro when hero missing
  const ldDesc = decodeEntities(
    String(jsonLd.find((i) => typeof i?.description === "string")?.description || "")
  ).trim();
  if (paragraphs.length === 0 && ldDesc.length > 40) push(ldDesc);
  if (paragraphs.length === 0 && ogDesc) push(ogDesc);

  // Merge short amenity bullet lines into readable chunks, then shape to 3 paragraphs
  const coalesced: string[] = [];
  let bulletBuf: string[] = [];
  const flushBullets = () => {
    if (!bulletBuf.length) return;
    coalesced.push(bulletBuf.join(" "));
    bulletBuf = [];
  };
  for (const p of paragraphs) {
    const isBullet = /^[–•\-]\s/.test(p) || (p.length < 140 && /^(Primary Suite|Bedroom|Lounge|Garage)/i.test(p));
    if (isBullet) {
      bulletBuf.push(p.replace(/^[–•\-]\s*/, "").trim());
      if (bulletBuf.length >= 4) flushBullets();
    } else {
      flushBullets();
      coalesced.push(p);
    }
  }
  flushBullets();

  if (coalesced.length === 0 && space) {
    coalesced.push(space.replace(/\s+/g, " ").trim());
  }
  if (coalesced.length === 0 && notes) {
    coalesced.push(notes.replace(/\s+/g, " ").trim());
  }

  return toThreeParagraphs(coalesced) || undefined;
}

/** Collapse listing copy into exactly three body paragraphs for property text. */
function toThreeParagraphs(parts: string[]) {
  const clean = parts
    .map((p) => String(p || "").replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40);
  if (!clean.length) return undefined;

  const join = (items: string[]) => items.join(" ").replace(/\s+/g, " ").trim();
  let three: string[];

  if (clean.length === 1) {
    // Split a single long blurb on sentence boundaries into up to 3 paragraphs
    const sentences = clean[0].match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [clean[0]];
    if (sentences.length <= 3) {
      three = sentences;
    } else {
      const size = Math.ceil(sentences.length / 3);
      three = [
        join(sentences.slice(0, size)),
        join(sentences.slice(size, size * 2)),
        join(sentences.slice(size * 2)),
      ].filter(Boolean);
    }
  } else if (clean.length === 2) {
    // Split the longer chunk so we still land on three paragraphs when possible
    const longerIdx = clean[0].length >= clean[1].length ? 0 : 1;
    const longer = clean[longerIdx];
    const shorter = clean[1 - longerIdx];
    const sentences = longer.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [longer];
    if (sentences.length >= 2) {
      const mid = Math.ceil(sentences.length / 2);
      three =
        longerIdx === 0
          ? [join(sentences.slice(0, mid)), join(sentences.slice(mid)), shorter]
          : [shorter, join(sentences.slice(0, mid)), join(sentences.slice(mid))];
    } else {
      three = [clean[0], clean[1]];
    }
  } else if (clean.length === 3) {
    three = clean;
  } else {
    // Intro + mid (space/home) + closing (notes/access/neighborhood)
    const intro = clean[0];
    const midEnd = Math.max(1, Math.ceil((clean.length - 1) / 2));
    const mid = join(clean.slice(1, midEnd + 1));
    const close = join(clean.slice(midEnd + 1));
    three = [intro, mid, close].filter((p) => p.length >= 40);
    if (three.length < 3) {
      const all = join(clean);
      const sentences = all.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [all];
      const size = Math.ceil(sentences.length / 3);
      three = [
        join(sentences.slice(0, size)),
        join(sentences.slice(size, size * 2)),
        join(sentences.slice(size * 2)),
      ].filter(Boolean);
    }
  }

  return three
    .slice(0, 3)
    .map((p) => p.slice(0, 2500).trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000)
    .trim() || undefined;
}

function extractListingDetails(html: string, jsonLd: any[]) {
  const textFromLd = jsonLd
    .map((item) => [item?.description, item?.name].filter(Boolean).join(" "))
    .join(" ");
  const ogDesc = metaContent(html, "og:description") || metaContent(html, "description");
  const plain = decodeEntities(
    `${textFromLd} ${ogDesc} ${html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")}`
  );

  const toNum = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const bedrooms =
    toNum(plain.match(/(\d+)\s*[-]?\s*bed(?:room)?s?\b/i)?.[1]) ||
    toNum(plain.match(/\bbed(?:room)?s?\s*[:#]?\s*(\d+)/i)?.[1]);

  // Prefer "5-full and 2-half bath" style (common on Streamline / OBX sites).
  const fullHalf = plain.match(
    /(\d+)\s*[-]?\s*full(?:\s+bath(?:room)?s?)?(?:\s+and)?\s+(\d+)\s*[-]?\s*half\s*bath/i
  );
  const fullOnly = plain.match(/(\d+)\s*[-]?\s*full\s*bath/i);
  const halfOnly = plain.match(/(\d+)\s*[-]?\s*half\s*bath/i);
  const bathsSimple =
    toNum(plain.match(/(\d+(?:\.\d+)?)\s*[-]?\s*bath(?:room)?s?\b/i)?.[1]) ||
    toNum(plain.match(/\bbath(?:room)?s?\s*[:#]?\s*(\d+(?:\.\d+)?)/i)?.[1]);
  let bathrooms: number | undefined;
  if (fullHalf) {
    bathrooms = Number(fullHalf[1]) + Number(fullHalf[2]) * 0.5;
  } else if (fullOnly || halfOnly) {
    bathrooms = (toNum(fullOnly?.[1]) || 0) + (toNum(halfOnly?.[1]) || 0) * 0.5;
  } else if (bathsSimple !== undefined) {
    bathrooms = bathsSimple;
  }

  const sleeps =
    toNum(plain.match(/\b(?:sleeps|occupancy|guests?)\s*[:\-]?\s*(\d+)/i)?.[1]) ||
    toNum(plain.match(/(\d+)\s*(?:guests?|people)\b/i)?.[1]);

  const locatedIn = decodeEntities(plain.match(/\bLocated in ([^!.?,]{3,40})/i)?.[1] || "");
  const placeName = decodeEntities(
    plain.match(/\bin ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+(?:Head|Beach|Island|Shores|City))\b/)?.[1] ||
      ""
  );
  const location = (locatedIn || placeName || "").replace(/\s+/g, " ").trim() || undefined;

  const description = extractRichDescription(html, jsonLd, ogDesc || "");
  // Short summary: prefer first paragraph of rich copy, else OG (not the thin OG when we have body)
  const firstPara = description?.split(/\n\n+/)[0]?.trim() || "";
  const short_summary = (
    firstPara.length >= 80 ? firstPara.slice(0, 400) : ogDesc ? ogDesc.slice(0, 400) : firstPara
  ) || undefined;

  return {
    bedrooms: Number.isFinite(bedrooms) ? bedrooms : undefined,
    bathrooms: Number.isFinite(bathrooms as number) ? bathrooms : undefined,
    sleeps: Number.isFinite(sleeps) ? sleeps : undefined,
    location_full: location,
    short_summary,
    description,
  };
}

function extractPhotos(html: string, pageUrl: string, jsonLd: any[] = []) {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    if (found.length >= MAX_PHOTOS) return false;
    const resolved = resolveUrl(raw, pageUrl);
    if (!resolved || !looksLikePhoto(resolved)) return true;
    const preferred = preferFullSize(resolved);
    const key = photoDedupeKey(preferred);
    if (seen.has(key)) return true;
    seen.add(key);
    found.push(preferred);
    return found.length < MAX_PHOTOS;
  };

  // JSON-LD images first (often full-size Guesty URLs without transforms)
  for (const item of jsonLd) {
    const images = item?.image;
    if (!images) continue;
    const list = Array.isArray(images) ? images : [images];
    for (const img of list) {
      if (typeof img === "string") {
        if (!add(img)) return found;
      } else if (img?.url) {
        if (!add(img.url)) return found;
      } else if (img?.contentUrl) {
        if (!add(img.contentUrl)) return found;
      }
    }
  }

  // Guesty first — Homerunner embeds the full gallery as absolute CDN URLs.
  // Use an anchored host regex (no leading wildcard) so huge pages stay fast.
  for (const m of html.matchAll(/https?:\/\/assets\.guesty\.com\/image\/upload\/[^\s"'\\<>]+/gi)) {
    if (!add(m[0])) return found;
  }
  for (const m of html.matchAll(/https?:\/\/img\.trackhs\.com\/[^\s"'\\<>]+/gi)) {
    if (!add(m[0])) return found;
  }

  for (const m of html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)) {
    if (!add(m[1])) return found;
  }
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi)) {
    if (!add(m[1])) return found;
  }
  for (const m of html.matchAll(/\bsrc=["']([^"']+)["']/gi)) {
    if (!add(m[1])) return found;
  }
  for (const m of html.matchAll(/\bdata-src=["']([^"']+)["']/gi)) {
    if (!add(m[1])) return found;
  }
  for (const m of html.matchAll(/\bdata-lazy-src=["']([^"']+)["']/gi)) {
    if (!add(m[1])) return found;
  }
  for (const m of html.matchAll(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi)) {
    if (!add(m[2])) return found;
  }
  for (const m of html.matchAll(/https?:\/\/[^\s"'\\<>]+\.(?:jpe?g|png|webp)/gi)) {
    if (!add(m[0])) return found;
  }

  return found;
}

async function fetchViaProxy(url: string) {
  // Datacenter IPs (Vercel) are often blocked by Streamline/Cloudflare WAF.
  // allorigins / jina reader fetch from a different egress and return raw HTML.
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`,
  ];
  let lastError: Error | null = null;
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_MS + 5000),
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) {
        lastError = new Error(`Proxy fetch returned ${res.status}`);
        continue;
      }
      const html = await res.text();
      if (!html || html.length < 200 || isBlockedHtml(html, res.status)) {
        lastError = new Error("Proxy fetch returned a blocked or empty page");
        continue;
      }
      return { html, finalUrl: url, via: "proxy" as const };
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error?.message || error));
    }
  }
  throw lastError || new Error("Proxy fetch failed");
}

/** Alternate listing URLs that often load faster / bypass WAF on Homerunner sites. */
function listingFetchCandidates(url: string, preferAmpFirst = false) {
  const out: string[] = [];
  try {
    const u = new URL(url);
    if (!u.searchParams.has("amp")) {
      const amp = new URL(u.href);
      amp.searchParams.set("amp", "1");
      if (preferAmpFirst) out.push(amp.href);
      out.push(u.href);
      if (!preferAmpFirst) out.push(amp.href);
    } else {
      out.push(u.href);
    }
  } catch {
    out.push(url);
  }
  return [...new Set(out)];
}

async function fetchHtml(url: string, opts: { fast?: boolean } = {}) {
  const userAgents = opts.fast
    ? [BROWSER_UA]
    : [
        BROWSER_UA,
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ];
  // Homerunner mega-pages often stall on the canonical URL but succeed with ?amp=1.
  const timeoutMs = opts.fast ? 10000 : FETCH_MS;
  const candidates = listingFetchCandidates(url, Boolean(opts.fast));
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    for (const ua of userAgents) {
      try {
        const res = await fetch(candidate, {
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "User-Agent": ua,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        const html = await res.text();
        if (!res.ok || isBlockedHtml(html, res.status)) {
          lastError = new Error(`Listing page blocked or returned ${res.status}`);
          continue;
        }
        if (html && html.length > 200) {
          return { html, finalUrl: res.url || candidate, via: "direct" as const };
        }
        lastError = new Error("Listing page returned empty HTML");
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error?.message || error));
      }
    }
  }

  try {
    return await fetchViaProxy(url);
  } catch (error: any) {
    lastError = error instanceof Error ? error : new Error(String(error?.message || error));
  }

  throw lastError || new Error("Failed to fetch listing page");
}

/** Fast photo discovery via WordPress REST (Homerunner) when HTML fetch is blocked. */
async function fetchWordpressPropertyPhotos(listingUrl: string) {
  try {
    const u = new URL(listingUrl);
    const slug = u.pathname.split("/").filter(Boolean).pop() || "";
    if (!slug) return [] as string[];
    const endpoints = [
      `${u.origin}/wp-json/wp/v2/properties?slug=${encodeURIComponent(slug)}&_fields=id,slug,acf&per_page=1`,
      `${u.origin}/wp-json/wp/v2/properties?search=${encodeURIComponent(slug.replace(/-/g, " "))}&_fields=id,slug,acf&per_page=5`,
    ];
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          signal: AbortSignal.timeout(15000),
          headers: {
            Accept: "application/json",
            "User-Agent": BROWSER_UA,
          },
        });
        if (!res.ok) continue;
        const rows = await res.json();
        const list = Array.isArray(rows) ? rows : [];
        const item =
          list.find((r: any) => String(r?.slug || "").toLowerCase() === slug.toLowerCase()) || list[0];
        const photos = item?.acf?.photos;
        if (!Array.isArray(photos) || !photos.length) continue;
        const urls: string[] = [];
        for (const photo of photos) {
          const sizes = photo?.sizes && typeof photo.sizes === "object" ? Object.values(photo.sizes) : [];
          const candidates = [...sizes, photo?.url].filter(Boolean).map(String);
          for (const raw of candidates) {
            const plain = raw.match(/\/plain\/(https?:\/\/.+)$/i)?.[1] || raw;
            const guesty = plain.match(/https?:\/\/assets\.guesty\.com\/image\/upload\/[^\s"'\\]+/i)?.[0];
            const picked = (guesty || (/^https?:\/\//i.test(plain) ? plain : "")).replace(
              /-homerunner(?=\.(jpe?g|png|webp)$)/i,
              ""
            );
            if (picked) {
              urls.push(preferFullSize(picked));
              break;
            }
          }
        }
        if (urls.length) return urls;
      } catch {
        /* try next endpoint */
      }
    }
  } catch {
    /* ignore */
  }
  return [] as string[];
}

/** Fast HTML-only photo/title extract — no LLM, no image fingerprinting. */
export async function handleScrapePropertyLight(req: any, res: any, body: any) {
  const url = String(body?.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return json(res, 400, { error: "A valid listing URL is required" });
  }
  const photosOnly = Boolean(body?.photos_only || body?.mode === "photos");

  try {
    let html = "";
    let finalUrl = url;
    let via: "direct" | "proxy" | "wp_rest" = "direct";
    let photo_urls: string[] = [];

    try {
      const fetched = await fetchHtml(url, { fast: photosOnly });
      html = fetched.html;
      finalUrl = fetched.finalUrl;
      via = fetched.via;
      const jsonLd = extractJsonLd(html);
      photo_urls = extractPhotos(html, finalUrl, jsonLd);
    } catch (fetchError: any) {
      console.warn("[scrapePropertyLight] html fetch failed", fetchError?.message || fetchError);
    }

    // Homerunner / Guesty: WordPress REST is small and reliable when the
    // full listing HTML times out behind WAF.
    if (photo_urls.length < 8) {
      const wpPhotos = await fetchWordpressPropertyPhotos(url);
      if (wpPhotos.length > photo_urls.length) {
        photo_urls = wpPhotos;
        via = "wp_rest";
      }
    }

    const host = hostOf(finalUrl) || hostOf(url);
    const slugName = nameFromUrlSlug(url);
    const jsonLd = html ? extractJsonLd(html) : [];
    const title = html ? extractTitle(html, jsonLd) : "";
    const cleaned = cleanPropertyName(title, host);
    const property_name = !isBadPropertyName(cleaned)
      ? cleaned
      : slugName || host || "Untitled Property";

    if (!photo_urls.length && isBadPropertyName(cleaned) && !slugName) {
      return json(res, 200, {
        success: false,
        error: "Listing site blocked the scrape (no usable title or photos).",
      });
    }

    // Photo discovery skips full-page text extraction (very expensive on 1–2MB
    // Homerunner / Guesty listing pages).
    const details =
      photosOnly || !html
        ? {
            location_full: undefined,
            bedrooms: undefined,
            bathrooms: undefined,
            sleeps: undefined,
            short_summary: undefined,
            description: undefined,
          }
        : extractListingDetails(html, jsonLd);

    return json(res, 200, {
      success: true,
      data: {
        property_name,
        photo_urls,
        location_full: details.location_full,
        bedrooms: details.bedrooms,
        bathrooms: details.bathrooms,
        sleeps: details.sleeps,
        property_type: undefined,
        short_summary: details.short_summary,
        description: details.description,
        unique_features: undefined,
        why_100_collection: undefined,
        source:
          via === "proxy" ? "light_html_proxy" : via === "wp_rest" ? "wordpress_rest" : "light_html",
        photo_count: photo_urls.length,
      },
    });
  } catch (error: any) {
    console.warn("[scrapePropertyLight]", error?.message || error);
    return json(res, 200, {
      success: false,
      error: error?.message || "Light scrape failed",
    });
  }
}
