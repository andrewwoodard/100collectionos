import { getNeonPool } from "./neon-db.js";
import { hasRemoteSupabase, supabaseRest } from "./supabase-remote.js";

function parseShowcase(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function propertyMatchesShowcaseItem(item: any, propertyName: string, listingUrl?: string) {
  const name = String(propertyName || "").trim().toLowerCase();
  const itemName = String(item?.name || "").trim().toLowerCase();
  if (name && itemName === name) return true;
  const link = String(item?.propertyLink || "").replace(/\/+$/, "").toLowerCase();
  const url = String(listingUrl || "").replace(/\/+$/, "").toLowerCase();
  if (url && link && (link === url || link.includes(url) || url.includes(link))) return true;
  const slug = String(item?.slug?.current || item?.slug || "").toLowerCase();
  const wantSlug = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (wantSlug && slug === wantSlug) return true;
  return false;
}

async function patchRemoteVrmShowcase(vrmId: string | number, showcase: any[]) {
  if (!hasRemoteSupabase()) return;
  await supabaseRest(`vrms?id=eq.${encodeURIComponent(String(vrmId))}`, {
    method: "PATCH",
    body: JSON.stringify({ showcase_json: showcase }),
  });
}

async function unsetSanityShowcaseItem(sanityId: string, keys: string[]) {
  const token =
    process.env.SANITY_WRITE_TOKEN ||
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_TOKEN ||
    "";
  const project = process.env.SANITY_PROJECT_ID || "b2yibrs1";
  const dataset = process.env.SANITY_DATASET || "production";
  if (!token || !sanityId || !keys.length) {
    return { skipped: true as const, reason: !token ? "no_token" : "nothing_to_unset" };
  }
  const mutations = keys.map((key) => ({
    patch: {
      id: sanityId,
      unset: [`showcase[_key=="${key}"]`],
    },
  }));
  const res = await fetch(
    `https://${project}.api.sanity.io/v2021-10-21/data/mutate/${dataset}?returnIds=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mutations }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[showcase-visibility] Sanity mutate failed", res.status, data?.message || data);
    return { skipped: true as const, reason: "sanity_mutate_failed", error: data?.message || String(res.status) };
  }
  return { skipped: false as const, unset: keys.length };
}

/**
 * When a property leaves active, remove it from the partner VRM showcase
 * (Neon + classic Supabase). Also tries Sanity when a write token is configured.
 */
export async function removePropertyFromPartnerShowcase(opts: {
  partnerName?: string | null;
  propertyName?: string | null;
  listingUrl?: string | null;
}) {
  const partnerName = String(opts.partnerName || "").trim();
  const propertyName = String(opts.propertyName || "").trim();
  const listingUrl = String(opts.listingUrl || "").trim();
  if (!partnerName || (!propertyName && !listingUrl)) {
    return { ok: false, reason: "missing_identity" };
  }

  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, sanity_id, showcase_json
     FROM supabase.vrms
     WHERE partner_name = $1 OR name = $1 OR title = $1
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [partnerName]
  );
  const vrm = rows[0];
  if (!vrm) return { ok: false, reason: "vrm_not_found" };

  const showcase = parseShowcase(vrm.showcase_json);
  const keep: any[] = [];
  const removedKeys: string[] = [];
  for (const item of showcase) {
    if (propertyMatchesShowcaseItem(item, propertyName, listingUrl)) {
      if (item?._key) removedKeys.push(String(item._key));
      continue;
    }
    keep.push(item);
  }

  if (removedKeys.length === 0 && keep.length === showcase.length) {
    return { ok: true, removed: 0, reason: "not_in_showcase" };
  }

  await pool.query(
    `UPDATE supabase.vrms SET showcase_json = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(keep), vrm.id]
  );
  try {
    await patchRemoteVrmShowcase(vrm.id, keep);
  } catch (error: any) {
    console.warn("[showcase-visibility] remote vrms patch failed:", error?.message || error);
  }

  const sanity = vrm.sanity_id
    ? await unsetSanityShowcaseItem(String(vrm.sanity_id), removedKeys)
    : { skipped: true as const, reason: "no_sanity_id" };

  return {
    ok: true,
    removed: removedKeys.length,
    remaining: keep.length,
    sanity,
  };
}
