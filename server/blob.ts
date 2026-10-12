import { createHash } from "node:crypto";
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

function sniffImageType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 6) {
    const gif = buffer.toString("ascii", 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return "";
}

function sha256Hex(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const source = String(url || "").trim();
  if (!source) return null;
  try {
    const res = await fetch(source, {
      headers: {
        "User-Agent": "100CollectionImageIngest/1.0",
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    const headerType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const contentType = headerType.startsWith("image/") ? headerType : sniffImageType(buffer);
    if (!contentType.startsWith("image/")) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

async function hashImageUrl(url: string): Promise<string | null> {
  const fetched = await fetchImageBuffer(url);
  return fetched ? sha256Hex(fetched.buffer) : null;
}

export async function ingestRemoteImage(url: string) {
  const source = String(url || "").trim();
  if (!source) return source;
  if (isAlreadyHosted(source) || !blobConfigured()) return source;
  try {
    const fetched = await fetchImageBuffer(source);
    if (!fetched) return source;
    return await putImageBuffer(fetched.buffer, {
      filename: source,
      contentType: fetched.contentType,
    });
  } catch (error) {
    console.warn("[blob] ingest failed, keeping original URL", source, (error as Error).message);
    return source;
  }
}

export type IngestRemoteImagesOptions = {
  /** Gallery URLs already on the property — skip re-uploading matching bytes. */
  existingUrls?: string[];
};

/**
 * Ingest remote images into Vercel Blob.
 * Content-dedupes against `existingUrls` and within the batch so AI photo pulls
 * don't append the same listing photos as new blob URLs on every run.
 */
export async function ingestRemoteImages(
  urls: string[],
  opts: IngestRemoteImagesOptions = {}
) {
  const list = (urls || []).map((u) => String(u || "").trim()).filter(Boolean);
  const existingList = (opts.existingUrls || [])
    .map((u) => String(u || "").trim())
    .filter(Boolean);

  const knownHashes = new Set<string>();
  const existingExact = new Set(existingList);

  for (let i = 0; i < existingList.length; i += CONCURRENCY) {
    const batch = existingList.slice(i, i + CONCURRENCY);
    const hashes = await Promise.all(batch.map((url) => hashImageUrl(url)));
    for (const hash of hashes) {
      if (hash) knownHashes.add(hash);
    }
  }

  const out: string[] = [];
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const mapped = await Promise.all(
      batch.map(async (source) => {
        if (existingExact.has(source)) return null;

        // Already on our CDN / partner hosts: only keep if not already listed.
        if (isAlreadyHosted(source) || !blobConfigured()) {
          const hash = await hashImageUrl(source);
          if (hash) {
            if (knownHashes.has(hash)) return null;
            knownHashes.add(hash);
          }
          return source;
        }

        const fetched = await fetchImageBuffer(source);
        if (!fetched) return source;
        const hash = sha256Hex(fetched.buffer);
        if (knownHashes.has(hash)) return null;
        knownHashes.add(hash);
        try {
          return await putImageBuffer(fetched.buffer, {
            filename: source,
            contentType: fetched.contentType,
          });
        } catch (error) {
          console.warn("[blob] ingest failed, keeping original URL", source, (error as Error).message);
          return source;
        }
      })
    );
    for (const url of mapped) {
      if (url) out.push(url);
    }
  }
  return out;
}

/** Keep first URL for each unique image payload (SHA-256). */
export async function dedupeUrlsByContent(urls: string[]) {
  const list = (urls || []).map((u) => String(u || "").trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const hashes = await Promise.all(batch.map((url) => hashImageUrl(url)));
    for (let j = 0; j < batch.length; j++) {
      const url = batch[j];
      const hash = hashes[j];
      if (hash) {
        if (seen.has(hash)) continue;
        seen.add(hash);
        out.push(url);
      } else if (!seen.has(`url:${url}`)) {
        seen.add(`url:${url}`);
        out.push(url);
      }
    }
  }
  return out;
}
