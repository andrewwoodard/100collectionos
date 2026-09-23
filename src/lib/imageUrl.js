const SIZE_PRESETS = {
  thumb: 400,
  small: 600,
  medium: 1200,
  large: 2400,
  hero: 3200,
};

/**
 * Returns a responsive image URL for the given display context.
 * For Supabase Storage URLs, appends on-demand transform params
 * (?width=X&quality=85&resize=cover) so the CDN serves a right-sized image.
 * For all other URLs (Vercel Blob, Base44 storage, Sanity CDN, external), returns as-is.
 *
 * @param {string} url  - The original image URL.
 * @param {"thumb"|"small"|"medium"|"large"|"hero"|"original"} size - Display context.
 */
export function getImageUrl(url, size = "original") {
  if (!url || typeof url !== "string") return "";
  if (size === "original") return url;

  const width = SIZE_PRESETS[size];
  if (!width) return url;

  // Only transform Supabase Storage URLs — Base44 and external CDNs don't support URL transforms.
  if (url.includes("supabase.co/storage")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}width=${width}&quality=85&resize=cover`;
  }

  return url;
}