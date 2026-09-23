import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Jimp from 'npm:jimp@0.22.12';
import { Buffer } from 'node:buffer';

// ─── Image helpers ───────────────────────────────────────────────────────────

const STOCK_PHOTO_DOMAINS = [
  'unsplash.com', 'pexels.com', 'shutterstock.com', 'istockphoto.com',
  'gettyimages.com', 'depositphotos.com', 'alamy.com', 'dreamstime.com',
  'stock.adobe.com', 'stocksy.com',
];

const BAD_PATTERNS = [
  'logo', 'brand', 'header', 'footer', 'icon', 'favicon', 'sprite', 'watermark',
  'badge', 'svgrepo', 'cropped', 'svg-',
  '-16x', '-32x', '-64x', '-96x', '-180x', '-110x',
  'headshot', 'staff', 'team', 'award', 'seal', 'certif',
  'placeholder', 'noimage', 'no-image', 'blank.jpg', 'default.jpg',
  'person', 'woman', 'man', 'smile', 'portrait',
];

const SMALL_SIZE_PATTERN = /-(\d{1,2})x(\d{1,2})\./;

// Video file extensions — never pull these into the image array
const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|m4v|avi|wmv|flv|mkv|ogg|ogv|3gp|mpe?g|mpg|m4p)(\?|$|&|#)/i;
function isVideoUrl(url) {
  return VIDEO_EXT_REGEX.test(url);
}

function isSmallImageByUrl(lower) {
  const m = lower.match(/[_-](\d+)x(\d+)\.[a-z]/);
  if (!m) return false;
  const w = parseInt(m[1]);
  const h = parseInt(m[2]);
  return w < 600 && h < 600;
}

// Strip query string and size suffix for canonical URL dedup
function canonicalImageUrl(url) {
  const base = url.split('?')[0].split('#')[0];
  return base.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1').toLowerCase();
}

// Deduplicate by canonical URL (collapses WP/CDN size variants of the same path)
function deduplicateImages(urls) {
  const seen = new Set();
  return urls.filter(url => {
    const key = canonicalImageUrl(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Image hosts that serve photos without a file extension (e.g. the Track HS
// image proxy and its S3 backing store: img.trackhs.com/<size>/<s3-url>).
// URLs on these hosts are accepted as images even with no .jpg/.png suffix.
const EXTENSIONLESS_IMAGE_HOSTS = [
  'img.trackhs.com',
  'track-pm.s3.amazonaws.com',
];
function isKnownExtensionlessImageHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return EXTENSIONLESS_IMAGE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function isPropertyImage(url, sourceDomain = null) {
  const lower = url.toLowerCase();
  if (isVideoUrl(url)) return false;
  const hasImageExt = !!lower.match(/\.(jpe?g|png|webp|avif|gif|bmp|tiff)(\?|$|&|#)/);
  if (!hasImageExt && !isKnownExtensionlessImageHost(url)) return false;
  if (BAD_PATTERNS.some(k => lower.includes(k.toLowerCase()))) return false;
  if (SMALL_SIZE_PATTERN.test(lower)) return false;
  if (isSmallImageByUrl(lower)) return false;
  if (lower.includes('.svg')) return false;
  if (STOCK_PHOTO_DOMAINS.some(d => lower.includes(d))) return false;

  if (sourceDomain) {
    const urlHost = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const srcHost = sourceDomain.replace(/^www\./, '');
    const ALLOWED_CDNS = [
      'cloudfront.net', 'imgix.net', 'cdn.rezfusion.com', 'images.rezfusion.com',
      'gallery.streamlinevrs.com', 'media.base44.com',
      'res.cloudinary.com', 'cloudinary.com', 'akamaihd.net', 'scene7.com',
      'fastly.net', 'imagedelivery.net', 'storage.googleapis.com',
      'googleusercontent.com', 's3.amazonaws.com', 'amazonaws.com',
      'images.weserv.nl', 'cdn.shopify.com', 'imagebam.com',
    ];
    const isSameDomain = urlHost === srcHost || urlHost.endsWith('.' + srcHost);
    const isAllowedCdn = ALLOWED_CDNS.some(cdn => urlHost.endsWith(cdn));
    if (!isSameDomain && !isAllowedCdn) return false;
  }

  return true;
}

// Check if a URL is on the same domain as the listing or an allowed CDN.
// Used as a fallback for discover mode to accept extensionless image URLs
// (e.g. API-served images or CDN transformation paths without .jpg suffix).
function isAllowedImageHost(url, sourceDomain) {
  if (!sourceDomain) return false;
  try {
    const urlHost = new URL(url).hostname.replace(/^www\./, '');
    const srcHost = sourceDomain.replace(/^www\./, '');
    const ALLOWED_CDNS = [
      'cloudfront.net', 'imgix.net', 'cdn.rezfusion.com', 'images.rezfusion.com',
      'gallery.streamlinevrs.com', 'media.base44.com',
      'res.cloudinary.com', 'cloudinary.com', 'akamaihd.net', 'scene7.com',
      'fastly.net', 'imagedelivery.net', 'storage.googleapis.com',
      'googleusercontent.com', 's3.amazonaws.com', 'amazonaws.com',
      'images.weserv.nl', 'cdn.shopify.com', 'imagebam.com',
    ];
    const isSameDomain = urlHost === srcHost || urlHost.endsWith('.' + srcHost);
    const isAllowedCdn = ALLOWED_CDNS.some(cdn => urlHost.endsWith(cdn));
    return isSameDomain || isAllowedCdn;
  } catch {
    return false;
  }
}

function cleanImageUrl(url) {
  if (url.includes('images.rezfusion.com/cdn-cgi/image/')) {
    const inner = url.replace(/^https:\/\/images\.rezfusion\.com\/cdn-cgi\/image\/[^/]+\//, '');
    if (inner.startsWith('http')) return inner.split('?')[0];
  }
  return url;
}

function getSourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

// Derive a normalized company token from the listing domain.
// seamountainvacations.com -> 'seamountainvacations'
function deriveCompanyToken(hostname) {
  if (!hostname) return null;
  const h = hostname.replace(/^www\./, '');
  // Strip TLD (.com, .net, .co.uk, etc.)
  const token = h.replace(/\.[a-z]{2,6}(\.[a-z]{2,3})?$/i, '');
  // Lowercase, strip all non-alphanumeric
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Reject images whose filename stem contains the company token.
// e.g. SeaMountainVacations_Black-1-1024x627.png -> 'seamountainvacationsblack1' contains 'seamountainvacations'
function isCompanyBrandedImage(url, companyToken) {
  if (!companyToken || companyToken.length < 4) return false;
  const path = url.split('?')[0].split('#')[0];
  const filename = path.split('/').pop() || '';
  const normalized = filename
    .replace(/\.[a-z]+$/i, '')          // strip extension
    .replace(/[_-]\d+x\d+/gi, '')       // strip size suffixes like -1024x627
    .replace(/[^a-z0-9]/gi, '')         // strip separators
    .toLowerCase();
  return normalized.includes(companyToken);
}

// ─── Target property slug & gallery extraction ───────────────────────────────

// Extract the target property slug from the listing URL.
// /cabin/mountain-view-lodge/ -> 'mountain-view-lodge'
// /vacation-rentals/1109-duneside-villa -> '1109-duneside-villa'
function extractPropertySlug(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/\/+$/, '').replace(/^\//, '');
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    let slug = segments[segments.length - 1];
    slug = slug.split('?')[0].split('#')[0];
    slug = slug.replace(/-(cabin|rental|property|villa|rentals|home|condo|estate)$/i, '');
    slug = slug.replace(/\.(html?|php|aspx?)$/i, '');
    slug = slug.toLowerCase().trim();
    return slug || null;
  } catch {
    return null;
  }
}

// Check if a URL's path or filename stem contains the given slug
function urlContainsSlug(imageUrl, slug) {
  if (!slug || slug.length < 4) return false;
  try {
    const path = new URL(imageUrl).pathname.toLowerCase();
    const filename = path.split('/').pop() || '';
    const stem = filename.replace(/\.[a-z]+$/i, '').replace(/[_-]\d+x\d+/gi, '');
    return path.includes(slug) || stem.includes(slug) || (stem.length >= 4 && slug.includes(stem));
  } catch {
    return imageUrl.toLowerCase().includes(slug);
  }
}

// Extract inner HTML of a container starting at startIndex using depth counting.
// Handles nested divs/sections/uls of the same tag type.
function extractContainerInner(html, startIndex, tagName) {
  const openTagRegex = new RegExp(`<${tagName}(?:\\s|>)`, 'gi');
  const closeTag = `</${tagName}>`;
  let pos = startIndex;
  let depth = 1;
  const maxScan = 200000;

  while (depth > 0 && pos < html.length && pos - startIndex < maxScan) {
    const nextClose = html.indexOf(closeTag, pos);
    openTagRegex.lastIndex = pos;
    const nextOpenMatch = openTagRegex.exec(html);
    const nextOpen = nextOpenMatch ? nextOpenMatch.index : -1;

    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + nextOpenMatch[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return html.substring(startIndex, nextClose);
      }
      pos = nextClose + closeTag.length;
    }
  }
  return null;
}

// Resolve a possibly-relative URL against the page base URL.
function resolveUrl(url, baseUrl) {
  if (!url) return null;
  try { return new URL(url, baseUrl).href; } catch { return null; }
}

// Pull image URLs from an HTML chunk using three signals:
//   1. <img> src / data-src / data-lazy-src / srcset candidates
//   2. inline background-image: url(...) — quoted or unquoted, absolute or relative
//   3. a generic absolute-URL sweep (catches URLs in JSON/scripts/data-attrs)
// Relative URLs are resolved against pageUrl so CSS-background and lazy <img>
// sources that omit the host are still captured.
function collectImageUrlsFromHtml(chunk, sourceDomain, pageUrl) {
  const found = new Set();
  const add = (raw) => {
    if (!raw) return;
    const cleaned = cleanImageUrl(raw.replace(/\\\//g, '/').trim());
    const resolved = resolveUrl(cleaned, pageUrl) || cleaned;
    if (isPropertyImage(resolved, sourceDomain)) { found.add(resolved); return; }
    // Fallback: accept same-domain or allowed-CDN URLs without a file extension.
    // Many modern sites and lazy-loaders serve images from API endpoints or CDN
    // transformation paths that omit .jpg/.png in the URL.
    const lower = resolved.toLowerCase();
    if (lower.startsWith('data:') || lower.includes('.svg') || !lower.startsWith('http')) return;
    if (BAD_PATTERNS.some(k => lower.includes(k.toLowerCase()))) return;
    if (isKnownExtensionlessImageHost(resolved)) return; // already accepted above
    if (isAllowedImageHost(resolved, sourceDomain)) found.add(resolved);
  };
  const addSrcset = (val) => {
    val.split(',').forEach((c) => {
      const u = c.trim().split(/\s+/)[0];
      if (u) add(u);
    });
  };

  // 1. <img> tags: src, expanded lazy-load data-* attrs, srcset + data-srcset
  const imgTagRegex = /<img\b[^>]*>/gi;
  let m;
  while ((m = imgTagRegex.exec(chunk)) !== null) {
    const tag = m[0];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)
      || tag.match(/\bdata-(?:src|lazy-src|lazy|original|cfsrc|image|photo|full|hi-res|hi_res|large|img|original-src|thumbnail|image-url|url)\s*=\s*["']([^"']+)["']/i);
    if (src) add(src[1]);
    const srcset = tag.match(/\b(?:srcset|data-srcset|data-lazy-srcset)\s*=\s*["']([^"']+)["']/i);
    if (srcset) addSrcset(srcset[1]);
  }

  // 1b. <source> tags (inside <picture>) — srcset, data-srcset, and src.
  const sourceTagRegex = /<source\b[^>]*>/gi;
  let s;
  while ((s = sourceTagRegex.exec(chunk)) !== null) {
    const tag = s[0];
    const srcset = tag.match(/\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/i);
    if (srcset) addSrcset(srcset[1]);
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) add(src[1]);
  }

  // 2. background-image: url(...) — with file extension (absolute or relative)
  const bgImgRegex = /url\(\s*['"]?([^'")]+\.(?:jpe?g|png|webp|avif|gif|bmp|tiff)(?:[^'")]*?)?)['"]?\s*\)/gi;
  let bg;
  while ((bg = bgImgRegex.exec(chunk)) !== null) add(bg[1]);
  // 2b. url(...) pointing at extensionless image hosts (e.g. Track HS proxy
  // /768x576/<s3-url>) — no file extension, so the regex above misses them.
  const bgExtlessRegex = /url\(\s*['"]?([^'")]+(?:img\.trackhs\.com|track-pm\.s3\.amazonaws\.com)[^'")]*?)['"]?\s*\)/gi;
  let bg2;
  while ((bg2 = bgExtlessRegex.exec(chunk)) !== null) add(bg2[1]);
  // 2c. data-bg / data-background on ANY element (not just <img>) — many
  // lazy-loaders and CMS themes set background images via data attributes on
  // <div>, <section>, <li> etc. with bare URLs not wrapped in url().
  const dataBgRegex = /\bdata-(?:bg|background|background-image|bg-src|bg-url|bg-image|parallax|slide)\s*=\s*["']([^"']+)["']/gi;
  let bg3;
  while ((bg3 = dataBgRegex.exec(chunk)) !== null) add(bg3[1]);

  // 2d. <a href="photo.jpg"> — lightbox/thumbnail gallery links
  const anchorImgRegex = /<a\b[^>]*(?:href|data-href|data-full|data-large|data-zoom-image|data-lightbox-url)\s*=\s*["']([^"']+\.(?:jpe?g|png|webp|avif|gif|bmp|tiff)(?:[^"']*)?)["']/gi;
  let an;
  while ((an = anchorImgRegex.exec(chunk)) !== null) add(an[1]);

  // 2e. data-image / data-photo on ANY element (not just <img>) — catches
  // lazy-loaded images set via data attributes on <div>, <li>, <a> etc.
  const dataImgRegex = /\bdata-(?:image|photo|image-url|image-src|full-image|large-image|hero-image)\s*=\s*["']([^"']+)["']/gi;
  let di;
  while ((di = dataImgRegex.exec(chunk)) !== null) add(di[1]);

  // 3. Generic absolute-URL sweep (catches URLs embedded in JSON/scripts)
  const absoluteImgRegex = /https?:\\?\/\\?\/[^\s"'<>\\,\]]+\.(?:jpe?g|png|webp|avif|gif|bmp|tiff)(?:[?%][^\s"'<>\\,\]]*)?/gi;
  let am;
  while ((am = absoluteImgRegex.exec(chunk)) !== null) add(am[0]);
  // 3b. Same sweep for extensionless image hosts (no .jpg suffix to anchor on)
  const absoluteExtlessRegex = /https?:\\?\/\\?\/[^\s"'<>\\,\)\]]*?(?:img\.trackhs\.com|track-pm\.s3\.amazonaws\.com)[^\s"'<>\\,\)\]]*/gi;
  let am2;
  while ((am2 = absoluteExtlessRegex.exec(chunk)) !== null) add(am2[0]);

  return found;
}

// Extract images from common gallery/carousel containers.
// Returns images found ONLY inside elements with gallery-like class/id names.
function extractGalleryImages(html, sourceDomain, pageUrl) {
  const galleryStartRegex = /<(div|section|ul|ol|figure|main|article)([^>]*(?:class|id)=["'][^"']*(?:gallery|carousel|slider|swiper|lightbox|photo-grid|property-photos|listing-photos|photo-gallery|image-gallery|property-gallery|unit-gallery|gallery-grid|gallery-wrapper|photo-slider|image-slider|photoset|galleria|flickity|splide|glider|property-images|room-photos|detail-gallery|media-gallery|gallery-container|property-media|gallery-view|gallery-slider|photos-slider|hero-gallery|asset-gallery|slider-main|slider-wrap)[^"']*["'][^>]*)>/gi;
  const images = new Set();

  const startMatches = [...html.matchAll(galleryStartRegex)];

  for (const startMatch of startMatches) {
    const tagName = startMatch[1];
    const startIndex = startMatch.index + startMatch[0].length;
    const containerHtml = extractContainerInner(html, startIndex, tagName);
    if (!containerHtml) continue;
    collectImageUrlsFromHtml(containerHtml, sourceDomain, pageUrl).forEach((u) => images.add(u));
  }

  return Array.from(images);
}

// Extract image URLs from JSON-LD structured data (schema.org).
// Many vacation rental sites embed LodgingBusiness/VacationRental schema with
// an `image` field (string, array, or ImageObject) that lists all property photos.
function extractJsonLdImages(html, sourceDomain, pageUrl) {
  const images = new Set();
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of jsonLdMatches) {
    try {
      const json = JSON.parse(m[1].replace(/<\/?script[^>]*>/gi, ''));
      const schemas = Array.isArray(json) ? json : [json];
      for (const s of schemas) {
        if (!s || typeof s !== 'object') continue;
        const items = s['@graph'] && Array.isArray(s['@graph']) ? s['@graph'] : [s];
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const collectImages = (val) => {
            if (!val) return;
            if (typeof val === 'string') {
              const cleaned = cleanImageUrl(val.replace(/\\\//g, '/'));
              const resolved = resolveUrl(cleaned, pageUrl) || cleaned;
              const lower = resolved.toLowerCase();
              if (lower.startsWith('http') &&
                  /\.(?:jpe?g|png|webp|avif|gif|bmp|tiff)(?:\?|#|&|$)/i.test(resolved) &&
                  !BAD_PATTERNS.some(k => lower.includes(k.toLowerCase()))) {
                images.add(resolved);
              }
            } else if (Array.isArray(val)) {
              val.forEach(collectImages);
            } else if (typeof val === 'object') {
              collectImages(val.url || val.contentUrl || val.thumbnailUrl);
            }
          };
          collectImages(item.image);
          collectImages(item.photo);
          collectImages(item.photos);
          collectImages(item.imageGallery);
          collectImages(item.subjectOf?.image);
        }
      }
    } catch {}
  }
  return Array.from(images);
}

// Find other property slugs mentioned on the page (sibling listings).
// Looks for common listing URL patterns on the same domain.
function extractSiblingSlugs(html, targetSlug) {
  const slugs = new Set();
  const listingLinkRegex = /href=["'][^"']*(?:\/(?:cabin|property|vacation-rental|villa|listing|rental|home|condo|estate|unit)s?\/)([^"'?#/]+)["']/gi;
  let match;
  while ((match = listingLinkRegex.exec(html)) !== null) {
    const slug = match[1].toLowerCase().replace(/-(cabin|rental|property|villa|rentals|home|condo|estate)$/i, '');
    if (slug && slug !== targetSlug && slug.length >= 4) {
      slugs.add(slug);
    }
  }
  return Array.from(slugs);
}

// Score a photo URL against the target slug and sibling slugs.
// Returns: 'high' (slug match), 'low' (no match), 'reject' (matches sibling)
function scorePhotoByUrl(imageUrl, targetSlug, siblingSlugs) {
  if (urlContainsSlug(imageUrl, targetSlug)) return 'high';
  if (siblingSlugs.some(s => urlContainsSlug(imageUrl, s))) return 'reject';
  return 'low';
}

function extractImagesFromHtml(html, sourceDomain, pageUrl) {
  // Strip header, nav, footer — logos live there, property photos don't
  const cleanedHtml = html
    .replace(/<header[\s>][\s\S]*?<\/header>/gi, '')
    .replace(/<nav[\s>][\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s>][\s\S]*?<\/footer>/gi, '');

  return Array.from(collectImageUrlsFromHtml(cleanedHtml, sourceDomain, pageUrl));
}

// ─── Perceptual & content fingerprinting ─────────────────────────────────────

// Normalize filename → base stem (strip extension, size suffixes, @2x variants)
function filenameStem(url) {
  const path = url.split('?')[0].split('#')[0];
  const filename = path.split('/').pop() || '';
  return filename
    .replace(/\.[a-z]+$/i, '')             // remove extension
    .replace(/@\d+x?$/i, '')               // strip @2x @3x
    .replace(/[_-]\d+x\d+$/i, '')          // strip -1200x800 _300x200
    .replace(/@\d+w$/i, '')                // strip @600w
    .replace(/[_-](large|medium|small|thumb|thumbnail|sm|md|lg|xl|full|original)$/i, '')
    .toLowerCase();
}

// SHA-256 of raw bytes → hex string (content identity)
async function sha256hex(buf) {
  try {
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

// Average hash (aHash): 8×8 grayscale → 64-bit binary string
// Two images are "the same" if Hamming distance ≤ 10.
// Also returns the original image width so callers can filter out small
// thumbnails / icons that aren't real property photos.
async function computeImageFingerprint(buf) {
  try {
    const img = await Jimp.read(Buffer.from(buf));
    const width = img.bitmap.width;
    img.resize(8, 8).greyscale();
    const pixels = [];
    img.scan(0, 0, 8, 8, (_x, _y, idx) => pixels.push(img.bitmap.data[idx]));
    const avg = pixels.reduce((a, b) => a + b, 0) / 64;
    const aHash = pixels.map(p => (p >= avg ? '1' : '0')).join('');
    return { aHash, width };
  } catch {
    return { aHash: null, width: null };
  }
}

function hammingDistance(h1, h2) {
  let d = 0;
  for (let i = 0; i < Math.min(h1.length, h2.length); i++) {
    if (h1[i] !== h2[i]) d++;
  }
  return d;
}

// Fetch an image and return its fingerprint (stem, sha256, aHash)
async function buildFingerprint(url) {
  const stem = filenameStem(url);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { url, stem, sha256: null, aHash: null };
    const buf = await res.arrayBuffer();
    const [hash, fp] = await Promise.all([sha256hex(buf), computeImageFingerprint(buf)]);
    return { url, stem, sha256: hash, aHash: fp.aHash, width: fp.width };
  } catch {
    return { url, stem, sha256: null, aHash: null, width: null };
  }
}

function isLogoMatch(photoFp, logoFingerprints) {
  for (const lf of logoFingerprints) {
    // 1. Filename stem match (skip very short stems to avoid false positives)
    if (lf.stem && photoFp.stem && lf.stem.length >= 5 && lf.stem === photoFp.stem) return true;
    // 2. Exact byte identity (SHA-256)
    if (lf.sha256 && photoFp.sha256 && lf.sha256 === photoFp.sha256) return true;
    // 3. Perceptual similarity (aHash, Hamming ≤ 10 of 64)
    if (lf.aHash && photoFp.aHash && hammingDistance(lf.aHash, photoFp.aHash) <= 10) return true;
  }
  return false;
}

// ─── Width filter ─────────────────────────────────────────────────────────────
// Keep only images with a measured width >= MIN_PHOTO_WIDTH. Images whose
// width couldn't be read (fetch failed or unsupported format like AVIF) are
// kept only when no measured image clears the floor — a safety valve so a hard
// 800px floor doesn't zero out results on sites that block direct image fetches.
const MIN_PHOTO_WIDTH = 800;
function filterByWidth(fps) {
  const ok = fps.filter(fp => fp.width != null && fp.width >= MIN_PHOTO_WIDTH);
  if (ok.length > 0) return ok;
  return fps.filter(fp => fp.width == null);
}

// ─── Partner logo lookup ──────────────────────────────────────────────────────

async function fetchKnownLogoUrls(base44, partnerId, userEmail) {
  const urls = [];
  const seen = new Set();
  const add = (u) => { if (u && !seen.has(u)) { seen.add(u); urls.push(u); } };

  // PartnerProfile.company_logo_url for this user
  try {
    const filter = userEmail ? { partner_email: userEmail } : (partnerId ? { partner_id: partnerId } : null);
    if (filter) {
      const profiles = await base44.asServiceRole.entities.PartnerProfile.filter(filter);
      for (const p of profiles) add(p.company_logo_url);
    }
  } catch (e) {
    console.log(`PartnerProfile logo lookup failed: ${e.message}`);
  }

  // MediaAssets with asset_type = "logo" for this partner
  if (partnerId) {
    try {
      const assets = await base44.asServiceRole.entities.MediaAsset.filter({
        partner_id: partnerId,
        asset_type: 'logo',
      });
      for (const a of assets) { add(a.file_url); add(a.thumbnail_url); }
    } catch (e) {
      console.log(`MediaAsset logo lookup failed: ${e.message}`);
    }
  }

  return urls;
}

// ─── Stats extraction ─────────────────────────────────────────────────────────

function extractStatsFromHtml(html) {
  const stats = { bedrooms: null, bathrooms: null, sleeps: null };
  const text = html.replace(/<[^>]+>/g, ' ');
  const bedroomMatch = text.match(/(\d+)\s*bed(?:room)?s?/i);
  if (bedroomMatch) stats.bedrooms = parseInt(bedroomMatch[1]);
  const bathroomMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:full\s+)?bath(?:room)?s?/i);
  if (bathroomMatch) stats.bathrooms = parseFloat(bathroomMatch[1]);
  const sleepsMatch = text.match(/(?:sleeps|guests?|max(?:imum)?\s*(?:guests?|occupancy))[^\d]*(\d+)/i)
    || text.match(/(\d+)\s*(?:guests?|people|persons?)/i);
  if (sleepsMatch) stats.sleeps = parseInt(sleepsMatch[1]);
  return stats;
}

// ─── Location extraction ──────────────────────────────────────────────────────

function extractLocationFromHtml(html) {
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const block of jsonLdMatch) {
      try {
        const json = JSON.parse(block.replace(/<\/?script[^>]*>/gi, ''));
        const schemas = Array.isArray(json) ? json : [json];
        for (const s of schemas) {
          const addr = s?.address || s?.location?.address;
          if (addr) {
            return {
              city: addr.addressLocality || null,
              state: addr.addressRegion || null,
              country: addr.addressCountry || null,
            };
          }
        }
      } catch {}
    }
  }
  const city = (html.match(/property=["']og:locality["'][^>]*content=["']([^"']+)["']/i) ||
                html.match(/content=["']([^"']+)["'][^>]*property=["']og:locality["']/i))?.[1];
  const state = (html.match(/property=["']og:region["'][^>]*content=["']([^"']+)["']/i) ||
                 html.match(/content=["']([^"']+)["'][^>]*property=["']og:region["']/i))?.[1];
  if (city || state) return { city: city || null, state: state || null, country: null };
  return null;
}

// ─── Property type normalization ────────────────────────────────────────────────

// Map free-text property types from the LLM to the PropertySubmission enum.
// The LLM often returns "Luxury Beach House", "Cottage", "Villa" (capitalized),
// but the form dropdown expects lowercase enum values.
function normalizePropertyType(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  const ENUM = ['villa', 'house', 'condo', 'estate', 'cabin', 'penthouse', 'chalet', 'farmhouse', 'other'];
  if (ENUM.includes(lower)) return lower;
  if (lower.includes('villa')) return 'villa';
  if (lower.includes('penthouse')) return 'penthouse';
  if (lower.includes('chalet')) return 'chalet';
  if (lower.includes('farm')) return 'farmhouse';
  if (lower.includes('condo') || lower.includes('apartment') || lower.includes('flat')) return 'condo';
  if (lower.includes('estate')) return 'estate';
  if (lower.includes('cabin') || lower.includes('cottage')) return 'cabin';
  if (lower.includes('house') || lower.includes('home') || lower.includes('beach') || lower.includes('luxury') || lower.includes('retreat')) return 'house';
  return 'other';
}

// ─── Rich text & structured data extraction ───────────────────────────────────

// Extract ALL JSON-LD blocks and format them as readable text.
// Many vacation rental sites embed schema.org LodgingBusiness / VacationRental
// JSON-LD with name, description, numberOfRooms, occupancy, amenityFeature, etc.
function extractJsonLdText(html) {
  const blocks = [];
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of jsonLdMatches) {
    try {
      const json = JSON.parse(m[1].replace(/<\/?script[^>]*>/gi, ''));
      const schemas = Array.isArray(json) ? json : [json];
      for (const s of schemas) {
        if (!s || typeof s !== 'object') continue;
        // Flatten @graph entries (common pattern)
        const items = s['@graph'] && Array.isArray(s['@graph']) ? s['@graph'] : [s];
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const type = item['@type'] || '';
          // Only include relevant schema types
          if (type && !/lodging|rental|hotel|resort|place|tourist|accommodation/i.test(String(type))) continue;
          const parts = [];
          if (item.name) parts.push(`Name: ${item.name}`);
          if (item.description) parts.push(`Description: ${item.description}`);
          if (item.numberOfRooms) parts.push(`Bedrooms: ${item.numberOfRooms}`);
          if (item.occupancy?.maxValue) parts.push(`Sleeps: ${item.occupancy.maxValue}`);
          if (item.amenityFeature && Array.isArray(item.amenityFeature)) {
            const amenities = item.amenityFeature
              .map(a => typeof a === 'string' ? a : (a?.name || ''))
              .filter(Boolean);
            if (amenities.length) parts.push(`Amenities: ${amenities.join(', ')}`);
          }
          const addr = item.address || item.location?.address;
          if (addr) {
            const addrParts = [
              addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode, addr.addressCountry
            ].filter(Boolean);
            if (addrParts.length) parts.push(`Address: ${addrParts.join(', ')}`);
          }
          if (item.url) parts.push(`URL: ${item.url}`);
          if (parts.length) blocks.push(parts.join('\n'));
        }
      }
    } catch {}
  }
  return blocks.join('\n\n');
}

// Extract meta tags that contain property info
function extractMetaText(html) {
  const parts = [];
  const getMeta = (prop) => {
    const m = html.match(new RegExp(`(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
           || html.match(new RegExp(`content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
    return m ? m[1] : null;
  };
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) parts.push(`Page Title: ${title}`);
  const desc = getMeta('description');
  if (desc) parts.push(`Meta Description: ${desc}`);
  const ogTitle = getMeta('og:title');
  if (ogTitle && ogTitle !== title) parts.push(`OG Title: ${ogTitle}`);
  const ogDesc = getMeta('og:description');
  if (ogDesc) parts.push(`OG Description: ${ogDesc}`);
  return parts.join('\n');
}

// Extract noscript fallback content — many JS-rendered sites include
// a full property description inside <noscript> for crawlers
function extractNoscriptText(html) {
  const matches = html.matchAll(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi);
  const texts = [];
  for (const m of matches) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 50) texts.push(text);
  }
  return texts.join('\n');
}

// Build a comprehensive text bundle from the HTML for the LLM
function extractPageText(html) {
  if (!html) return '';
  const sections = [];

  const meta = extractMetaText(html);
  if (meta) sections.push('=== META TAGS ===\n' + meta);

  const jsonLd = extractJsonLdText(html);
  if (jsonLd) sections.push('=== STRUCTURED DATA (JSON-LD) ===\n' + jsonLd);

  const noscript = extractNoscriptText(html);
  if (noscript) sections.push('=== NOSCRIPT FALLBACK ===\n' + noscript);

  // Full visible text (strip scripts/styles first, then tags)
  const cleanedHtml = html
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s>][\s\S]*?<\/style>/gi, '')
    .replace(/<header[\s>][\s\S]*?<\/header>/gi, '')
    .replace(/<nav[\s>][\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s>][\s\S]*?<\/footer>/gi, '');
  const visibleText = cleanedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (visibleText) sections.push('=== PAGE TEXT ===\n' + visibleText.slice(0, 15000));

  return sections.join('\n\n').slice(0, 20000);
}

// ─── Rezfusion GraphQL photo fetch ──────────────────────────────────────────

async function fetchRezfusionPhotos(pageUrl, sourceDomain) {
  try {
    const urlObj = new URL(pageUrl);
    const hubPropertyId = urlObj.searchParams.get('hub_property_id');
    if (!hubPropertyId) return [];

    const decoded = atob(hubPropertyId);
    console.log(`Rezfusion decoded ID: ${decoded}`);
    const numericId = decoded.split(':')[1];
    if (!numericId) return [];

    const graphqlQuery = {
      query: `query GetItem($id: ID!) { item(id: $id) { id name photos { url isPrimary } } }`,
      variables: { id: decoded }
    };

    for (const endpoint of ['https://api.rezfusion.com/graphql', 'https://hub.rezfusion.com/graphql']) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify(graphqlQuery),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          const photos = data?.data?.item?.photos;
          if (photos?.length > 0) {
            console.log(`Rezfusion GraphQL photos: ${photos.length}`);
            return photos.map(p => p.url).filter(u => u && isPropertyImage(u, sourceDomain));
          }
        }
      } catch (e) {
        console.log(`GraphQL endpoint ${endpoint} failed: ${e.message}`);
      }
    }

    // Fallback: CDN patterns in clean page HTML
    const cleanUrl = `${urlObj.origin}${urlObj.pathname}`;
    const cleanRes = await fetch(cleanUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (cleanRes.ok) {
      const cleanHtml = await cleanRes.text();
      const cdnPatterns = [
        /gallery\.streamlinevrs\.com\/[^\s"'\\>]+\.(?:jpg|jpeg|png|webp)/gi,
        /dh[a-z0-9]+\.cloudfront\.net\/uploads\/[^\s"'\\>]+\.(?:jpg|jpeg|png|webp)/gi,
        /images\.rezfusion\.com\/[^\s"'\\>]+\.(?:jpg|jpeg|png|webp)/gi,
      ];
      const found = new Set();
      for (const pattern of cdnPatterns) {
        let m;
        while ((m = pattern.exec(cleanHtml)) !== null) {
          const fullUrl = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
          const cleaned = cleanImageUrl(fullUrl.replace(/\\\//g, '/'));
          if (isPropertyImage(cleaned, null)) found.add(cleaned);
        }
      }
      console.log(`Clean page CDN images: ${found.size}`);
      if (found.size > 0) return Array.from(found);
    }

    return [];
  } catch (e) {
    console.log(`fetchRezfusionPhotos error: ${e.message}`);
    return [];
  }
}

// ─── LMPM WordPress API photo fetch ─────────────────────────────────────────

async function fetchLmpmPhotos(pageUrl, sourceDomain) {
  try {
    const urlObj = new URL(pageUrl);
    const hubPropertyId = urlObj.searchParams.get('hub_property_id');
    if (!hubPropertyId) return { photos: [], propertyData: null };

    const origin = urlObj.origin;
    let page = 1;
    while (page <= 10) {
      const res = await fetch(`${origin}/wp-json/lmpm/v1/properties-by-name?pageNumber=${page}&pageSize=25`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;
      const data = await res.json();
      const props = data?.results || (Array.isArray(data) ? data : []);
      if (props.length === 0) break;

      const match = props.find(p => p.id === hubPropertyId);
      if (match) {
        const images = match.images || [];
        const urls = images
          .map(img => cleanImageUrl((img?.path || img?.source_file_path || img?.url || '').replace(/\\\//g, '/')))
          .filter(u => u && u.startsWith('http') && isPropertyImage(u, null));
        console.log(`LMPM found property "${match.friendly_name || match.name}", images: ${urls.length}`);
        return { photos: urls, propertyData: match };
      }
      page++;
    }
    return { photos: [], propertyData: null };
  } catch (e) {
    console.log(`LMPM API error: ${e.message}`);
    return { photos: [], propertyData: null };
  }
}

// ─── Main page HTML fetch ────────────────────────────────────────────────────

async function fetchPageHtml(url, sourceDomain) {
  // Try multiple user agents in sequence. Many JS-rendered sites serve
  // pre-rendered HTML to crawlers (Googlebot), which includes photo URLs
  // and text content that the regular browser UA doesn't get.
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ];

  let best = { html: '', images: [], location: null, ua: '' };

  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      const ogImages = [];
      for (const m of html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)) ogImages.push(m[1]);
      for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi)) ogImages.push(m[1]);

      const filteredOg = ogImages.filter(u => isPropertyImage(u, sourceDomain));
      const location = extractLocationFromHtml(html);

      // Prefer the fetch that yielded more images, or more HTML text
      const score = filteredOg.length * 1000 + html.length;
      const bestScore = best.images.length * 1000 + best.html.length;
      if (score > bestScore) {
        best = { html, images: filteredOg, location, ua };
      }

      // Stop trying more UAs if we already found enough images
      if (filteredOg.length >= 3) break;
    } catch (e) {
      console.log(`Page HTML fetch error (${ua.slice(0, 30)}...): ${e.message}`);
    }
  }

  if (best.ua) console.log(`Best HTML fetch UA: ${best.ua.includes('Googlebot') ? 'Googlebot' : 'Browser'} (${best.html.length} chars, ${best.images.length} og images)`);
  return { html: best.html, images: best.images, location: best.location };
}

// ─── Extract raw text snippets ───────────────────────────────────────────────

function extractRawSnippets(html) {
  if (!html) return {};
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const snippets = {};
  const locMatch = text.match(/(?:located? in|destination|city|address)[^.]{0,80}/i);
  if (locMatch) snippets.location_context = locMatch[0].trim();
  const statsMatch = text.match(/\d+\s*bed(?:room)?s?[^.]{0,60}/i);
  if (statsMatch) snippets.stats_context = statsMatch[0].trim();
  return snippets;
}

// ─── Discover-mode collector ─────────────────────────────────────────────────
// Returns candidate image URLs tagged by source (img / background-image / gallery
// / og / api / picture / embedded) for the showcase UI. Mirrors the collection
// logic in collectImageUrlsFromHtml but keeps the source signal and skips
// per-image fetching so discovery stays fast.
function collectCandidatesTagged(html, ogImages, galleryPhotos, lmpmPhotos, rezfusionPhotos, sourceDomain, pageUrl, permissive = false) {
  const seen = new Map(); // canonical url -> {url, source}
  const add = (raw, source) => {
    if (!raw) return;
    const cleaned = cleanImageUrl(raw.replace(/\\\//g, '/').trim());
    const resolved = resolveUrl(cleaned, pageUrl) || cleaned;
    // Paste mode is admin-curated: keep any http(s) image URL the admin pasted
    // instead of rejecting extensionless/foreign-CDN URLs via isPropertyImage.
    if (permissive) {
      const lower = resolved.toLowerCase();
      if (lower.startsWith('data:')) return;
      if (lower.includes('.svg')) return;
      if (isVideoUrl(resolved)) return;
      if (BAD_PATTERNS.some(k => lower.includes(k.toLowerCase()))) return;
      if (!lower.startsWith('http')) return;
    } else if (!isPropertyImage(resolved, sourceDomain)) {
      // Discover-mode safety valve: accept same-domain or allowed-CDN image
      // URLs even without a file extension. Many modern sites and lazy-loaders
      // serve images from API endpoints or CDN transformation paths that omit
      // .jpg/.png in the URL. The user manually reviews candidates in discover
      // mode, so surfacing these is safe.
      const lower = resolved.toLowerCase();
      if (lower.startsWith('data:') || lower.includes('.svg') || !lower.startsWith('http')) return;
      if (isVideoUrl(resolved)) return;
      if (BAD_PATTERNS.some(k => lower.includes(k.toLowerCase()))) return;
      if (isKnownExtensionlessImageHost(resolved)) return; // already accepted by isPropertyImage
      if (!isAllowedImageHost(resolved, sourceDomain)) return;
    }
    const key = canonicalImageUrl(resolved);
    if (seen.has(key)) return;
    seen.set(key, { url: resolved, source });
  };
  const addSrcset = (val, source) => {
    val.split(',').forEach((c) => {
      const u = c.trim().split(/\s+/)[0];
      if (u) add(u, source);
    });
  };

  const cleanedHtml = html
    ? html
        .replace(/<header[\s>][\s\S]*?<\/header>/gi, '')
        .replace(/<nav[\s>][\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s>][\s\S]*?<\/footer>/gi, '')
    : '';

  if (cleanedHtml) {
    let m;
    const imgTagRegex = /<img\b[^>]*>/gi;
    while ((m = imgTagRegex.exec(cleanedHtml)) !== null) {
      const tag = m[0];
      const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)
        || tag.match(/\bdata-(?:src|lazy-src|lazy|original|cfsrc|image|photo|full|hi-res|hi_res|large|img|original-src|thumbnail|image-url|url)\s*=\s*["']([^"']+)["']/i);
      if (src) add(src[1], 'img');
      const srcset = tag.match(/\b(?:srcset|data-srcset|data-lazy-srcset)\s*=\s*["']([^"']+)["']/i);
      if (srcset) addSrcset(srcset[1], 'img');
    }
    const sourceTagRegex = /<source\b[^>]*>/gi;
    let s;
    while ((s = sourceTagRegex.exec(cleanedHtml)) !== null) {
      const tag = s[0];
      const srcset = tag.match(/\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/i);
      if (srcset) addSrcset(srcset[1], 'picture');
      const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if (src) add(src[1], 'picture');
    }
    const bgImgRegex = /url\(\s*['"]?([^'")]+\.(?:jpe?g|png|webp|avif|gif|bmp|tiff)(?:[^'")]*?)?)['"]?\s*\)/gi;
    let bg;
    while ((bg = bgImgRegex.exec(cleanedHtml)) !== null) add(bg[1], 'background-image');
    // Extensionless image hosts in url() (Track HS proxy /768x576/<s3-url>).
    const bgExtlessRegex = /url\(\s*['"]?([^'")]+(?:img\.trackhs\.com|track-pm\.s3\.amazonaws\.com)[^'")]*?)['"]?\s*\)/gi;
    let bg2;
    while ((bg2 = bgExtlessRegex.exec(cleanedHtml)) !== null) add(bg2[1], 'background-image');
    // data-bg / data-background on ANY element — lazy-loaders and CMS themes
    // set background images via data attributes on <div>/<section>/<li> etc.
    // with bare URLs not wrapped in url().
    const dataBgRegex = /\bdata-(?:bg|background|background-image|bg-src|bg-url|bg-image|parallax|slide)\s*=\s*["']([^"']+)["']/gi;
    let bg3;
    while ((bg3 = dataBgRegex.exec(cleanedHtml)) !== null) add(bg3[1], 'background-image');
    // <a href="photo.jpg"> — lightbox/thumbnail gallery links
    const anchorImgRegex = /<a\b[^>]*(?:href|data-href|data-full|data-large|data-zoom-image|data-lightbox-url)\s*=\s*["']([^"']+\.(?:jpe?g|png|webp|avif|gif|bmp|tiff)(?:[^"']*)?)["']/gi;
    let an;
    while ((an = anchorImgRegex.exec(cleanedHtml)) !== null) add(an[1], 'anchor');
    // data-image / data-photo on ANY element (not just <img>)
    const dataImgRegex = /\bdata-(?:image|photo|image-url|image-src|full-image|large-image|hero-image)\s*=\s*["']([^"']+)["']/gi;
    let di;
    while ((di = dataImgRegex.exec(cleanedHtml)) !== null) add(di[1], 'data-attr');
    // Paste mode: also catch any extensionless url(http...) the admin pasted,
    // since arbitrary CDNs won't match the host-specific regex above.
    if (permissive) {
      const bgAnyRegex = /url\(\s*['"]?(https?:[^'")]+)['"]?\s*\)/gi;
      let bg3;
      while ((bg3 = bgAnyRegex.exec(cleanedHtml)) !== null) add(bg3[1], 'background-image');
    }
    const absoluteImgRegex = /https?:\\?\/\\?\/[^\s"'<>\\,\]]+\.(?:jpe?g|png|webp|avif|gif|bmp|tiff)(?:[?%][^\s"'<>\\,\]]*)?/gi;
    let am;
    while ((am = absoluteImgRegex.exec(cleanedHtml)) !== null) add(am[0], 'embedded');
    // Same sweep for extensionless image hosts (no .jpg suffix to anchor on).
    const absoluteExtlessRegex = /https?:\\?\/\\?\/[^\s"'<>\\,\)\]]*?(?:img\.trackhs\.com|track-pm\.s3\.amazonaws\.com)[^\s"'<>\\,\)\]]*/gi;
    let am2;
    while ((am2 = absoluteExtlessRegex.exec(cleanedHtml)) !== null) add(am2[0], 'embedded');
  }

  // Gallery container images — stronger signal, override source label.
  galleryPhotos.forEach((u) => {
    const key = canonicalImageUrl(u);
    if (!seen.has(key)) seen.set(key, { url: u, source: 'gallery' });
    else seen.get(key).source = 'gallery';
  });
  ogImages.forEach((u) => {
    const key = canonicalImageUrl(u);
    if (!seen.has(key)) seen.set(key, { url: u, source: 'og' });
  });
  // API sources are authoritative — relabel any matching candidate.
  lmpmPhotos.forEach((u) => {
    const key = canonicalImageUrl(u);
    if (!seen.has(key)) seen.set(key, { url: u, source: 'api' });
    else seen.get(key).source = 'api';
  });
  rezfusionPhotos.forEach((u) => {
    const key = canonicalImageUrl(u);
    if (!seen.has(key)) seen.set(key, { url: u, source: 'api' });
    else seen.get(key).source = 'api';
  });

  return Array.from(seen.values());
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url, partner_id, mode, selected_urls, html: pastedHtml, page_url } = await req.json();

    // Paste mode: parse raw HTML the admin pasted (<img src> / background-image)
    // with no network fetch. An optional page_url resolves relative URLs.
    if (mode === 'paste') {
      if (!pastedHtml) return Response.json({ error: 'HTML content is required' }, { status: 400 });
      const baseUrl = page_url || url || null;
      // Pass a null source domain so images on any CDN the admin pasted are kept
      // (only extension + logo/icon pattern filters still apply). baseUrl still
      // resolves relative URLs against the source page.
      const candidates = collectCandidatesTagged(pastedHtml, [], [], [], [], null, baseUrl, true);
      console.log(`Paste mode: ${candidates.length} candidates from pasted HTML`);
      return Response.json({ success: true, data: { candidates } });
    }

    if (!url) return Response.json({ error: 'URL is required' }, { status: 400 });

    // Discover mode: light URL collection (no per-image fetch or LLM) so the UI
    // can showcase the img / background-image URLs found on the page before the
    // user chooses which to scrape.
    if (mode === 'discover') {
      const sourceDomain = getSourceDomain(url);
      const [htmlResult, rezfusionResult, lmpmResult] = await Promise.allSettled([
        fetchPageHtml(url, sourceDomain),
        fetchRezfusionPhotos(url, sourceDomain),
        fetchLmpmPhotos(url, sourceDomain),
      ]);
      const { html = '', images: ogImages = [] } = htmlResult.status === 'fulfilled' ? htmlResult.value : {};
      const rezfusionPhotos = rezfusionResult.status === 'fulfilled' ? rezfusionResult.value : [];
      const { photos: lmpmPhotos } = lmpmResult.status === 'fulfilled' ? lmpmResult.value : { photos: [] };

      const companyToken = deriveCompanyToken(sourceDomain);
      const targetSlug = extractPropertySlug(url);
      const siblingSlugs = html ? extractSiblingSlugs(html, targetSlug) : [];
      const galleryPhotos = html ? extractGalleryImages(html, sourceDomain, url) : [];

      const candidates = collectCandidatesTagged(html, ogImages, galleryPhotos, lmpmPhotos, rezfusionPhotos, sourceDomain, url)
        .filter(c => !isCompanyBrandedImage(c.url, companyToken))
        .filter(c => scorePhotoByUrl(c.url, targetSlug, siblingSlugs) !== 'reject')
        .map(c => {
          const score = scorePhotoByUrl(c.url, targetSlug, siblingSlugs);
          return { url: c.url, source: c.source, confidence: score === 'high' ? 'high' : 'low', slug_match: score === 'high' };
        });

      console.log(`Discover mode: ${candidates.length} candidates for ${url}`);
      return Response.json({ success: true, data: { candidates } });
    }

    // Commit mode: run the user's chosen URLs through fingerprint + width filter
    // (the 800px quality bar) + content dedup, then return the ones that pass.
    if (mode === 'commit') {
      const urls = Array.isArray(selected_urls) ? selected_urls.filter(u => typeof u === 'string' && u.startsWith('http')) : [];
      if (urls.length === 0) return Response.json({ error: 'No URLs selected' }, { status: 400 });

      const [logoUrlsResult] = await Promise.allSettled([
        fetchKnownLogoUrls(base44, partner_id || null, user.email),
      ]);
      const knownLogoUrls = logoUrlsResult.status === 'fulfilled' ? logoUrlsResult.value : [];

      const [photoFpResults, logoFpResults] = await Promise.all([
        Promise.allSettled(urls.map(buildFingerprint)),
        knownLogoUrls.length > 0 ? Promise.allSettled(knownLogoUrls.map(buildFingerprint)) : Promise.resolve([]),
      ]);
      const photoFingerprints = photoFpResults.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { url: urls[i], stem: filenameStem(urls[i]), sha256: null, aHash: null, width: null }
      );
      const widthFilteredFps = filterByWidth(photoFingerprints);
      const logoFingerprints = logoFpResults.filter(r => r.status === 'fulfilled').map(r => r.value);

      const seenSha = new Set();
      const contentDedupedFps = widthFilteredFps.filter(fp => {
        if (!fp.sha256) return true;
        if (seenSha.has(fp.sha256)) return false;
        seenSha.add(fp.sha256);
        return true;
      });
      const filteredFps = logoFingerprints.length > 0
        ? contentDedupedFps.filter(fp => !isLogoMatch(fp, logoFingerprints))
        : contentDedupedFps;

      const photoUrls = filteredFps.map(fp => fp.url);
      console.log(`Commit mode: ${urls.length} selected, ${photoUrls.length} passed width+dedup`);
      return Response.json({ success: true, data: { photo_urls: photoUrls, total_found: urls.length, kept: photoUrls.length } });
    }

    const sourceDomain = getSourceDomain(url);
    console.log(`Scraping: ${url} (source domain: ${sourceDomain})`);

    // Run all fetches in parallel: page HTML + Rezfusion + LMPM + partner logo lookup
    const [htmlResult, rezfusionResult, lmpmResult, logoUrlsResult] = await Promise.allSettled([
      fetchPageHtml(url, sourceDomain),
      fetchRezfusionPhotos(url, sourceDomain),
      fetchLmpmPhotos(url, sourceDomain),
      fetchKnownLogoUrls(base44, partner_id || null, user.email),
    ]);

    const { html = '', images: ogImages = [], location: htmlLocation = null } =
      htmlResult.status === 'fulfilled' ? htmlResult.value : {};
    const rezfusionPhotos = rezfusionResult.status === 'fulfilled' ? rezfusionResult.value : [];
    const { photos: lmpmPhotos, propertyData: lmpmData } =
      lmpmResult.status === 'fulfilled' ? lmpmResult.value : { photos: [], propertyData: null };
    const knownLogoUrls = logoUrlsResult.status === 'fulfilled' ? logoUrlsResult.value : [];

    console.log(`Known partner logo URLs: ${knownLogoUrls.length} — ${JSON.stringify(knownLogoUrls)}`);

    const htmlStats = html ? extractStatsFromHtml(html) : {};
    const rawSnippets = extractRawSnippets(html);

    // Gather candidate photos — prioritize API sources over HTML scraping
    const companyToken = deriveCompanyToken(sourceDomain);
    console.log(`Company token: "${companyToken}" (derived from ${sourceDomain})`);

    // Target slug and sibling detection for photo confidence scoring
    const targetSlug = extractPropertySlug(url);
    const siblingSlugs = html ? extractSiblingSlugs(html, targetSlug) : [];
    console.log(`Target slug: "${targetSlug}" | Sibling slugs found: ${siblingSlugs.length}${siblingSlugs.length > 0 ? ' ' + JSON.stringify(siblingSlugs.slice(0, 10)) : ''}`);

    // Gallery container extraction (highest priority signal)
    let galleryPhotos = [];
    let jsonLdPhotos = [];
    let extractionPath = 'fallback-html';
    if (html) {
      galleryPhotos = extractGalleryImages(html, sourceDomain, url);
      jsonLdPhotos = extractJsonLdImages(html, sourceDomain, url);
      console.log(`Gallery container extraction: ${galleryPhotos.length} images | JSON-LD images: ${jsonLdPhotos.length}`);
    }

    const allPhotos = new Set();
    lmpmPhotos.forEach(u => allPhotos.add(u));
    rezfusionPhotos.forEach(u => allPhotos.add(u));
    ogImages.forEach(u => allPhotos.add(u));
    galleryPhotos.forEach(u => allPhotos.add(u));
    jsonLdPhotos.forEach(u => allPhotos.add(u));

    // Always run generic HTML extraction to catch photos outside gallery
    // containers (inline description images, amenity photos, hero shots, etc.)
    if (html) {
      extractImagesFromHtml(html, sourceDomain, url).forEach(u => allPhotos.add(u));
    }

    if (galleryPhotos.length >= 3) {
      extractionPath = jsonLdPhotos.length > 0 ? 'gallery+jsonld+html' : 'gallery+html';
    } else if (jsonLdPhotos.length > 0) {
      extractionPath = 'jsonld+html';
    } else if (lmpmPhotos.length > 0) {
      extractionPath = 'lmpm';
    } else if (rezfusionPhotos.length > 0) {
      extractionPath = 'rezfusion';
    } else if (ogImages.length > 0 && galleryPhotos.length === 0) {
      extractionPath = 'og-only';
    } else {
      extractionPath = 'fallback-html';
    }
    console.log(`Extraction path: ${extractionPath}`);

    // Company-name filter: reject images whose filename contains the site's brand token
    // Catches e.g. SeaMountainVacations_Black-1-1024x627.png from any extraction path
    const companyFiltered = Array.from(allPhotos).filter(u => {
      if (isCompanyBrandedImage(u, companyToken)) {
        console.log(`Company-name filter removed: ${u}`);
        return false;
      }
      return true;
    });

    // Sibling property filter: reject images whose URL contains another listing's slug
    const siblingFiltered = companyFiltered.filter(u => {
      const score = scorePhotoByUrl(u, targetSlug, siblingSlugs);
      if (score === 'reject') {
        console.log(`Sibling-slug filter removed: ${u}`);
        return false;
      }
      return true;
    });
    console.log(`After sibling filter: ${siblingFiltered.length} (removed ${companyFiltered.length - siblingFiltered.length})`);

    // Step 1: URL-canonical dedup (collapses size-variant paths of the same file)
    const urlDedupedPhotos = deduplicateImages(siblingFiltered);
    console.log(`After URL dedup: ${urlDedupedPhotos.length} candidates`);

    // Step 2: Build fingerprints for all candidate photos + known logos in parallel
    const [photoFpResults, logoFpResults] = await Promise.all([
      Promise.allSettled(urlDedupedPhotos.map(buildFingerprint)),
      knownLogoUrls.length > 0
        ? Promise.allSettled(knownLogoUrls.map(buildFingerprint))
        : Promise.resolve([]),
    ]);

    const photoFingerprints = photoFpResults.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { url: urlDedupedPhotos[i], stem: filenameStem(urlDedupedPhotos[i]), sha256: null, aHash: null, width: null }
    );

    // Step 2b: Drop images narrower than 800px (thumbnails / icons / decorative
    // tiles). Unknown-width images are kept only as a fallback when no measured
    // image clears the floor (see filterByWidth).
    const widthFilteredFps = filterByWidth(photoFingerprints);
    console.log(`After width filter (>= ${MIN_PHOTO_WIDTH}px): ${widthFilteredFps.length} (removed ${photoFingerprints.length - widthFilteredFps.length})`);

    const logoFingerprints = logoFpResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    console.log(`Logo fingerprints built: ${logoFingerprints.length}`);
    logoFingerprints.forEach(lf => console.log(`  logo stem="${lf.stem}" sha256=${lf.sha256?.slice(0,8)} aHash=${lf.aHash?.slice(0,16)}`));

    // Step 3: Content-aware dedup by SHA-256 (same bytes at different URLs → keep first)
    const seenSha = new Set();
    const contentDedupedFps = widthFilteredFps.filter(fp => {
      if (!fp.sha256) return true; // can't compare — keep
      if (seenSha.has(fp.sha256)) {
        console.log(`Content-dedup removed: ${fp.url} (duplicate bytes)`);
        return false;
      }
      seenSha.add(fp.sha256);
      return true;
    });

    // Step 4: Filter against known partner logos (stem + SHA-256 + aHash)
    const filteredFps = logoFingerprints.length > 0
      ? contentDedupedFps.filter(fp => {
          const matched = isLogoMatch(fp, logoFingerprints);
          if (matched) console.log(`Logo-filter removed: ${fp.url} (stem="${fp.stem}" sha256=${fp.sha256?.slice(0,8)} aHash=${fp.aHash?.slice(0,16)})`);
          return !matched;
        })
      : contentDedupedFps;

    // Fallback: if all photos were filtered out, return empty (don't re-add logos)
    // Compute confidence per photo and sort: slug-matched (high) first, then low
    const photoData = filteredFps.map(fp => {
      const score = scorePhotoByUrl(fp.url, targetSlug, siblingSlugs);
      return { url: fp.url, confidence: score === 'high' ? 'high' : 'low', slug_match: score === 'high' };
    });
    photoData.sort((a, b) => {
      if (a.confidence === 'high' && b.confidence !== 'high') return -1;
      if (a.confidence !== 'high' && b.confidence === 'high') return 1;
      return 0;
    });
    const photoUrls = photoData.map(d => d.url);
    const photoConfidence = photoData.map(d => ({ url: d.url, confidence: d.confidence, slug_match: d.slug_match }));

    console.log(`Photos: lmpm=${lmpmPhotos.length} rezfusion=${rezfusionPhotos.length} og=${ogImages.length} gallery=${galleryPhotos.length} | path=${extractionPath} | urlDedup=${urlDedupedPhotos.length} contentDedup=${contentDedupedFps.length} logoFilter=${photoUrls.length} (high-confidence: ${photoConfidence.filter(c => c.confidence === 'high').length})`);
    console.log(`HTML location: ${JSON.stringify(htmlLocation)}`);
    console.log(`HTML stats: beds=${htmlStats.bedrooms} baths=${htmlStats.bathrooms} sleeps=${htmlStats.sleeps}`);

    const pageTextBundle = extractPageText(html);

    const knownLocation = htmlLocation
      ? [htmlLocation.city, htmlLocation.state, htmlLocation.country].filter(Boolean).join(', ')
      : null;

    const llmPhotos = photoUrls.slice(0, 5);

    const rawTextResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a luxury property data extractor for "The 100 Collection."

CRITICAL RULES — READ CAREFULLY:
1. Extract ONLY from the live listing page at the URL below, the page text provided below, and the attached photos. Do NOT invent or guess any details not present.
2. If you cannot find a field, return null for that field. NEVER fabricate location, stats, or features.
3. Location MUST come from explicit text on the page (e.g., "North Myrtle Beach, SC"). If not found, return null for all location fields.
4. For field_confidence: return "high" only if the value appears verbatim on the page or is clearly visible in photos, "medium" if inferred, "low" if guessed.
5. For description/headline/short_summary: write in a premium editorial voice, but base it ONLY on features actually mentioned on the page.
6. Fill in as many fields as possible. Even partial information is valuable. If a field has any text on the page that relates to it, extract it.

FETCH AND READ THIS LIVE LISTING PAGE: ${url}

${knownLocation ? `Location found in page metadata: ${knownLocation}` : 'Location: NOT FOUND in page metadata — check the live page.'}
${htmlStats.bedrooms ? `Bedrooms found in page HTML: ${htmlStats.bedrooms}` : ''}
${htmlStats.bathrooms ? `Bathrooms found in page HTML: ${htmlStats.bathrooms}` : ''}
${htmlStats.sleeps ? `Sleeps found in page HTML: ${htmlStats.sleeps}` : ''}

${pageTextBundle ? `=== PAGE CONTENT EXTRACTED FROM HTML ===\nThis includes meta tags, JSON-LD structured data, noscript fallbacks, and visible page text. Use this as your PRIMARY source. Cross-reference with the live page.\n\n${pageTextBundle}` : 'No page content could be extracted from the HTML (likely a fully JS-rendered site). Use the live page and attached photos as your sources.'}

${llmPhotos.length > 0 ? `${llmPhotos.length} property photos are attached for visual context. Use them to verify and fill in details like bedroom count, amenities, and design style.` : ''}

If you see any property photo image URLs (full https URLs ending in .jpg/.jpeg/.png/.webp from <img> tags) on the page, include up to 20 in the page_image_urls field. Skip logos, icons, and decorative images.`,
      model: 'gemini_3_flash',
      add_context_from_internet: true,
      file_urls: llmPhotos.length > 0 ? llmPhotos : undefined,
      response_json_schema: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          headline: { type: "string" },
          short_summary: { type: "string" },
          description: { type: "string" },
          property_type: { type: "string" },
          location_city: { type: "string" },
          location_state: { type: "string" },
          location_country: { type: "string" },
          location_full: { type: "string" },
          bedrooms: { type: "number" },
          bathrooms: { type: "number" },
          half_bathrooms: { type: "number" },
          sleeps: { type: "number" },
          amenities: { type: "array", items: { type: "string" } },
          design_style_notes: { type: "string" },
          unique_features: { type: "string" },
          best_fit_guest: { type: "string" },
          why_100_collection: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          page_image_urls: { type: "array", items: { type: "string" } },
          ai_fit_score: { type: "number" },
          field_confidence: { type: "object" },
        }
      }
    });

    const result = (rawTextResult?.properties && typeof rawTextResult.properties === 'object')
      ? rawTextResult.properties
      : (rawTextResult || {});

    if (htmlStats.bedrooms && (!result.bedrooms || result.bedrooms === 0)) result.bedrooms = htmlStats.bedrooms;
    if (htmlStats.bathrooms && (!result.bathrooms || result.bathrooms === 0)) result.bathrooms = htmlStats.bathrooms;
    if (htmlStats.sleeps && (!result.sleeps || result.sleeps === 0)) result.sleeps = htmlStats.sleeps;

    // Normalize property_type to the PropertySubmission enum so the form dropdown matches
    if (result.property_type) {
      const normalized = normalizePropertyType(result.property_type);
      if (normalized) result.property_type = normalized;
    }

    if (htmlLocation && !result.location_city && !result.location_full) {
      result.location_city = htmlLocation.city;
      result.location_state = htmlLocation.state;
      result.location_country = htmlLocation.country;
      result.location_full = [htmlLocation.city, htmlLocation.state, htmlLocation.country].filter(Boolean).join(', ');
      result.field_confidence = { ...(result.field_confidence || {}), location_full: 'medium', location_city: 'medium' };
    }

    if (!result.location_full && !result.location_city) {
      result.field_confidence = { ...(result.field_confidence || {}), location_full: 'low', location_city: 'low' };
    }

    // ── Merge LLM-extracted photo URLs (from the rendered page) with HTML/API photos ──
    // On JS-rendered sites where server-side HTML has 0 images, Gemini reads the rendered
    // page and returns the actual <img src> URLs it finds. We merge these through the same
    // filter/dedup pipeline as the HTML photos.
    // LLM-returned photos are from the rendered page and already vetted by Gemini
    // (instructed to skip logos/icons). Use a relaxed filter — check extension and
    // bad patterns but skip the strict domain check, since the images may be on
    // a CDN not in our allowlist (Cloudinary, Akamai, Scene7, etc.).
    const llmPagePhotos = Array.isArray(result.page_image_urls)
      ? result.page_image_urls
          .filter(u => typeof u === 'string' && u.startsWith('http'))
          .map(u => cleanImageUrl(u))
          .filter(u => {
            // LLM-returned photos are from the rendered page and already vetted
            // by Gemini (instructed to skip logos/icons). Use a relaxed filter —
            // check bad patterns + stock photos but skip the strict extension
            // and domain checks, since images may be on CDN transformation paths
            // that omit .jpg suffixes (Cloudinary f_auto, Akamai, Scene7, etc.).
            const lower = u.toLowerCase();
            if (lower.startsWith('data:')) return false;
            if (lower.includes('.svg')) return false;
            if (isVideoUrl(u)) return false;
            if (BAD_PATTERNS.some(k => lower.includes(k.toLowerCase()))) return false;
            if (STOCK_PHOTO_DOMAINS.some(d => lower.includes(d))) return false;
            return true;
          })
          .filter(u => !isCompanyBrandedImage(u, companyToken))
      : [];

    const existingPhotoSet = new Set(photoUrls);
    const llmCandidates = deduplicateImages(llmPagePhotos).filter(u => !existingPhotoSet.has(u));

    // Run LLM-returned photos through the same fingerprint + width filter so
    // small thumbnails/icons Gemini surfaces don't bypass the 800px floor.
    const llmFpResults = await Promise.allSettled(llmCandidates.map(buildFingerprint));
    const llmFps = llmFpResults.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { url: llmCandidates[i], stem: filenameStem(llmCandidates[i]), sha256: null, aHash: null, width: null }
    );
    const llmWidthOk = filterByWidth(llmFps);
    // Content dedup against the HTML/API photos already accepted
    const newLlmFps = llmWidthOk.filter(fp => {
      if (!fp.sha256) return true;
      if (seenSha.has(fp.sha256)) return false;
      seenSha.add(fp.sha256);
      return true;
    });
    const newLlmPhotos = newLlmFps.map(fp => fp.url);
    console.log(`LLM page_image_urls: ${llmPagePhotos.length} returned, ${llmCandidates.length} new candidates, ${newLlmPhotos.length} after width+dedup`);

    const newPhotoData = newLlmPhotos.map(u => {
      const score = scorePhotoByUrl(u, targetSlug, siblingSlugs);
      return { url: u, confidence: score === 'high' ? 'high' : 'low', slug_match: score === 'high' };
    });

    const mergedPhotoData = [...photoData, ...newPhotoData];
    mergedPhotoData.sort((a, b) => {
      if (a.confidence === 'high' && b.confidence !== 'high') return -1;
      if (a.confidence !== 'high' && b.confidence === 'high') return 1;
      return 0;
    });

    const mergedPhotoUrls = mergedPhotoData.map(d => d.url);
    const mergedPhotoConfidence = mergedPhotoData.map(d => ({ url: d.url, confidence: d.confidence, slug_match: d.slug_match }));

    // Clean up: remove the temporary LLM field so it doesn't leak into the submission
    delete result.page_image_urls;

    result.photo_urls = mergedPhotoUrls;
    result.photo_confidence = mergedPhotoConfidence;
    result.ai_imported = true;
    result.ai_editorial_done = true;

    result.scraped_raw_data = {
      html_location: htmlLocation,
      html_stats: htmlStats,
      raw_snippets: rawSnippets,
      photo_sources: {
        lmpm: lmpmPhotos.length,
        rezfusion: rezfusionPhotos.length,
        og: ogImages.length,
        gallery: galleryPhotos.length,
        llm_page_images: llmPagePhotos.length,
        llm_page_images_new: newLlmPhotos.length,
        known_logos: knownLogoUrls.length,
        logo_fingerprints_built: logoFingerprints.length,
      },
      photo_extraction_path: extractionPath,
      target_slug: targetSlug,
      sibling_slugs_count: siblingSlugs.length,
      lmpm_property_name: lmpmData?.friendly_name || lmpmData?.name || null,
    };

    console.log(`Result: name="${result.property_name}" location="${result.location_full}" photos=${mergedPhotoUrls.length} (html/api=${photoUrls.length} + llm=${newLlmPhotos.length})`);

    return Response.json({ success: true, data: result });
  } catch (error) {
    console.error(`scrapePropertyUrl error: ${error.message}`, error.stack);
    // Return 200 (not 500) so the frontend surfaces the real error message
    // instead of a generic "Request failed with status code 500".
    return Response.json({ error: `Scrape failed: ${error.message}` });
  }
});