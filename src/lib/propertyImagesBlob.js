import { compressImage } from "@/lib/imageCompression";

/**
 * New property / partner photos go to Vercel Blob. Existing Sanity / Supabase /
 * Base44 / Blob URLs are left in place and still served as-is.
 *
 * Always compresses first — Vercel serverless rejects request bodies over ~4.5MB,
 * and phone headshots regularly exceed that.
 */
export async function uploadPropertyImage(file, { folder } = {}) {
  if (!file) throw new Error("No file selected");

  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (type.includes("heic") || type.includes("heif") || /\.heic$|\.heif$/.test(name)) {
    throw new Error("HEIC/HEIF photos aren’t supported here. Export as JPG or PNG and try again.");
  }
  if (type && !type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPG, PNG, or WebP).");
  }

  const optimized = await compressImage(file);
  // Hard safety net under Vercel’s serverless body limit even if compression is skipped/failed.
  if (optimized.size > 4.2 * 1024 * 1024) {
    throw new Error(
      `Image is still too large (${(optimized.size / (1024 * 1024)).toFixed(1)} MB). Try a smaller JPG under 4 MB.`
    );
  }

  const headers = {
    "Content-Type": optimized.type || file.type || "application/octet-stream",
    "X-Filename": optimized.name || file.name || "image.jpg",
  };
  if (folder) headers["X-Blob-Folder"] = folder;

  const res = await fetch("/api/blob/upload", {
    method: "POST",
    credentials: "include",
    headers,
    body: optimized,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(data.error || "Sign in required to upload. Refresh the page and try again.");
    }
    if (res.status === 413) {
      throw new Error("Image is too large for upload. Try a smaller JPG under 4 MB.");
    }
    throw new Error(data.error || data.message || `Upload failed (${res.status})`);
  }
  if (!data.url) throw new Error("Upload returned no URL");
  return data.url;
}

/**
 * @param {string[]} urls
 * @param {{ existingUrls?: string[] }} [opts] Existing gallery URLs for content-dedup
 */
export async function ingestPropertyImages(urls, opts = {}) {
  const list = (urls || []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!list.length) return [];
  const existingUrls = (opts.existingUrls || [])
    .map((u) => String(u || "").trim())
    .filter(Boolean);
  const res = await fetch("/api/images/ingest", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: list, existing_urls: existingUrls }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ingest failed");
  return Array.isArray(data.urls) ? data.urls : list;
}
