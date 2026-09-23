// URL-based image transform helper for /apply pages.
//
// Appends width / quality / format query params to Base44 file-storage URLs
// (media.base44.com). If the host supports these transforms (most image CDNs
// do), the response is resized/recompressed; if not, unknown query params are
// ignored and the original is served — so this is a safe progressive
// enhancement that never breaks the image.
//
// WARNING(buck): verify media.base44.com actually honors width/quality/format.
// If it does not, route uploads through a real image CDN (Cloudflare Images /
// ImageKit) so these params take effect. Until then this layer is a no-op on
// the wire but the srcset/width/height still help the browser pick+reserve.
//
// Non-Base44 URLs (Unsplash, scraped og:image, external partner sites) are
// passed through untouched — we don't control their transforms.

const BASE44_MEDIA_HOST = "media.base44.com";

export function isBase44MediaUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    return new URL(url).hostname === BASE44_MEDIA_HOST;
  } catch {
    return false;
  }
}

// Append transform params to a single image URL.
export function optimizedImageUrl(url, { width, quality = 70, format } = {}) {
  if (!url || typeof url !== "string") return url;
  if (!isBase44MediaUrl(url)) return url;
  try {
    const u = new URL(url);
    if (width) u.searchParams.set("width", String(width));
    if (quality) u.searchParams.set("quality", String(quality));
    if (format) u.searchParams.set("format", format);
    return u.toString();
  } catch {
    return url;
  }
}

// Build a `w`-descriptor srcset from a list of target widths.
// Returns null for non-Base44 URLs so we don't emit a srcset the host ignores.
export function srcSet(url, widths, opts = {}) {
  if (!url || !isBase44MediaUrl(url)) return null;
  const list = Array.isArray(widths) ? widths : [widths];
  return list
    .filter((w) => w > 0)
    .map((w) => `${optimizedImageUrl(url, { ...opts, width: w })} ${w}w`)
    .join(", ");
}