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
  name = name
    .replace(/\s*[\-|–|—]\s*Coastal Carolina Vacations\s*$/i, "")
    .replace(/\s*[\-|–|—]\s*.+\s+Vacations?\s*$/i, "")
    .replace(/\s*\|\s*.+$/i, "")
    .trim();
  return name || host || "Untitled Property";
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

  const short_summary = ogDesc ? ogDesc.slice(0, 400) : undefined;
  const description = textFromLd
    ? decodeEntities(String(jsonLd.find((i) => i?.description)?.description || "")).slice(0, 6000) || undefined
    : short_summary;

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
    const resolved = resolveUrl(raw, pageUrl);
    if (!resolved || !looksLikePhoto(resolved)) return;
    const preferred = preferFullSize(resolved);
    const key = photoDedupeKey(preferred);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(preferred);
  };

  // JSON-LD images first (often full-size Guesty URLs without transforms)
  for (const item of jsonLd) {
    const images = item?.image;
    if (!images) continue;
    const list = Array.isArray(images) ? images : [images];
    for (const img of list) {
      if (typeof img === "string") add(img);
      else if (img?.url) add(img.url);
      else if (img?.contentUrl) add(img.contentUrl);
    }
  }

  for (const m of html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bsrc=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bdata-src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bdata-lazy-src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi)) add(m[2]);
  // Absolute CDN image URLs embedded in JS/JSON (with extension)
  for (const m of html.matchAll(/https?:\/\/[^\s"'\\<>]+\.(?:jpe?g|png|webp)/gi)) add(m[0]);
  // Guesty / TrackHS extensionless CDN URLs (Homerunner / Guesty WordPress sites)
  for (const m of html.matchAll(
    /https?:\/\/[^\s"'\\<>]*(?:assets\.guesty\.com|img\.trackhs\.com)[^\s"'\\<>]*/gi
  )) {
    add(m[0]);
  }

  return found.slice(0, MAX_PHOTOS);
}

async function fetchViaProxy(url: string) {
  // Datacenter IPs (Vercel) are often blocked by Streamline/Cloudflare WAF.
  // allorigins fetches from a different egress and returns the raw HTML.
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_MS + 5000),
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Proxy fetch returned ${res.status}`);
  const html = await res.text();
  if (!html || html.length < 200 || isBlockedHtml(html, res.status)) {
    throw new Error("Proxy fetch returned a blocked or empty page");
  }
  return { html, finalUrl: url, via: "proxy" as const };
}

async function fetchHtml(url: string) {
  const userAgents = [
    BROWSER_UA,
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ];
  let lastError: Error | null = null;
  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_MS),
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
        return { html, finalUrl: res.url || url, via: "direct" as const };
      }
      lastError = new Error("Listing page returned empty HTML");
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error?.message || error));
    }
  }

  try {
    return await fetchViaProxy(url);
  } catch (error: any) {
    lastError = error instanceof Error ? error : new Error(String(error?.message || error));
  }

  throw lastError || new Error("Failed to fetch listing page");
}

/** Fast HTML-only photo/title extract — no LLM, no image fingerprinting. */
export async function handleScrapePropertyLight(req: any, res: any, body: any) {
  const url = String(body?.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return json(res, 400, { error: "A valid listing URL is required" });
  }

  try {
    const { html, finalUrl, via } = await fetchHtml(url);
    const jsonLd = extractJsonLd(html);
    const photo_urls = extractPhotos(html, finalUrl, jsonLd);
    const host = hostOf(finalUrl) || hostOf(url);
    const slugName = nameFromUrlSlug(url);
    const title = extractTitle(html, jsonLd);
    const cleaned = cleanPropertyName(title, host);
    const property_name = !isBadPropertyName(cleaned)
      ? cleaned
      : slugName || host || "Untitled Property";
    const details = extractListingDetails(html, jsonLd);

    if (!photo_urls.length && isBadPropertyName(cleaned) && !slugName) {
      return json(res, 200, {
        success: false,
        error: "Listing site blocked the scrape (no usable title or photos).",
      });
    }

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
        source: via === "proxy" ? "light_html_proxy" : "light_html",
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
