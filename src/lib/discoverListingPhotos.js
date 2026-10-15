import { base44 } from "@/api/base44Client";

/** Unwrap Base44 / LOCAL_FUNCTIONS function responses (SDK may or may not wrap). */
export function unwrapFunctionPayload(res) {
  if (!res || typeof res !== "object") return res;
  if (res.data?.data && typeof res.data.data === "object") return res.data.data;
  if (res.data && typeof res.data === "object" && (res.data.candidates || res.data.photo_urls || res.data.success !== undefined)) {
    return res.data;
  }
  if (res.candidates || res.photo_urls || res.success !== undefined) return res;
  return res.data || res;
}

const BAD_PHOTO_SUBSTRINGS = [
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
];

function isJunkListingPhoto(url) {
  const lower = String(url || "").toLowerCase();
  return BAD_PHOTO_SUBSTRINGS.some((s) => lower.includes(s));
}

/**
 * Prefer large Guesty assets that browsers can display.
 * Raw Guesty paths without a Cloudinary transform often return
 * Content-Type: application/octet-stream, which <img> will not render.
 * Keep / add w_1600,c_limit,q_auto,f_auto so the CDN serves image/jpeg.
 */
export function preferListingPhotoUrl(url) {
  let next = String(url || "").trim();
  if (!next) return "";
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
  // WordPress size variants: foo-300x225.jpg → foo.jpg
  next = next.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
  return next.split("?")[0];
}

/** Stable key for collapsing Guesty width transforms + WP size suffixes. */
export function listingPhotoDedupeKey(url) {
  let key = String(url || "").trim().split("?")[0].toLowerCase();
  if (/assets\.guesty\.com/i.test(key)) {
    key = key.replace(/\/image\/upload\/(?:w_[^/]+\/)?/i, "/image/upload/");
  }
  key = key.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
  return key;
}

/**
 * Discover listing photos. Tries scrapePropertyUrl discover first, then falls
 * back to scrapePropertyLight (Guesty / Homerunner / WAF-heavy hosts).
 */
export async function discoverListingPhotos(listingUrl) {
  let candidates = [];

  try {
    const res = await base44.functions.invoke("scrapePropertyUrl", {
      url: listingUrl,
      mode: "discover",
    });
    const body = unwrapFunctionPayload(res);
    candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  } catch {
    /* fall through to light scrape */
  }

  try {
    const light = await base44.functions.invoke("scrapePropertyLight", { url: listingUrl });
    const body = unwrapFunctionPayload(light);
    const urls = Array.isArray(body?.photo_urls)
      ? body.photo_urls
      : Array.isArray(body?.data?.photo_urls)
        ? body.data.photo_urls
        : [];
    if (urls.length > candidates.length) {
      candidates = urls.map((url) => ({
        url,
        source: "light",
        confidence: "high",
      }));
    }
  } catch {
    /* keep whatever we have */
  }

  // Dedupe by normalized URL (collapses Guesty w_400/w_600/w_1200 variants)
  // and rewrite Guesty URLs so <img> gets a real image/* response.
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const url = preferListingPhotoUrl(c.url || c);
    if (!url || isJunkListingPhoto(url)) continue;
    const key = listingPhotoDedupeKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, url });
  }
  return out;
}

/**
 * Quality-filter selected URLs via scrapePropertyUrl commit when possible.
 * Falls back to the selected list (normalized) for Guesty/extensionless CDNs
 * that the cloud commit path often drops.
 */
export async function commitListingPhotos(listingUrl, selectedUrls) {
  const seen = new Set();
  const selected = [];
  for (const raw of selectedUrls || []) {
    const url = preferListingPhotoUrl(raw);
    if (!url || isJunkListingPhoto(url)) continue;
    const key = listingPhotoDedupeKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(url);
  }
  if (!selected.length) return [];

  try {
    const commitRes = await base44.functions.invoke("scrapePropertyUrl", {
      url: listingUrl,
      mode: "commit",
      selected_urls: selected,
    });
    const body = unwrapFunctionPayload(commitRes);
    const passed = Array.isArray(body?.photo_urls)
      ? body.photo_urls.map(preferListingPhotoUrl).filter((u) => u && !isJunkListingPhoto(u))
      : [];
    if (passed.length > 0) {
      const out = [];
      const seenPass = new Set();
      for (const u of passed) {
        const key = listingPhotoDedupeKey(u);
        if (seenPass.has(key)) continue;
        seenPass.add(key);
        out.push(u);
      }
      return out;
    }
  } catch {
    /* fall through */
  }

  return selected;
}
