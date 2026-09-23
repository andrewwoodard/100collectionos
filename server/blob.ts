import { put } from "@vercel/blob";

const MAX_BYTES = 15 * 1024 * 1024;
const CONCURRENCY = 4;

const HOSTED_HINTS = [
  "blob.vercel-storage.com",
  "supabase.co/storage",
  "cdn.sanity.io",
  "media.base44.com",
  "base44.app",
  "base44.com",
];

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function isAlreadyHosted(url: string) {
  const value = String(url || "").toLowerCase();
  return HOSTED_HINTS.some((hint) => value.includes(hint));
}

export function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function extensionFrom(nameOrUrl: string, contentType?: string | null) {
  if (contentType && EXT_BY_TYPE[contentType.split(";")[0].trim()]) {
    return EXT_BY_TYPE[contentType.split(";")[0].trim()];
  }
  const match = String(nameOrUrl || "").match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  if (match) return match[1].toLowerCase();
  return "jpg";
}

export async function putImageBuffer(
  buffer: Buffer,
  {
    filename = "image.jpg",
    contentType = "image/jpeg",
  }: { filename?: string; contentType?: string } = {}
) {
  if (!blobConfigured()) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  if (!buffer?.length) throw new Error("Empty image");
  if (buffer.length > MAX_BYTES) throw new Error("Image is larger than 15MB");
  const ext = extensionFrom(filename, contentType);
  const pathname = `properties/${Date.now()}-${Math.random().toString(16).slice(2, 10)}.${ext}`;
  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    contentType: contentType || "image/jpeg",
  });
  return blob.url;
}

export async function ingestRemoteImage(url: string) {
  const source = String(url || "").trim();
  if (!source) return source;
  if (isAlreadyHosted(source) || !blobConfigured()) return source;
  try {
    const res = await fetch(source, {
      headers: {
        "User-Agent": "100CollectionImageIngest/1.0",
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return source;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return source;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await putImageBuffer(buffer, { filename: source, contentType });
  } catch (error) {
    console.warn("[blob] ingest failed, keeping original URL", source, (error as Error).message);
    return source;
  }
}

export async function ingestRemoteImages(urls: string[]) {
  const list = (urls || []).map((u) => String(u || "").trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const mapped = await Promise.all(batch.map((url) => ingestRemoteImage(url)));
    out.push(...mapped);
  }
  return out;
}
