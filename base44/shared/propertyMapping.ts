/**
 * Shared mapping from PropertySubmission → Property fields.
 * Used by approvePropertySubmission and reconcilePropertySubmissions backend
 * functions so the two publish paths stay in sync.
 */

const VALID_PROPERTY_TYPES = ["villa", "apartment", "house", "condo", "estate", "cabin", "other"];

export function mapPropertyType(submissionType) {
  if (!submissionType) return "other";
  const lower = String(submissionType).toLowerCase();
  return VALID_PROPERTY_TYPES.includes(lower) ? lower : "other";
}

/**
 * Builds a Property data object from a PropertySubmission.
 * @param {object} s - The PropertySubmission record
 * @param {object} [opts]
 * @param {string} [opts.source="approval"] - "approval" or "reconciliation" (affects internal_notes prefix)
 */
export function buildPropertyData(s, { source = "approval" } = {}) {
  const now = new Date().toISOString();
  const prefix = source === "reconciliation" ? "Auto-reconciled" : "Auto-created";
  return {
    property_name: s.property_name,
    partner_id: s.partner_id || null,
    partner_name: s.partner_name || null,
    listing_url: s.listing_url || null,
    vrm_url: s.listing_url || null,
    property_type: mapPropertyType(s.property_type),
    bedrooms: s.bedrooms ?? null,
    bathrooms: s.bathrooms ?? null,
    half_bathrooms: s.half_bathrooms ?? null,
    sleeps: s.sleeps ?? null,
    address: s.location_full || null,
    market: s.market || null,
    location_city: s.location_city || null,
    location_state: s.location_state || null,
    location_country: s.location_country || null,
    location_full: s.location_full || null,
    short_summary: s.short_summary || null,
    excerpt: s.short_summary || null,
    description: s.description || null,
    text: s.description || null,
    headline: s.headline || null,
    unique_features: s.unique_features || null,
    unique_feature: s.unique_features || null,
    why_100_collection: s.why_100_collection || null,
    best_fit_guest: s.best_fit_guest || null,
    design_style_notes: s.design_style_notes || null,
    amenities: Array.isArray(s.amenities) ? s.amenities : [],
    tags: Array.isArray(s.tags) ? s.tags : [],
    photo_urls: Array.isArray(s.photo_urls) ? s.photo_urls : [],
    status: "active",
    onboarding_status: "complete",
    photography_status: "approved",
    portal_visible: true,
    internal_notes: `${prefix} from PropertySubmission ${s.id} on ${now}. Submission approved by ${s.reviewed_by || "—"} on ${s.approved_date || "—"}.`,
  };
}

/**
 * Builds a PARTIAL update patch for an existing Property from an EDIT
 * PropertySubmission. Only includes fields the submission actually provides
 * (non-null), so untouched fields on the Property are preserved. `amenities`
 * and `photo_urls` are always included (even as empty arrays) so partners can
 * add/remove images and amenities through the review flow.
 *
 * Unlike buildPropertyData, this does NOT touch lifecycle fields (status,
 * onboarding_status, portal_visible) — the property keeps its current state.
 */
export function buildPropertyEditPatch(s) {
  const patch = {};
  if (s.property_name) patch.property_name = s.property_name;
  if (s.property_type) patch.property_type = mapPropertyType(s.property_type);
  if (s.bedrooms != null) patch.bedrooms = s.bedrooms;
  if (s.bathrooms != null) patch.bathrooms = s.bathrooms;
  if (s.half_bathrooms != null) patch.half_bathrooms = s.half_bathrooms;
  if (s.sleeps != null) patch.sleeps = s.sleeps;
  if (s.market) patch.market = s.market;
  if (s.location_full) { patch.address = s.location_full; patch.location_full = s.location_full; }
  if (s.location_city) patch.location_city = s.location_city;
  if (s.location_state) patch.location_state = s.location_state;
  if (s.location_country) patch.location_country = s.location_country;
  if (s.short_summary) { patch.short_summary = s.short_summary; patch.excerpt = s.short_summary; }
  if (s.description) { patch.description = s.description; patch.text = s.description; }
  if (s.headline) patch.headline = s.headline;
  if (s.unique_features) { patch.unique_features = s.unique_features; patch.unique_feature = s.unique_features; }
  if (s.why_100_collection) patch.why_100_collection = s.why_100_collection;
  if (s.best_fit_guest) patch.best_fit_guest = s.best_fit_guest;
  if (s.design_style_notes) patch.design_style_notes = s.design_style_notes;
  if (s.listing_url) { patch.listing_url = s.listing_url; patch.vrm_url = s.listing_url; }
  // Always include amenities + photo_urls so partners can add/remove through review
  patch.amenities = Array.isArray(s.amenities) ? s.amenities : [];
  patch.photo_urls = Array.isArray(s.photo_urls) ? s.photo_urls : [];
  return patch;
}