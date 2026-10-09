import { getNeonPool, json, newId, quoteIdent } from "./neon-db.js";
import { requireSession } from "./require-session.js";
import { hasRemoteSupabase, supabaseRest } from "./supabase-remote.js";

// Neon `supabase.propertiesbase44` stores these as jsonb (not plain text).
const JSON_FIELDS = new Set([
  "images",
  "vrm_images",
  "prop_categories",
  "categories",
  "tags",
  "reviews",
  "propdescription",
]);

function slugify(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Bind value for a jsonb column — plain prose must be JSON-encoded. */
function toJsonbParam(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

/** Public path slug from the property name (keeps inventory codes like SNH313). */
function publicPropertySlug(name: unknown) {
  return slugify(name);
}

function asString(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function asPhotos(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const url = asString(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function loadProperty(propertyId: string) {
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.property WHERE id = $1 OR data->>'id' = $1 LIMIT 1`,
    [propertyId]
  );
  if (!rows[0]) return null;
  const data = rows[0].data && typeof rows[0].data === "object" ? rows[0].data : {};
  return { ...data, id: rows[0].id };
}

async function loadPartnerDestination(partnerId: string | null | undefined) {
  if (!partnerId) return "";
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT data->>'market' AS market, data->>'region' AS region
     FROM base44.partner
     WHERE id = $1 OR data->>'id' = $1
     LIMIT 1`,
    [String(partnerId)]
  );
  return asString(rows[0]?.market || rows[0]?.region);
}

function buildPublicRecord(property: Record<string, any>, destination: string) {
  const listingUrl = asString(property.listing_url || property.vrm_url || property.url);
  const dest = destination || asString(property.market) || asString(property.location_city);
  const destSlug = slugify(dest);
  const propSlug = publicPropertySlug(property.property_name);
  const photos = asPhotos(property.photo_urls);
  if (!destSlug || !propSlug) {
    throw new Error("Property needs a destination/market and property name to publish");
  }
  if (!photos.length) {
    throw new Error("Property has no photos to publish — add photos before approving");
  }
  const siteUrl = `/destinations/${destSlug}/${propSlug}`;

  let status = asString(property.status) || "draft";
  let active = status === "active";
  let portalVisible = property.portal_visible === true || property.portal_visible === "true";
  if (
    property.offboarding_status === "temporary_offline" ||
    property.offboarding_status === "terminated"
  ) {
    status = "inactive";
    active = false;
    portalVisible = false;
  }

  const record: Record<string, any> = {
    name: asString(property.property_name) || "Unnamed Property",
    destination: dest || "",
    url: siteUrl,
    vrm_url: listingUrl || siteUrl,
    bedrooms: property.bedrooms != null ? Number(property.bedrooms) : null,
    bathrooms: property.bathrooms != null ? String(property.bathrooms) : null,
    occupancy: property.sleeps != null ? Number(property.sleeps) : null,
    house_type: asString(property.property_type) || null,
    partner_name: asString(property.partner_name) || null,
    partner_id: asString(property.partner_id) || null,
    address: asString(property.address || property.location_full) || null,
    location_city: asString(property.location_city) || null,
    location_state: asString(property.location_state) || null,
    location_country: asString(property.location_country) || null,
    propdescription: asString(property.internal_notes) || null,
    excerpt: asString(property.excerpt || property.short_summary) || null,
    text: asString(property.text || property.description) || null,
    headline: asString(property.headline) || null,
    unique_feature: asString(property.unique_feature || property.unique_features) || null,
    why_onehundred: asString(property.why_onehundred || property.why_100_collection) || null,
    best_fit_guest: asString(property.best_fit_guest) || null,
    design_style_notes: asString(property.design_style_notes) || null,
    status,
    active,
    portal_visible: portalVisible,
    onboarding_status: asString(property.onboarding_status) || "complete",
    photography_status: asString(property.photography_status) || "approved",
    launch_date: property.launch_date || null,
  };

  if (photos.length) {
    // photo_urls order from the approved Property/submission is authoritative.
    record.images = JSON.stringify(photos);
    record.vrm_images = JSON.stringify(photos);
    record.property_image = photos[0];
    record.photo_count = String(photos.length);
  }

  const amenities = Array.isArray(property.amenities) ? property.amenities.filter(Boolean) : [];
  if (amenities.length) {
    // Both columns are jsonb on Neon — store amenity lists as JSON arrays.
    record.categories = JSON.stringify(amenities);
    record.prop_categories = JSON.stringify(amenities);
  }

  // Keep required public fields even when optional copy is blank.
  const required = new Set(["name", "destination", "url", "vrm_url", "status", "images", "property_image", "photo_count"]);
  return Object.fromEntries(
    Object.entries(record).filter(([key, value]) => {
      if (required.has(key)) return value !== null && value !== undefined;
      return value !== null && value !== undefined && value !== "";
    })
  );
}

function sqlAssignments(cols: string[], startAt = 1) {
  return cols
    .map((col, i) => {
      const param = `$${i + startAt}`;
      const ident = quoteIdent(col);
      return JSON_FIELDS.has(col) ? `${ident} = ${param}::jsonb` : `${ident} = ${param}`;
    })
    .join(", ");
}

function sqlInsertPlaceholders(cols: string[], startAt = 1) {
  return cols
    .map((col, i) => {
      const param = `$${i + startAt}`;
      return JSON_FIELDS.has(col) ? `${param}::jsonb` : param;
    })
    .join(", ");
}

async function upsertNeon(record: Record<string, any>, property: Record<string, any>) {
  const pool = getNeonPool();
  const listingUrl = asString(property.listing_url || property.vrm_url);
  const sbId = asString(property.supabase_property_id);
  const cols = Object.keys(record);
  const values = cols.map((col) => (JSON_FIELDS.has(col) ? toJsonbParam(record[col]) : record[col]));

  if (sbId && sbId !== "null" && sbId !== "undefined") {
    const { rows } = await pool.query(
      `UPDATE supabase.propertiesbase44 SET ${sqlAssignments(cols, 2)}
       WHERE id = $1 OR row_id::text = $1
       RETURNING id, row_id, name, url, vrm_url, photo_count, destination`,
      [sbId, ...values]
    );
    if (rows[0]) return rows[0];
  }

  if (listingUrl) {
    const normalized = listingUrl.replace(/\/+$/, "").split("?")[0];
    const { rows: existing } = await pool.query(
      `SELECT id, row_id FROM supabase.propertiesbase44
       WHERE vrm_url IN ($1, $2) OR url IN ($1, $2)
       LIMIT 1`,
      [listingUrl, normalized]
    );
    if (existing[0]) {
      const { rows } = await pool.query(
        `UPDATE supabase.propertiesbase44 SET ${sqlAssignments(cols, 2)}
         WHERE id = $1
         RETURNING id, row_id, name, url, vrm_url, photo_count, destination`,
        [existing[0].id, ...values]
      );
      return rows[0];
    }
  }

  // Prefer updating an incomplete stub stamped earlier (same property name + partner).
  const partnerId = asString(property.partner_id);
  const propName = asString(property.property_name);
  if (partnerId && propName) {
    const { rows: stubs } = await pool.query(
      `SELECT id, row_id FROM supabase.propertiesbase44
       WHERE partner_id = $1 AND name = $2
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1`,
      [partnerId, propName]
    );
    if (stubs[0]) {
      const { rows } = await pool.query(
        `UPDATE supabase.propertiesbase44 SET ${sqlAssignments(cols, 2)}
         WHERE id = $1
         RETURNING id, row_id, name, url, vrm_url, photo_count, destination`,
        [stubs[0].id, ...values]
      );
      if (rows[0]) return rows[0];
    }
  }

  const rowId = String(Date.now());
  const insertCols = ["id", "row_id", ...cols];
  const insertVals = [rowId, rowId, ...values];
  const { rows } = await pool.query(
    `INSERT INTO supabase.propertiesbase44 (${insertCols.map(quoteIdent).join(", ")})
     VALUES (${sqlInsertPlaceholders(insertCols)})
     RETURNING id, row_id, name, url, vrm_url, photo_count, destination`,
    insertVals
  );
  return rows[0];
}

async function upsertRemoteSupabase(record: Record<string, any>, rowId: string) {
  if (!hasRemoteSupabase()) {
    return { skipped: true as const, reason: "Supabase credentials missing" };
  }

  const payload = {
    ...record,
    id: String(rowId),
    row_id: Number(rowId) || Date.now(),
    created_at: record.created_at || new Date().toISOString(),
  };

  const existing = await supabaseRest(
    `propertiesbase44?or=(id.eq.${encodeURIComponent(String(rowId))},row_id.eq.${encodeURIComponent(String(payload.row_id))})&select=id,row_id&limit=1`
  );
  if (Array.isArray(existing) && existing[0]) {
    const target = existing[0].id || existing[0].row_id;
    const patched = await supabaseRest(`propertiesbase44?id=eq.${encodeURIComponent(String(target))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { skipped: false as const, action: "updated", row: Array.isArray(patched) ? patched[0] : patched };
  }

  const created = await supabaseRest("propertiesbase44", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return { skipped: false as const, action: "created", row: Array.isArray(created) ? created[0] : created };
}

async function stampProperty(propertyId: string, supabaseId: string) {
  const pool = getNeonPool();
  await pool.query(
    `UPDATE base44.property
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
         updated_date = now()
     WHERE id = $1`,
    [propertyId, JSON.stringify({ supabase_property_id: String(supabaseId) })]
  );
}

export async function handleSyncPropertyToSupabase(req: any, res: any, body: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const action = asString(body?.action) || "sync_property";
  if (action !== "sync_property" && action !== "update" && action !== "create") {
    // Keep unknown actions from falling through to a broken Base44 proxy silently.
    return json(res, 400, { error: `Unsupported sync action: ${action}` });
  }

  const propertyId = asString(body?.id || body?.property_id);
  if (!propertyId && action === "sync_property") {
    return json(res, 400, { error: "Property id is required" });
  }

  if (action === "sync_property") {
    const property = await loadProperty(propertyId);
    if (!property) return json(res, 404, { error: "Property not found" });

    const destination = await loadPartnerDestination(property.partner_id);
    const record = buildPublicRecord(property, destination);
    if (!asPhotos(property.photo_urls).length) {
      console.warn(`[syncPropertyToSupabase] Property ${propertyId} has no photo_urls`);
    }
    if (!record.text && !record.excerpt) {
      console.warn(`[syncPropertyToSupabase] Property ${propertyId} has no description/excerpt`);
    }

    const neonRow = await upsertNeon(record, property);
    if (!neonRow?.url || !record.images) {
      throw new Error("Publish incomplete — public url and photos are required");
    }
    if (!asString(neonRow.destination)) {
      throw new Error("Publish incomplete — destination/market is required");
    }
    const publicId = String(neonRow.row_id || neonRow.id);
    await stampProperty(property.id, publicId);
    const remote = await upsertRemoteSupabase(record, publicId);
    if (remote && "skipped" in remote && remote.skipped) {
      throw new Error(remote.reason || "Supabase credentials missing — public site was not updated");
    }

    return json(res, 200, {
      ok: true,
      action: "synced",
      property: {
        id: publicId,
        name: neonRow.name,
        url: neonRow.url,
        vrm_url: neonRow.vrm_url,
        destination: neonRow.destination,
        photo_count: record.photo_count || "0",
      },
      remote,
    });
  }

  // create/update from raw submission-like payloads (legacy callers)
  const data = body?.data || {};
  const photos = asPhotos(data.photo_urls || data.images);
  const record = buildPublicRecord(
    {
      ...data,
      property_name: data.property_name || data.name,
      listing_url: data.listing_url || data.vrm_url || data.url,
      photo_urls: photos,
      text: data.text || data.description,
      excerpt: data.excerpt || data.short_summary,
      why_100_collection: data.why_100_collection || data.why_onehundred,
    },
    asString(data.market || data.destination)
  );
  if (action === "create") {
    const neonRow = await upsertNeon({ ...record, created_at: new Date().toISOString() }, data);
    const publicId = String(neonRow.row_id || neonRow.id);
    const remote = await upsertRemoteSupabase(record, publicId);
    return json(res, 200, { ok: true, property: { id: publicId, ...neonRow }, remote });
  }

  const id = asString(body?.id);
  const neonRow = await upsertNeon(record, { ...data, supabase_property_id: id });
  const publicId = String(neonRow?.row_id || neonRow?.id || id || newId());
  const remote = await upsertRemoteSupabase(record, publicId);
  return json(res, 200, { ok: true, property: { id: publicId, ...neonRow }, remote });
}
