const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|wmv|mkv)(\?|$|&|#)/i;

function resolveUrl(raw, baseUrl) {
  let url = String(raw || "").trim().replace(/&amp;/g, "&");
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return "";
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) {
    if (!baseUrl) return "";
    try {
      url = new URL(url, baseUrl).href;
    } catch {
      return "";
    }
  }
  if (!/^https?:\/\//i.test(url)) return "";
  if (/\.svg(\?|$)/i.test(url) || VIDEO_EXT.test(url)) return "";
  return url;
}

function pushCandidate(list, seen, raw, source, index, baseUrl) {
  const url = resolveUrl(raw, baseUrl);
  if (!url) return;
  const key = url.split("?")[0].split("#")[0].toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    url,
    source,
    index: Number.isFinite(index) ? index : list.length + 100000,
  });
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? match[1] : "";
}

/**
 * Pull image URLs out of pasted HTML. Keeps extensionless CDN srcs such as
 * https://cdn.example/listing_image/abc and preserves data-index order.
 */
export function extractHtmlImages(html, baseUrl = "") {
  const source = String(html || "");
  const found = [];
  const seen = new Set();

  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src =
      attr(tag, "src") ||
      attr(tag, "data-src") ||
      attr(tag, "data-lazy-src") ||
      attr(tag, "data-original") ||
      attr(tag, "data-image") ||
      attr(tag, "data-full");
    const index = Number(attr(tag, "data-index"));
    if (src) pushCandidate(found, seen, src, "img", index, baseUrl);
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    if (srcset) {
      for (const part of srcset.split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) pushCandidate(found, seen, url, "img", index, baseUrl);
      }
    }
  }

  for (const match of source.matchAll(/url\(\s*['"]?(https?:[^'")\s]+)['"]?\s*\)/gi)) {
    pushCandidate(found, seen, match[1], "background-image", NaN, baseUrl);
  }

  found.sort((a, b) => a.index - b.index);
  return found.map(({ url, source: imageSource }) => ({ url, source: imageSource }));
}
