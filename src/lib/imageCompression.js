import imageCompression from "browser-image-compression";

const DEFAULTS = {
  maxSizeMB: 2,
  maxWidthOrHeight: 4000,
  initialQuality: 0.85,
};

// Cached config read from AppConfig so settings can be tuned without redeploying.
let _configPromise = null;
function getConfig() {
  if (_configPromise) return _configPromise;
  _configPromise = (async () => {
    try {
      const { base44 } = await import("@/api/base44Client");
      const rows = await base44.entities.AppConfig.filter({
        key: { $in: ["IMAGE_COMPRESSION_ENABLED", "IMAGE_MAX_SIZE_MB", "IMAGE_MAX_WIDTH"] },
      });
      const map = {};
      (rows || []).forEach((r) => { if (r.value != null) map[r.key] = r.value; });
      return {
        enabled: map.IMAGE_COMPRESSION_ENABLED !== "false",
        maxSizeMB: parseFloat(map.IMAGE_MAX_SIZE_MB) || DEFAULTS.maxSizeMB,
        maxWidthOrHeight: parseInt(map.IMAGE_MAX_WIDTH) || DEFAULTS.maxWidthOrHeight,
      };
    } catch {
      return { enabled: true, ...DEFAULTS };
    }
  })();
  return _configPromise;
}

/**
 * Compress an image file client-side before upload.
 * - Non-image files are returned unchanged.
 * - Files under 2MB are returned unchanged (no need to recompress).
 * - Files over 10MB get more aggressive settings.
 * - Returns a File with the original filename preserved.
 */
export async function compressImage(file, options = {}) {
  if (!file?.type || !file.type.startsWith("image/")) return file;

  const config = await getConfig();
  if (!config.enabled) return file;

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB < 2) return file;

  const isLarge = sizeMB > 10;
  const settings = {
    maxSizeMB: isLarge ? 3 : config.maxSizeMB,
    maxWidthOrHeight: config.maxWidthOrHeight,
    useWebWorker: true,
    initialQuality: DEFAULTS.initialQuality,
    fileType: file.type,
    ...options,
  };

  try {
    const compressed = await imageCompression(file, settings);
    const compressedMB = compressed.size / (1024 * 1024);
    const reduction = Math.round((1 - compressed.size / file.size) * 100);
    console.log(
      `[compress] Reduced ${sizeMB.toFixed(1)}MB → ${compressedMB.toFixed(1)}MB (${reduction}% reduction)`
    );
    return new File([compressed], file.name, { type: file.type });
  } catch (err) {
    console.warn("[compress] Compression failed, uploading original:", err?.message);
    return file;
  }
}

export function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}