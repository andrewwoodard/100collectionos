/**
 * Shared helper to call the supabaseData backend function.
 * Usage: supabaseQuery({ table: 'partners', action: 'list', filters: { status: 'live' } })
 */
import { base44 } from "@/api/base44Client";

export async function supabaseQuery(payload) {
  const res = await base44.functions.invoke("supabaseData", payload);
  return res.data;
}

const SUPABASE_STORAGE_BASE = "https://fzofopsjpstovgboiyfa.supabase.co/storage/v1/object/public/images/";

/**
 * Normalize a Supabase storage image reference to a loadable URL under
 * /storage/v1/object/public/images/. Handles full URLs with a stale storage
 * project host, full URLs missing the /images/ segment, and bare filenames.
 */
export function normalizeStorageUrl(url) {
  if (!url || typeof url !== "string") return null;
  const m = url.match(/storage\/v1\/object\/public\/(.+)$/);
  if (m) {
    const path = m[1];
    const withImages = path.startsWith("images/") ? path.slice("images/".length) : path;
    return `${SUPABASE_STORAGE_BASE}${withImages}`;
  }
  if (!/^https?:\/\//.test(url) && !url.includes("/")) return `${SUPABASE_STORAGE_BASE}${url}`;
  return url;
}

/**
 * Returns the display URL for an image_metadata row.
 * Prefers storage_path (Supabase storage) over original_url.
 */
export function imageUrlFromMetadata(img) {
  if (!img) return null;
  if (img.storage_path) return SUPABASE_STORAGE_BASE + img.storage_path;
  return img.original_url || null;
}

// Convenience wrappers
export const sb = {
  list: (table, filters, search, limit) => supabaseQuery({ table, action: "list", filters, search, limit }),
  get: (table, id) => supabaseQuery({ table, action: "get", id }),
  create: (table, data) => supabaseQuery({ table, action: "create", data }),
  update: (table, id, data) => supabaseQuery({ table, action: "update", id, data }),
  delete: (table, id) => supabaseQuery({ table, action: "delete", id }),
  bulkCreate: (table, data) => supabaseQuery({ table, action: "bulk_create", data }),
};