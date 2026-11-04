/**
 * Collapse gallery URLs that are the same photo at different sizes/encodings.
 * Keeps the first-seen stem's best URL (largest WordPress derivative preferred).
 */

function normalizeUrl(url) {
  return String(url || "")
    .trim()
    .replace(/^http:\/\//i, "https://");
}

function fileParts(url) {
  try {
    const u = new URL(normalizeUrl(url));
    const file = decodeURIComponent(u.pathname.split("/").pop() || "");
    const extMatch = file.match(/(\.(?:jpe?g|png|webp|gif|avif))+$/i);
    const exts = extMatch ? extMatch[0] : "";
    const name = file.slice(0, file.length - exts.length);
    const core = name
      .replace(/-scaled-\d+x\d+$/i, "")
      .replace(/-\d+x\d+$/i, "")
      .replace(/-scaled$/i, "");
    const sizeMatch = name.match(/-(\d+)x(\d+)$/i);
    const area = sizeMatch ? Number(sizeMatch[1]) * Number(sizeMatch[2]) : null;
    const hasScaled = /-scaled(?:-\d+x\d+)?$/i.test(name);
    return {
      host: u.host,
      dir: u.pathname.slice(0, u.pathname.lastIndexOf("/") + 1),
      core: core.toLowerCase(),
      area,
      hasScaled,
      bare: !hasScaled && area == null,
      bytesHint: 0,
    };
  } catch {
    return { host: "", dir: "", core: normalizeUrl(url).toLowerCase(), area: null, hasScaled: false, bare: true };
  }
}

function score(parts, url) {
  // Prefer bare originals, then -scaled, then largest explicit WxH.
  let s = 0;
  if (parts.bare) s += 50_000_000;
  else if (parts.hasScaled && parts.area == null) s += 40_000_000;
  else if (parts.area != null) s += parts.area;
  if (/\.webp$/i.test(url)) s += 10;
  if (/^https:\/\//i.test(url)) s += 5;
  // Prefer origin CDN assets over random blob hashes when stems collide via core name
  if (/wp-content\/uploads/i.test(url)) s += 100;
  return s;
}

function stemKey(parts, url) {
  if (!parts.core) return normalizeUrl(url).toLowerCase();
  // Blob uploads have unique hashed filenames — keep exact URL as key
  if (/vercel-storage\.com|blob\./i.test(parts.host) && /^[0-9]+-[a-f0-9]+$/i.test(parts.core.replace(/\.[^.]+$/, ""))) {
    return normalizeUrl(url).toLowerCase();
  }
  if (/vercel-storage\.com|blob\./i.test(parts.host)) {
    // Still group blob filenames that share a wp-like stem if present
    return `${parts.host}|${parts.core}`;
  }
  return `${parts.host}|${parts.dir}|${parts.core}`;
}

/**
 * @param {string[]} urls
 * @returns {string[]}
 */
export function dedupeGalleryUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const bestByStem = new Map();
  const order = [];

  for (const raw of urls) {
    const url = normalizeUrl(raw);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const parts = fileParts(url);
    const key = stemKey(parts, url);
    const prev = bestByStem.get(key);
    if (!prev) {
      bestByStem.set(key, { url, parts });
      order.push(key);
      continue;
    }
    if (score(parts, url) > score(prev.parts, prev.url)) {
      bestByStem.set(key, { url, parts });
    }
  }

  // Exact-URL pass (case-insensitive) on winners
  const out = [];
  const seen = new Set();
  for (const key of order) {
    const url = bestByStem.get(key)?.url;
    if (!url) continue;
    const k = url.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(url);
  }
  return out;
}
