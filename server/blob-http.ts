import { json, readBody, readBuffer } from "./neon-db.ts";
import { requireSession } from "./require-session.ts";
import { blobConfigured, ingestRemoteImages, putImageBuffer } from "./blob.ts";

export async function handleBlobUpload(req: any, res: any) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    const gate = await requireSession(req);
    if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });
    if (!blobConfigured()) return json(res, 503, { error: "Vercel Blob is not configured" });

    const filename = String(req.headers["x-filename"] || "image.jpg");
    const contentType = String(req.headers["content-type"] || "application/octet-stream");
    const buffer = await readBuffer(req);
    const url = await putImageBuffer(buffer, { filename, contentType });
    return json(res, 200, { url });
  } catch (error: any) {
    console.error("[blob-upload]", error);
    return json(res, 500, { error: error.message || "Upload failed" });
  }
}

export async function handleImageIngest(req: any, res: any) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    const gate = await requireSession(req);
    if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const urls = Array.isArray(body.urls) ? body.urls : [];
    const ingested = await ingestRemoteImages(urls.map(String));
    return json(res, 200, { urls: ingested });
  } catch (error: any) {
    console.error("[image-ingest]", error);
    return json(res, 500, { error: error.message || "Ingest failed" });
  }
}
