import { base44 } from "@/api/base44Client";

/** Unwrap Base44 / LOCAL_FUNCTIONS function responses (SDK may or may not wrap). */
export function unwrapFunctionPayload(res) {
  if (!res || typeof res !== "object") return res;
  if (res.data?.data && typeof res.data.data === "object" && !Array.isArray(res.data.data)) {
    return res.data.data;
  }
  if (
    res.data &&
    typeof res.data === "object" &&
    (res.data.candidates || res.data.photo_urls || res.data.success !== undefined)
  ) {
    return res.data;
  }
  if (res.candidates || res.photo_urls || res.success !== undefined) return res;
  return res.data || res;
}

function extractPhotoUrls(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.photo_urls)) return payload.photo_urls;
  if (Array.isArray(payload.data?.photo_urls)) return payload.data.photo_urls;
  if (Array.isArray(payload.candidates)) {
    return payload.candidates.map((c) => c?.url || c).filter(Boolean);
  }
  return [];
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
    } else if (
      /\/image\/upload\//i.test(next) &&
      !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(next)
    ) {
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

function prefersLightScrape(listingUrl) {
  try {
    const host = new URL(listingUrl).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host.includes("lakefront") ||
      host.includes("guesty") ||
      host.includes("homerunner") ||
      host.endsWith(".luxury")
    );
  } catch {
    return false;
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

function normalizeCandidates(rawList) {
  const seen = new Set();
  const out = [];
  for (const c of rawList || []) {
    const url = preferListingPhotoUrl(c?.url || c);
    if (!url || isJunkListingPhoto(url)) continue;
    const key = listingPhotoDedupeKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...(typeof c === "object" && c ? c : {}),
      url,
      source: c?.source || "light",
      confidence: c?.confidence || "high",
    });
  }
  return out;
}

/**
 * Discover listing photos.
 * Prefer scrapePropertyLight (local, Guesty-aware) — cloud scrapePropertyUrl
 * often hangs or returns nothing on Homerunner / Guesty mega-pages.
 */
export async function discoverListingPhotos(listingUrl) {
  let candidates = [];

  const runLight = async () => {
    const light = await base44.functions.invoke("scrapePropertyLight", {
      url: listingUrl,
      photos_only: true,
      mode: "photos",
    });
    const body = unwrapFunctionPayload(light);
    const urls = extractPhotoUrls(body);
    return urls.map((url) => ({ url, source: "light", confidence: "high" }));
  };

  const runCloudDiscover = async () => {
    const res = await base44.functions.invoke("scrapePropertyUrl", {
      url: listingUrl,
      mode: "discover",
    });
    const body = unwrapFunctionPayload(res);
    return Array.isArray(body?.candidates) ? body.candidates : [];
  };

  // Guesty / Homerunner: light scrape first (cloud discover is unreliable here).
  if (prefersLightScrape(listingUrl)) {
    try {
      candidates = await runLight();
    } catch {
      /* try cloud below */
    }
    if (candidates.length < 8) {
      try {
        const cloud = await withTimeout(runCloudDiscover(), 8000);
        if (cloud.length > candidates.length) candidates = cloud;
      } catch {
        /* keep light */
      }
    }
  } else {
    try {
      candidates = await withTimeout(runCloudDiscover(), 12000);
    } catch {
      /* fall through */
    }
    if (candidates.length < 8) {
      try {
        const light = await runLight();
        if (light.length > candidates.length) candidates = light;
      } catch {
        /* keep cloud */
      }
    }
  }

  return normalizeCandidates(candidates);
}

/**
 * Quality-filter selected URLs via scrapePropertyUrl commit when possible.
 * Falls back to the selected list (normalized) for Guesty/extensionless CDNs
 * that the cloud commit path often drops.
 */
export async function commitListingPhotos(listingUrl, selectedUrls) {
  const selected = normalizeCandidates(
    (selectedUrls || []).map((url) => ({ url, source: "selected" }))
  ).map((c) => c.url);
  if (!selected.length) return [];

  try {
    const commitRes = await withTimeout(
      base44.functions.invoke("scrapePropertyUrl", {
        url: listingUrl,
        mode: "commit",
        selected_urls: selected,
      }),
      20000
    );
    const body = unwrapFunctionPayload(commitRes);
    const passed = extractPhotoUrls(body).map(preferListingPhotoUrl).filter((u) => u && !isJunkListingPhoto(u));
    if (passed.length > 0) {
      return normalizeCandidates(passed.map((url) => ({ url }))).map((c) => c.url);
    }
  } catch {
    /* fall through — ingest selections directly */
  }

  return selected;
}
