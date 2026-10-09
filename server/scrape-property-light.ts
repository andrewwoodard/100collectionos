import { json } from "./neon-db.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_PHOTOS = 40;
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
];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
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
      host.includes("imgix")
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function preferFullSize(url: string) {
  return url.replace(/\/thumbnail_/gi, "/image_").replace(/[-_]thumb(nail)?(?=\.|$)/gi, "");
}

function decodeEntities(value: string) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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

function extractPhotos(html: string, pageUrl: string) {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const resolved = resolveUrl(raw, pageUrl);
    if (!resolved || !looksLikePhoto(resolved)) return;
    const preferred = preferFullSize(resolved);
    const key = preferred.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(preferred);
  };

  for (const m of html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bsrc=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bdata-src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bdata-lazy-src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi)) add(m[2]);
  // Absolute CDN image URLs embedded in JS/JSON
  for (const m of html.matchAll(/https?:\/\/[^\s"'\\<>]+\.(?:jpe?g|png|webp)/gi)) add(m[0]);

  return found.slice(0, MAX_PHOTOS);
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
      if (!res.ok) {
        lastError = new Error(`Listing page returned ${res.status}`);
        continue;
      }
      const html = await res.text();
      if (html && html.length > 200) {
        return { html, finalUrl: res.url || url };
      }
      lastError = new Error("Listing page returned empty HTML");
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error?.message || error));
    }
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
    const { html, finalUrl } = await fetchHtml(url);
    const jsonLd = extractJsonLd(html);
    const photo_urls = extractPhotos(html, finalUrl);
    const host = hostOf(finalUrl) || hostOf(url);
    const title = extractTitle(html, jsonLd);
    const details = extractListingDetails(html, jsonLd);

    return json(res, 200, {
      success: true,
      data: {
        property_name: cleanPropertyName(title, host),
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
        source: "light_html",
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
