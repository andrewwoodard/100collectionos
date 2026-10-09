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

function extractTitle(html: string) {
  const og =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1];
  if (og) return og.trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return title ? title.replace(/\s+/g, " ").trim() : "";
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
    const photo_urls = extractPhotos(html, finalUrl);
    const title = extractTitle(html);
    const host = hostOf(finalUrl) || hostOf(url);

    return json(res, 200, {
      success: true,
      data: {
        property_name: title || host || "Untitled Property",
        photo_urls,
        location_full: undefined,
        bedrooms: undefined,
        bathrooms: undefined,
        sleeps: undefined,
        property_type: undefined,
        short_summary: undefined,
        description: undefined,
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
