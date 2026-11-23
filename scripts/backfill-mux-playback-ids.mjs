/**
 * Expand weak Sanity mux.video refs on cms.vrms into objects that include
 * playbackId (VRM-level video + showcase[].propvideo).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

const PROJECT = process.env.SANITY_PROJECT_ID || "b2yibrs1";
const DATASET = process.env.SANITY_DATASET || "production";
const API_VERSION = process.env.SANITY_API_VERSION || "2021-10-21";
const token =
  process.env.SANITY_API_READ_TOKEN ||
  process.env.SANITY_READ_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_TOKEN ||
  "";
const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!token) {
  console.error("SANITY_API_READ_TOKEN is required");
  process.exit(1);
}
if (!dbUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function sanityQuery(query) {
  const res = await fetch(
    `https://${PROJECT}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return data.result;
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function expandMuxVideo(video, playbackByRef) {
  if (!video || typeof video !== "object") return { video, changed: false };
  const asset = video.asset;
  if (!asset || typeof asset !== "object") return { video, changed: false };
  const ref = asset._ref || asset._id;
  const existing = asset.playbackId || asset.playback_id;
  if (existing) return { video, changed: false };
  const playbackId = ref ? playbackByRef.get(String(ref)) : null;
  if (!playbackId) return { video, changed: false };
  return {
    video: {
      ...video,
      asset: {
        ...asset,
        playbackId,
      },
    },
    changed: true,
  };
}

async function main() {
  console.log("Fetching Sanity Mux playback map…");
  const rows = await sanityQuery(`*[_type == "vrm"]{
    _id,
    "slug": slug.current,
    title,
    partner_name,
    video,
    "videoPlaybackId": video.asset->playbackId,
    "videoAssetId": video.asset->_id,
    showcase[]{
      _key,
      name,
      propvideo,
      "propPlaybackId": propvideo.asset->playbackId,
      "propAssetId": propvideo.asset->_id
    }
  }`);

  const playbackByRef = new Map();
  const playbackBySlug = new Map();
  let vrmVideoCount = 0;
  let showcaseVideoCount = 0;

  for (const row of rows || []) {
    if (row.videoAssetId && row.videoPlaybackId) {
      playbackByRef.set(String(row.videoAssetId), String(row.videoPlaybackId));
      vrmVideoCount += 1;
      if (row.slug) playbackBySlug.set(String(row.slug).toLowerCase(), String(row.videoPlaybackId));
    }
    for (const item of row.showcase || []) {
      if (item?.propAssetId && item?.propPlaybackId) {
        playbackByRef.set(String(item.propAssetId), String(item.propPlaybackId));
        showcaseVideoCount += 1;
      }
    }
  }

  console.log(
    `Sanity: ${vrmVideoCount} VRM videos, ${showcaseVideoCount} showcase propvideos, ${playbackByRef.size} unique assets`
  );

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Ensure dedicated column for destination-card playback
  await client.query(`
    ALTER TABLE cms.vrms
    ADD COLUMN IF NOT EXISTS mux_playback_id text
  `);

  const { rows: vrms } = await client.query(
    `SELECT id, slug, partner_name, video_json, showcase_json FROM cms.vrms`
  );

  let updated = 0;
  for (const vrm of vrms) {
    const videoJson = parseJson(vrm.video_json);
    const showcaseJson = parseJson(vrm.showcase_json);
    let changed = false;

    const expandedVideo = expandMuxVideo(videoJson, playbackByRef);
    let nextVideo = expandedVideo.video;
    if (expandedVideo.changed) changed = true;

    // If still missing, fill from Sanity slug map
    let nextShowcase = showcaseJson;
    if (Array.isArray(showcaseJson)) {
      nextShowcase = showcaseJson.map((item) => {
        if (!item || typeof item !== "object") return item;
        const expanded = expandMuxVideo(item.propvideo, playbackByRef);
        if (!expanded.changed) return item;
        changed = true;
        return { ...item, propvideo: expanded.video };
      });
    }

    const firstShowcasePlayback = Array.isArray(nextShowcase)
      ? nextShowcase
          .map((item) => item?.propvideo?.asset?.playbackId)
          .find((id) => typeof id === "string" && id.trim())
      : null;

    let muxPlaybackId =
      nextVideo?.asset?.playbackId ||
      nextVideo?.asset?.playback_id ||
      (vrm.slug ? playbackBySlug.get(String(vrm.slug).toLowerCase()) : null) ||
      firstShowcasePlayback ||
      null;

    // Keep a playable mux.video on the VRM for destination cards even when
    // Sanity only stored the clip on a showcase property.
    if (!nextVideo?.asset?.playbackId && muxPlaybackId) {
      nextVideo = {
        _type: "mux.video",
        asset: {
          ...(nextVideo?.asset || {}),
          playbackId: muxPlaybackId,
        },
      };
      changed = true;
    }

    if (!changed && !muxPlaybackId) continue;

    await client.query(
      `UPDATE cms.vrms
       SET video_json = $2::jsonb,
           showcase_json = $3::jsonb,
           mux_playback_id = $4,
           updated_at = now(),
           synced_at = now()
       WHERE id = $1`,
      [
        vrm.id,
        nextVideo == null ? null : JSON.stringify(nextVideo),
        nextShowcase == null ? null : JSON.stringify(nextShowcase),
        muxPlaybackId,
      ]
    );
    updated += 1;
    console.log(
      `updated ${vrm.slug || vrm.partner_name || vrm.id}` +
        (muxPlaybackId ? ` → ${muxPlaybackId}` : " (showcase propvideos only)")
    );
  }

  const { rows: check } = await client.query(
    `SELECT count(*)::int AS with_playback
     FROM cms.vrms
     WHERE mux_playback_id IS NOT NULL
        OR video_json::text ILIKE '%playbackId%'`
  );
  console.log(`Done. Updated ${updated} rows. VRMs with playbackId now: ${check[0].with_playback}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
