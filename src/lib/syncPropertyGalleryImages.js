import { base44 } from "@/api/base44Client";

/**
 * Keep Property.photo_urls and propertiesbase44.images in sync.
 * Creates/links the public Supabase row when supabase_property_id is missing.
 * Prefer durable blob URLs in `images` (from /api/blob/upload or ingest).
 */

export function normalizeGalleryUrls(images) {
  if (!Array.isArray(images)) return [];
  const seen = new Set();
  const out = [];
  for (const item of images) {
    const url = String(item || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function validSbId(id) {
  if (id == null) return null;
  const s = String(id).trim();
  if (!s || s === "null" || s === "undefined") return null;
  return s;
}

/**
 * @param {object} opts
 * @param {string} [opts.propertyId] Base44 Property id
 * @param {string} [opts.supabasePropertyId] propertiesbase44 id / row_id
 * @param {string[]} opts.images Final ordered URL list
 * @param {object} [opts.seed] Fields used when creating a missing Supabase row
 * @param {string} [opts.listingUrl] Fallback lookup / seed listing URL
 * @returns {Promise<{ supabasePropertyId: string|null, images: string[], property: object|null }>}
 */
export async function syncPropertyGalleryImages({
  propertyId,
  supabasePropertyId,
  images,
  seed = {},
  listingUrl,
} = {}) {
  const urls = normalizeGalleryUrls(images);
  let sbId = validSbId(supabasePropertyId);

  const imagePayload = {
    images: urls,
    vrm_images: urls,
    property_image: urls[0] || null,
    photo_count: String(urls.length),
  };

  let propertyRow = null;

  if (sbId) {
    const res = await base44.functions.invoke("supabaseProperties", {
      action: "update",
      id: sbId,
      data: imagePayload,
    });
    if (res.data?.error) throw new Error(res.data.error);
    propertyRow = res.data?.property || null;
  } else {
    // Try resolve an existing public row by listing URL before creating.
    const lookup = listingUrl || seed.listing_url || seed.vrm_url || seed.url;
    if (lookup) {
      try {
        const found = await base44.functions.invoke("supabaseProperties", {
          action: "get_by_url",
          url: lookup,
        });
        const existing = found.data?.property;
        if (existing?.id) {
          sbId = String(existing.id);
          const res = await base44.functions.invoke("supabaseProperties", {
            action: "update",
            id: sbId,
            data: imagePayload,
          });
          if (res.data?.error) throw new Error(res.data.error);
          propertyRow = res.data?.property || null;
        }
      } catch {
        // fall through to create
      }
    }

    if (!sbId) {
      const createData = {
        property_name: seed.property_name || seed.name,
        market: seed.market || seed.destination,
        listing_url: lookup || null,
        address: seed.address || seed.location_full || null,
        bedrooms: seed.bedrooms ?? null,
        bathrooms: seed.bathrooms ?? null,
        sleeps: seed.sleeps ?? seed.occupancy ?? null,
        property_type: seed.property_type || seed.house_type || null,
        status: seed.status || "active",
        partner_name: seed.partner_name || null,
        partner_id: seed.partner_id || null,
        portal_visible: seed.portal_visible ?? true,
        onboarding_status: seed.onboarding_status || "complete",
        photography_status: seed.photography_status || "approved",
        excerpt: seed.excerpt || seed.short_summary || null,
        text: seed.text || seed.description || null,
        unique_feature: seed.unique_feature || seed.unique_features || null,
        internal_notes: seed.internal_notes || null,
        photo_urls: urls,
        ...imagePayload,
      };
      const res = await base44.functions.invoke("supabaseProperties", {
        action: "create",
        data: createData,
      });
      if (res.data?.error) throw new Error(res.data.error);
      propertyRow = res.data?.property || null;
      sbId = propertyRow?.id != null ? String(propertyRow.id) : null;
    }
  }

  // Mirror onto Base44 Property so portal gallery + public images stay aligned.
  if (propertyId) {
    const patch = { photo_urls: urls };
    if (sbId) patch.supabase_property_id = String(sbId);
    await base44.entities.Property.update(propertyId, patch);
  }

  return {
    supabasePropertyId: sbId,
    images: urls,
    property: propertyRow,
  };
}
