import { createClient } from 'npm:@supabase/supabase-js@2';

// ── Supabase client ──────────────────────────────────────────────
export function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
}

// ── Image URL normalization ─────────────────────────────────────
export const SUPABASE_STORAGE_BASE = 'https://fzofopsjpstovgboiyfa.supabase.co/storage/v1/object/public/images/';
const CORRECT_STORAGE_HOST = 'https://fzofopsjpstovgboiyfa.supabase.co';

// Rewrite Supabase storage URLs to use the correct storage project host.
export function normalizeImageUrl(url) {
  if (typeof url !== 'string') return url;
  if (url.includes('.supabase.co/storage/v1/object/public/')) {
    const pathMatch = url.match(/\/storage\/v1\/object\/public\/(.+)$/);
    if (pathMatch) {
      return `${CORRECT_STORAGE_HOST}/storage/v1/object/public/${pathMatch[1]}`;
    }
  }
  if (!/^https?:\/\//.test(url) && !url.includes('/')) return `${SUPABASE_STORAGE_BASE}${url}`;
  return url;
}

// Parse the images column (JSON string of URL arrays) into a real array,
// normalizing Supabase storage URLs and dropping external duplicates when
// Supabase storage URLs are present.
export function parseImages(raw) {
  if (!raw) return [];
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      arr = parsed;
    } catch {
      return [];
    }
  }
  // Normalize URLs and deduplicate by normalized form (first occurrence wins).
  // We no longer drop non-Supabase URLs when Supabase URLs are present — that
  // stripped out newly uploaded images (Base44 storage URLs) from the array.
  const seen = new Set();
  const result = [];
  for (const url of arr) {
    if (!url) continue;
    const normalizedUrl = normalizeImageUrl(url);
    const key = normForDedup(normalizedUrl);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalizedUrl);
    }
  }
  return result;
}

// Convert an image_metadata row to a display URL (prefers storage_path over original_url).
export function imageUrlFromMetadata(img) {
  if (!img) return null;
  if (img.storage_path) return SUPABASE_STORAGE_BASE + img.storage_path;
  return img.original_url || null;
}

// Normalize a URL for dedup: normalize storage host, strip query params / trailing slash / fragments.
export function normForDedup(url) {
  const normalized = normalizeImageUrl(url) || url;
  return String(normalized).replace(/\/+$/, '').split('?')[0].split('#')[0];
}

// Strip trailing slashes, query params, and fragments from a URL (for exact-match lookups).
export function normalizeUrl(url) {
  if (!url) return url;
  return String(url).replace(/\/+$/, '').split('?')[0].split('#')[0];
}

// Fetch image_metadata rows for a property URL, mirroring the imageMetadata function's
// lookup logic (exact + normalized + prefix match on property_url and proppage).
export async function fetchMetadataImages(supabase, propertyUrl) {
  const normalized = normalizeUrl(propertyUrl);
  const normOf = (u) => normalizeUrl(u) || '';

  const [r1, r2, r3, r4] = await Promise.all([
    supabase.from('image_metadata').select('*').eq('property_url', normalized).order('id', { ascending: true }),
    supabase.from('image_metadata').select('*').eq('proppage', normalized).order('id', { ascending: true }),
    supabase.from('image_metadata').select('*').ilike('property_url', normalized + '%').order('id', { ascending: true }).limit(200),
    supabase.from('image_metadata').select('*').ilike('proppage', normalized + '%').order('id', { ascending: true }).limit(200),
  ]);

  const seen = new Set();
  const images = [];
  for (const row of [...(r1.data || []), ...(r2.data || []), ...(r3.data || []), ...(r4.data || [])]) {
    if (seen.has(row.id)) continue;
    const matches = normOf(row.property_url) === normalized || normOf(row.proppage) === normalized;
    if (matches) { seen.add(row.id); images.push(row); }
  }
  return images;
}