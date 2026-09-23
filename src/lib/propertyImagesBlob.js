/**
 * New property photos go to Vercel Blob. Existing Sanity / Supabase /
 * Base44 / Blob URLs are left in place and still served as-is.
 */
export async function uploadPropertyImage(file) {
  const res = await fetch("/api/blob/upload", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Filename": file.name || "image.jpg",
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

export async function ingestPropertyImages(urls) {
  const list = (urls || []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!list.length) return [];
  const res = await fetch("/api/images/ingest", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: list }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ingest failed");
  return Array.isArray(data.urls) ? data.urls : list;
}
