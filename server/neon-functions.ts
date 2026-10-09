import { getNeonPool, json, newId, quoteIdent, readBody } from "./neon-db.js";
import { ingestRemoteImages } from "./blob.js";
import { requireAdmin, requireSession } from "./require-session.js";
import { sendPortalEmail } from "./reset-email.js";
import { handleStripeFunction, STRIPE_FUNCTIONS } from "./stripe-functions.js";
import { handleBuildAdminEmail, handleGetEmailPreview } from "./email-preview.js";
import { handleSendResendEmail } from "./send-resend-email.js";
import { handleCheckPropertyLinks } from "./check-property-links.js";
import { handleSyncPropertyToSupabase } from "./sync-property-to-supabase.js";
import { randomUUID } from "node:crypto";

const TABLE_SEARCH_FIELDS: Record<string, string[]> = {
  partners: ["partner_name", "company_name", "market", "primary_contact_name", "primary_contact_email", "stripe_billing_email"],
  tasks: ["title", "description", "partner_name", "property_name"],
  billing_records: ["partner_name", "invoice_number"],
  notes: ["title", "body", "partner_name"],
  documents: ["title", "partner_name", "property_name"],
  media_assets: ["asset_name", "partner_name", "property_name"],
  onboarding_items: ["checklist_item", "partner_name", "property_name"],
  activity_logs: ["action", "partner_name", "property_name", "performed_by"],
  audit_entries: ["action", "partner_name", "actor_email"],
  license_records: ["partner_name", "property_name", "license_number"],
  partner_profiles: ["partner_name", "display_name", "company_name"],
  partner_applications: ["full_name", "email", "company_name"],
  job_applications: ["name", "email", "phone", "job_title", "partner_name", "job_location", "first_name", "last_name"],
  properties: ["property_name", "partner_name", "market", "address"],
  vrms: ["name", "partner_name", "title", "slug"],
};

const VRMS_COLUMNS = new Set([
  "name", "slug", "title", "partner_name", "email", "phone", "vrm_email", "vrm_phone",
  "vrm_url", "website", "source", "sanity_id", "sanity_vrm_id", "sanity_created_at",
  "sanity_updated_at", "doyen_name", "doyen_title", "doyen_short_description", "doyen_text",
  "doyen_image_url", "logo_image_url", "main_image_url", "destination_slugs",
  "first_destination_slug", "unit_count", "onboarded", "is_onboarded", "showproperties",
  "last_header_ok", "last_header_has_link", "last_header_status", "last_header_error",
  "last_header_final_url", "last_header_checked_at", "last_trademark_ok",
  "last_trademark_status", "last_trademark_error", "last_trademark_final_url",
  "last_trademark_checked_at", "body_json", "doyentext_json", "favorites_json",
  "showcase_json", "servicesoffered_json", "servicesavailable_json",
  "serviceofferedpicks_json", "created_at", "updated_at", "source_id",
]);

const PROP_COLUMNS = new Set([
  "row_id", "source_id", "name", "url", "vrm_url", "destination", "partner_name",
  "partner_id", "address", "bedrooms", "bathrooms", "occupancy", "house_type", "status",
  "active", "portal_visible", "onboarding_status", "photography_status", "launch_date",
  "removal_date", "last_scan", "latitude", "longitude", "pet_friendly", "unique_feature",
  "why_onehundred", "excerpt", "text", "headline", "property_image", "video_url",
  "designed_by", "designer_name", "design_style_notes", "location_city", "location_state",
  "location_country", "property_source", "property_html", "ai_search", "ai_fit_score",
  "best_fit_guest", "photo_count", "last_page_check_at", "last_page_check_ok",
  "last_page_check_status", "last_page_check_error", "last_page_check_final_url",
  "created_at", "images", "vrm_images", "categories", "prop_categories", "tags",
  "reviews", "propdescription",
]);

const JSON_COLUMNS = new Set([
  "body_json", "doyentext_json", "favorites_json", "showcase_json", "servicesoffered_json",
  "servicesavailable_json", "serviceofferedpicks_json", "destination_slugs", "images",
  "vrm_images", "categories", "prop_categories", "tags", "reviews", "propdescription",
]);

const PROP_ALIASES: Record<string, string> = {
  property_name: "name",
  market: "destination",
  listing_url: "url",
  sleeps: "occupancy",
  property_type: "house_type",
  internal_notes: "propdescription",
};

function unwrap(row: any) {
  if (row?.data && typeof row.data === "object" && !Array.isArray(row.data)) {
    const data = row.data;
    const out = { ...data, id: data.id ?? row.id };
    if (out.created_at && !out.created_date) out.created_date = out.created_at;
    return out;
  }
  const { imported_at: _importedAt, ...rest } = row || {};
  if (rest.created_at && !rest.created_date) rest.created_date = rest.created_at;
  return rest;
}

function jsonParam(value: any) {
  if (value == null || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function pickColumns(data: Record<string, any> | null | undefined, allowed: Set<string>, aliases: Record<string, string> = {}) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
    const col = aliases[key] || key;
    if (!allowed.has(col)) continue;
    if (JSON_COLUMNS.has(col)) {
      if (value == null || value === "") {
        out[col] = null;
      } else if (typeof value === "string") {
        const trimmed = value.trim();
        out[col] = trimmed.startsWith("{") || trimmed.startsWith("[") ? trimmed : JSON.stringify(value);
      } else {
        out[col] = JSON.stringify(value);
      }
    } else {
      out[col] = value;
    }
  }
  return out;
}

function buildInsert(tableSql: string, record: Record<string, any>) {
  const cols = Object.keys(record);
  const params = cols.map((col) => (JSON_COLUMNS.has(col) ? jsonParam(record[col]) : record[col]));
  const placeholders = cols.map((col, i) => (JSON_COLUMNS.has(col) ? `$${i + 1}::jsonb` : `$${i + 1}`));
  return {
    sql: `INSERT INTO ${tableSql} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    params,
  };
}

function buildUpdate(tableSql: string, record: Record<string, any>, whereSql: string, whereParams: any[]) {
  const cols = Object.keys(record);
  const params = [...whereParams];
  const sets = cols.map((col) => {
    params.push(JSON_COLUMNS.has(col) ? jsonParam(record[col]) : record[col]);
    return `${quoteIdent(col)} = $${params.length}${JSON_COLUMNS.has(col) ? "::jsonb" : ""}`;
  });
  sets.push("imported_at = now()");
  return {
    sql: `UPDATE ${tableSql} SET ${sets.join(", ")} WHERE ${whereSql} RETURNING *`,
    params,
  };
}

function parseImages(raw: any) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fromSupabase(row: any) {
  if (!row) return null;
  const source = row.data && !row.name ? row.data : row;
  return {
    id: source.row_id ?? source.id ?? row.row_id ?? row.id,
    created_date: source.created_at ?? row.created_at,
    property_name: source.name,
    market: source.destination,
    listing_url: source.url,
    bedrooms: source.bedrooms,
    bathrooms: source.bathrooms,
    sleeps: source.sleeps ?? source.occupancy,
    property_type: source.house_type,
    partner_name: source.partner_name,
    internal_notes: source.propdescription,
    address: source.address,
    // Prefer explicit status column; only fall back to the active boolean.
    status:
      source.status ||
      (source.active === true || source.active === "true" ? "active" : "inactive"),
    onboarding_status: source.onboarding_status || "not_started",
    photography_status: source.photography_status || "not_started",
    launch_date: source.launch_date,
    portal_visible: source.portal_visible || false,
    partner_id: source.partner_id,
    latitude: source.latitude,
    longitude: source.longitude,
    pet_friendly: source.pet_friendly,
    unique_feature: source.unique_feature,
    why_onehundred: source.why_onehundred,
    excerpt: source.excerpt,
    text: source.text,
    property_image: source.property_image,
    images: parseImages(source.images),
    vrm_url: source.vrm_url,
    last_scan: source.last_scan,
    last_page_check_at: source.last_page_check_at,
    last_page_check_ok: source.last_page_check_ok,
    last_page_check_status: source.last_page_check_status,
    last_page_check_final_url: source.last_page_check_final_url,
  };
}

function buildColumnFilters(filters: Record<string, any> | null | undefined, allowed: Set<string>, start = 1) {
  const clauses: string[] = [];
  const params: any[] = [];
  let i = start;
  for (const [key, value] of Object.entries(filters || {})) {
    if (value === undefined || value === null || !allowed.has(key)) continue;
    params.push(String(value));
    clauses.push(`${quoteIdent(key)}::text = $${i++}`);
  }
  return { sql: clauses.join(" AND "), params, next: i };
}

function buildEqFilters(filters: Record<string, any> | null | undefined, start = 1) {
  const clauses: string[] = [];
  const params: any[] = [];
  let i = start;
  if (!filters) return { sql: "", params, next: i };
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    const f = i++;
    const t = i++;
    const j = i++;
    params.push(key, String(value), JSON.stringify(value));
    clauses.push(`(data->>$${f} = $${t} OR data->$${f} = $${j}::jsonb)`);
  }
  return { sql: clauses.join(" AND "), params, next: i };
}

async function handleColumnarTable(
  res: any,
  table: string,
  allowed: Set<string>,
  body: any,
  aliases: Record<string, string> = {}
) {
  const { action, id, data, filters, search, limit } = body || {};
  const pool = getNeonPool();
  const tableSql = `supabase.${quoteIdent(table)}`;
  const searchFields = TABLE_SEARCH_FIELDS[table] || [];
  const built = buildColumnFilters(filters, allowed);
  const clauses = built.sql ? [built.sql] : [];
  const params = [...built.params];
  let i = built.next;

  if (search && searchFields.length) {
    params.push(`%${search}%`);
    clauses.push(`(${searchFields.map((field) => `${quoteIdent(field)} ILIKE $${i}`).join(" OR ")})`);
    i += 1;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  if (action === "list") {
    const lim = Math.min(Number(limit || 500), 5000);
    params.push(lim);
    const { rows } = await pool.query(
      `SELECT * FROM ${tableSql} ${where} ORDER BY created_at DESC NULLS LAST LIMIT $${i}`,
      params
    );
    return json(res, 200, { items: rows.map(unwrap) });
  }

  if (action === "get") {
    const { rows } = await pool.query(
      `SELECT * FROM ${tableSql} WHERE id = $1 OR source_id::text = $1 LIMIT 1`,
      [String(id)]
    );
    if (!rows[0]) return json(res, 404, { error: "Not found" });
    return json(res, 200, { item: unwrap(rows[0]) });
  }

  if (action === "create") {
    const record = pickColumns(data, allowed, aliases);
    if (!record.created_at) record.created_at = new Date().toISOString();
    const rowId = String(data?.id || newId());
    const insert = buildInsert(tableSql, { id: rowId, ...record });
    const { rows } = await pool.query(insert.sql, insert.params);
    return json(res, 200, { item: unwrap(rows[0]) });
  }

  if (action === "update") {
    const record = pickColumns(data, allowed, aliases);
    if (!Object.keys(record).length) return json(res, 400, { error: "No updatable fields" });
    const update = buildUpdate(tableSql, record, "id = $1 OR source_id::text = $1", [String(id)]);
    const { rows } = await pool.query(update.sql, update.params);
    if (!rows[0]) return json(res, 404, { error: "Not found" });
    return json(res, 200, { item: unwrap(rows[0]) });
  }

  if (action === "delete") {
    await pool.query(`DELETE FROM ${tableSql} WHERE id = $1 OR source_id::text = $1`, [String(id)]);
    return json(res, 200, { success: true });
  }

  if (action === "bulk_create") {
    const items = [];
    for (const item of data || []) {
      const record = pickColumns(item, allowed, aliases);
      const rowId = String(item?.id || newId());
      const insert = buildInsert(tableSql, { id: rowId, ...record });
      const { rows } = await pool.query(insert.sql, insert.params);
      items.push(unwrap(rows[0]));
    }
    return json(res, 200, { items, count: items.length });
  }

  return json(res, 400, { error: "Unknown action" });
}

async function handleSupabaseData(res: any, body: any) {
  const { table, action, id, data, filters, search, limit } = body || {};
  if (!table || !TABLE_SEARCH_FIELDS[table]) {
    return json(res, 400, { error: `Invalid table: ${table}` });
  }
  if (table === "vrms") return handleColumnarTable(res, "vrms", VRMS_COLUMNS, body);
  const pool = getNeonPool();
  const t = quoteIdent(table);
  const built = buildEqFilters(filters);
  const clauses = built.sql ? [built.sql] : [];
  const params = [...built.params];
  let i = built.next;

  if (search && TABLE_SEARCH_FIELDS[table].length) {
    const parts = TABLE_SEARCH_FIELDS[table].map((field) => {
      params.push(field, `%${search}%`);
      return `data->>$${i++} ILIKE $${i++}`;
    });
    clauses.push(`(${parts.join(" OR ")})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  if (action === "list") {
    const lim = Math.min(Number(limit || 500), 5000);
    params.push(lim);
    const { rows } = await pool.query(
      `SELECT * FROM supabase.${t} ${where} ORDER BY COALESCE(data->>'created_at', data->>'created_date') DESC NULLS LAST LIMIT $${i}`,
      params
    );
    return json(res, 200, { items: rows.map(unwrap) });
  }

  if (action === "get") {
    const { rows } = await pool.query(
      `SELECT * FROM supabase.${t} WHERE id = $1 OR data->>'id' = $1 LIMIT 1`,
      [String(id)]
    );
    if (!rows[0]) return json(res, 404, { error: "Not found" });
    return json(res, 200, { item: unwrap(rows[0]) });
  }

  if (action === "create") {
    const record = { ...(data || {}) };
    if (!record.id) record.id = newId();
    if (!record.created_at) record.created_at = new Date().toISOString();
    const { rows } = await pool.query(
      `INSERT INTO supabase.${t} (id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, imported_at = now()
       RETURNING *`,
      [String(record.id), JSON.stringify(record)]
    );
    return json(res, 200, { item: unwrap(rows[0]) });
  }

  if (action === "update") {
    const { rows } = await pool.query(
      `UPDATE supabase.${t}
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, imported_at = now()
       WHERE id = $1 OR data->>'id' = $1
       RETURNING *`,
      [String(id), JSON.stringify(data || {})]
    );
    if (!rows[0]) return json(res, 404, { error: "Not found" });
    return json(res, 200, { item: unwrap(rows[0]) });
  }

  if (action === "delete") {
    await pool.query(`DELETE FROM supabase.${t} WHERE id = $1 OR data->>'id' = $1`, [String(id)]);
    return json(res, 200, { success: true });
  }

  if (action === "bulk_create") {
    const items = [];
    for (const item of data || []) {
      const record = { ...item };
      if (!record.id) record.id = newId();
      const { rows } = await pool.query(
        `INSERT INTO supabase.${t} (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
         RETURNING *`,
        [String(record.id), JSON.stringify(record)]
      );
      items.push(unwrap(rows[0]));
    }
    return json(res, 200, { items, count: items.length });
  }

  return json(res, 400, { error: "Unknown action" });
}

async function withIngestedImages(record: Record<string, any>) {
  if (record.images == null) return record;
  const list = parseImages(record.images);
  if (!list.length) return record;
  record.images = JSON.stringify(await ingestRemoteImages(list));
  return record;
}

async function mirrorPublicPropertyRow(row: any) {
  if (!row) return;
  try {
    const { mirrorPropertiesbase44ToRemote } = await import("./supabase-remote.js");
    await mirrorPropertiesbase44ToRemote(row);
  } catch (error: any) {
    console.warn("[supabaseProperties] remote mirror failed:", error?.message || error);
  }
}

function slugifyPublic(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPropertyRecord(data: any) {
  const record = pickColumns(data, PROP_COLUMNS, PROP_ALIASES);
  if (data?.listing_url && !record.vrm_url) record.vrm_url = data.listing_url;
  if (data?.status !== undefined && record.active === undefined) {
    record.active = data.status === "active";
  }

  // Map portal Property photo_urls → public images when callers pass entity-shaped data.
  if (record.images == null && Array.isArray(data?.photo_urls) && data.photo_urls.length) {
    const photos = data.photo_urls.map((u: any) => String(u || "").trim()).filter(Boolean);
    if (photos.length) {
      record.images = JSON.stringify(photos);
      record.vrm_images = JSON.stringify(photos);
      record.property_image = photos[0];
      record.photo_count = String(photos.length);
    }
  }

  // Public site path — never leave url null when we have destination + name.
  const dest = String(record.destination || data?.market || "").trim();
  const name = String(record.name || data?.property_name || "").trim();
  const destSlug = slugifyPublic(dest);
  const propSlug = slugifyPublic(name);
  if (destSlug && propSlug) {
    const siteUrl = `/destinations/${destSlug}/${propSlug}`;
    if (!record.url || record.url === data?.listing_url) record.url = siteUrl;
    if (!record.vrm_url) record.vrm_url = String(data?.listing_url || siteUrl);
  }

  return record;
}

async function handleSupabaseProperties(res: any, body: any) {
  const pool = getNeonPool();
  const { action, id, data, filters, search, url } = body || {};
  const lim = Math.min(Number(body.limit || 500), 10000);
  const rowSql = `SELECT * FROM supabase.propertiesbase44`;

  if (action === "list") {
    const clauses: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (filters?.partner_id) {
      params.push(String(filters.partner_id));
      clauses.push(`partner_id = $${i++}`);
    }
    if (filters?.partner_name) {
      params.push(String(filters.partner_name));
      clauses.push(`partner_name = $${i++}`);
    }
    if (filters?.status) {
      params.push(String(filters.status));
      clauses.push(`status = $${i++}`);
    }
    if (filters?.active !== undefined) {
      params.push(filters.active === true || filters.active === "true");
      clauses.push(`active = $${i++}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(name ILIKE $${i} OR destination ILIKE $${i} OR partner_name ILIKE $${i} OR address ILIKE $${i})`);
      i += 1;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(lim);
    const { rows } = await pool.query(
      `${rowSql} ${where} ORDER BY created_at DESC NULLS LAST LIMIT $${i}`,
      params
    );
    return json(res, 200, { properties: rows.map((r) => fromSupabase(r)) });
  }

  if (action === "get") {
    const { rows } = await pool.query(
      `${rowSql} WHERE id = $1 OR row_id::text = $1 OR source_id = $1 LIMIT 1`,
      [String(id)]
    );
    return json(res, 200, { property: rows[0] ? fromSupabase(rows[0]) : null });
  }

  if (action === "get_by_url") {
    const lookupUrl = url || data?.url || id;
    if (!lookupUrl) return json(res, 400, { error: "url required" });
    const normalized = String(lookupUrl).replace(/\/+$/, "").split("?")[0].split("#")[0];
    const { rows } = await pool.query(
      `${rowSql}
       WHERE vrm_url IN ($1, $2) OR url IN ($1, $2)
          OR vrm_url ILIKE $3 OR url ILIKE $3
       LIMIT 20`,
      [String(lookupUrl), normalized, `${normalized}%`]
    );
    const pick = rows.find((r) => parseImages(r.images).length > 0) || rows[0];
    return json(res, 200, { property: pick ? fromSupabase(pick) : null });
  }

  if (action === "create") {
    const mapped = toPropertyRecord({
      ...data,
      row_id: data?.row_id || Date.now(),
      created_at: data?.created_at || new Date().toISOString(),
    });
    // skip_image_ingest: AI add often sends 40–100 remote URLs; downloading them
    // in-request exceeds the gateway timeout and surfaces as axios "Network Error".
    const record = body.skip_image_ingest
      ? mapped
      : await withIngestedImages(mapped);
    const imageList = parseImages(record.images);
    if (imageList.length) {
      record.images = JSON.stringify(imageList);
      if (!record.vrm_images) record.vrm_images = JSON.stringify(imageList);
      if (!record.property_image) record.property_image = imageList[0];
      if (!record.photo_count) record.photo_count = String(imageList.length);
    }
    if (!record.name) record.name = data?.property_name || data?.name || "Untitled property";
    const insert = buildInsert("supabase.propertiesbase44", {
      id: String(record.row_id || newId()),
      ...record,
    });
    const { rows } = await pool.query(insert.sql, insert.params);
    await mirrorPublicPropertyRow(rows[0]);
    return json(res, 200, { property: fromSupabase(rows[0]) });
  }

  if (action === "update") {
    const mapped = toPropertyRecord(data || {});
    const record = body.skip_image_ingest ? mapped : await withIngestedImages(mapped);
    const imageList = parseImages(record.images);
    if (imageList.length && body.skip_image_ingest) {
      record.images = JSON.stringify(imageList);
      if (!record.vrm_images) record.vrm_images = JSON.stringify(imageList);
      if (!record.property_image) record.property_image = imageList[0];
      if (!record.photo_count) record.photo_count = String(imageList.length);
    }
    if (!Object.keys(record).length) return json(res, 400, { error: "No updatable fields" });
    const update = buildUpdate(
      "supabase.propertiesbase44",
      record,
      "id = $1 OR row_id::text = $1 OR url = $2 OR vrm_url = $2",
      [String(id || ""), String(url || "")]
    );
    const { rows } = await pool.query(update.sql, update.params);
    if (!rows[0]) return json(res, 404, { error: "Property not found" });
    await mirrorPublicPropertyRow(rows[0]);
    return json(res, 200, { property: fromSupabase(rows[0]) });
  }

  if (action === "delete") {
    await pool.query(
      `DELETE FROM supabase.propertiesbase44 WHERE id = $1 OR row_id::text = $1`,
      [String(id)]
    );
    return json(res, 200, { success: true });
  }

  if (action === "stats") {
    const { rows } = await pool.query(`SELECT created_at, active FROM supabase.propertiesbase44`);
    return json(res, 200, { properties: rows });
  }

  if (action === "list_by_urls") {
    const rawUrls = Array.isArray(body.urls) ? body.urls : [];
    const urls = rawUrls.map((u: any) => String(u || "").trim()).filter(Boolean);
    if (!urls.length) return json(res, 200, { properties: [] });
    const { rows } = await pool.query(
      `${rowSql} WHERE vrm_url = ANY($1::text[]) OR url = ANY($1::text[])`,
      [urls]
    );
    return json(res, 200, { properties: rows.map((r) => fromSupabase(r)) });
  }

  return json(res, 400, { error: "Unknown action" });
}

async function getPartnerRow(partnerId: string) {
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT * FROM base44.partner WHERE id = $1 OR data->>'id' = $1 LIMIT 1`,
    [String(partnerId)]
  );
  return rows[0] || null;
}

function partnerRecord(row: any) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return {
    ...data,
    id: row.id,
    portal_user_id: data.portal_user_id || null,
    portal_user_ids: Array.isArray(data.portal_user_ids) ? data.portal_user_ids : [],
    partner_name: data.partner_name,
    primary_contact_email: data.primary_contact_email || "",
  };
}

function teamUserIds(partner: any) {
  const ids = Array.isArray(partner.portal_user_ids) && partner.portal_user_ids.length > 0
    ? partner.portal_user_ids
    : partner.portal_user_id
      ? [partner.portal_user_id]
      : [];
  return [...new Set(ids.filter(Boolean).map(String))];
}

async function handleGetPartnerTeam(res: any, body: any) {
  const partnerId = body?.partner_id;
  if (!partnerId) return json(res, 400, { error: "partner_id required" });
  const row = await getPartnerRow(partnerId);
  if (!row) return json(res, 404, { error: "Partner not found" });
  const partner = partnerRecord(row);
  const userIds = teamUserIds(partner);
  const pool = getNeonPool();

  let users: any[] = [];
  if (userIds.length) {
    const result = await pool.query(
      `SELECT * FROM base44."user" WHERE id = ANY($1::text[])`,
      [userIds]
    );
    users = result.rows;
  }

  const teamMembers = userIds.map((uid) => {
    const u = users.find((x) => x.id === uid);
    const data = u?.data || {};
    return {
      id: uid,
      full_name: data.full_name || data.name || "",
      email: data.email || "",
      partner_role: data.partner_role || "owner",
    };
  });

  const invitations = await pool.query(
    `SELECT * FROM base44.partner_invitation WHERE id IN (
       SELECT id FROM base44.partner_invitation WHERE data->>'partner_id' = $1
     ) OR data->>'partner_id' = $1`,
    [String(partner.id)]
  );

  return json(res, 200, {
    ok: true,
    partner: {
      id: partner.id,
      partner_name: partner.partner_name,
      portal_user_id: partner.portal_user_id,
      portal_user_ids: userIds,
      primary_contact_email: partner.primary_contact_email,
    },
    teamMembers,
    invitations: invitations.rows.map((r) => ({ ...r.data, id: r.id, created_date: r.created_date || r.data?.created_date })),
  });
}

async function handleManagePartnerTeam(res: any, body: any) {
  const { action, partner_id, user_id } = body || {};
  if (!action || !partner_id || !user_id) {
    return json(res, 400, { error: "action, partner_id, and user_id are required" });
  }
  const row = await getPartnerRow(partner_id);
  if (!row) return json(res, 404, { error: "Partner not found" });
  const partner = partnerRecord(row);
  const userIds = teamUserIds(partner);
  const pool = getNeonPool();

  const persistPartner = async (patch: Record<string, unknown>) => {
    await pool.query(
      `UPDATE base44.partner
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
       WHERE id = $1`,
      [partner.id, JSON.stringify(patch)]
    );
  };

  if (action === "remove_member") {
    if (partner.portal_user_id === user_id) {
      return json(res, 400, { error: "Cannot remove the primary contact. Promote another member first." });
    }
    const newIds = userIds.filter((id) => id !== user_id);
    await persistPartner({ portal_user_ids: newIds });
    return json(res, 200, { ok: true, portal_user_ids: newIds });
  }

  if (action === "link_member") {
    const { rows } = await pool.query(`SELECT * FROM base44."user" WHERE id = $1`, [String(user_id)]);
    if (!rows[0]) return json(res, 404, { error: "User not found" });
    const target = rows[0].data || {};
    if (target.role !== "partner" && target.role !== "admin") {
      return json(res, 400, { error: "Only partner- or admin-role users can be linked to a partner" });
    }
    const newIds = userIds.includes(user_id) ? userIds : [...userIds, user_id];
    const patch: Record<string, unknown> = { portal_user_ids: newIds };
    if (!partner.portal_user_id) {
      patch.portal_user_id = user_id;
      patch.primary_contact_email = target.email || partner.primary_contact_email;
    }
    await persistPartner(patch);
    return json(res, 200, { ok: true, linked: true });
  }

  if (action === "make_primary") {
    if (!userIds.includes(user_id)) return json(res, 400, { error: "User is not a team member" });
    const { rows } = await pool.query(`SELECT * FROM base44."user" WHERE id = $1`, [String(user_id)]);
    const email = rows[0]?.data?.email || partner.primary_contact_email;
    await persistPartner({ portal_user_id: user_id, primary_contact_email: email });
    return json(res, 200, { ok: true, portal_user_id: user_id, primary_contact_email: email });
  }

  if (action === "change_role") {
    const { new_role } = body;
    if (!["owner", "marketing", "finance", "operations"].includes(new_role)) {
      return json(res, 400, { error: "Invalid role" });
    }
    if (!userIds.includes(user_id)) return json(res, 400, { error: "User is not a team member" });
    await pool.query(
      `UPDATE base44."user"
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
       WHERE id = $1`,
      [String(user_id), JSON.stringify({ partner_role: new_role })]
    );
    return json(res, 200, { ok: true, user_id, partner_role: new_role });
  }

  return json(res, 400, { error: "Unknown action" });
}

async function handleManagePartnerDirectory(req: any, res: any, body: any) {
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message, message: gate.message });

  const action = String(body?.action || "");
  if (!["archive", "restore", "delete"].includes(action)) {
    return json(res, 400, { error: "Invalid action", message: "Invalid action" });
  }
  const seeds = [...new Set([body?.partner_id, body?.base44_partner_id, body?.id].filter(Boolean).map(String))];
  if (!seeds.length) return json(res, 400, { error: "Partner id required", message: "Partner id required" });

  const pool = getNeonPool();
  const { rows: sbRows } = await pool.query(
    `SELECT id, data FROM supabase.partners
     WHERE id = ANY($1::text[])
        OR data->>'id' = ANY($1::text[])
        OR data->>'base44_partner_id' = ANY($1::text[])`,
    [seeds]
  );
  const ids = new Set(seeds);
  for (const row of sbRows) {
    ids.add(String(row.id));
    if (row.data?.id) ids.add(String(row.data.id));
    if (row.data?.base44_partner_id) ids.add(String(row.data.base44_partner_id));
  }
  const idList = [...ids];

  if (action === "delete") {
    const removedBase44 = await pool.query(`DELETE FROM base44.partner WHERE id = ANY($1::text[])`, [idList]);
    const removedSupabase = await pool.query(
      `DELETE FROM supabase.partners
       WHERE id = ANY($1::text[])
          OR data->>'id' = ANY($1::text[])
          OR data->>'base44_partner_id' = ANY($1::text[])`,
      [idList]
    );
    await pool.query(
      `DELETE FROM base44.partner_onboarding WHERE data->>'partner_id' = ANY($1::text[])`,
      [idList]
    );
    const removed = (removedBase44.rowCount || 0) + (removedSupabase.rowCount || 0);
    if (!removed) return json(res, 404, { error: "Partner record was not found", message: "Partner record was not found" });
    return json(res, 200, { ok: true, removed });
  }

  const patch = {
    archived: action === "archive",
    archived_at: action === "archive" ? new Date().toISOString() : null,
  };
  const updatedBase44 = await pool.query(
    `UPDATE base44.partner
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
     WHERE id = ANY($1::text[])`,
    [idList, JSON.stringify(patch)]
  );
  const updatedSupabase = await pool.query(
    `UPDATE supabase.partners
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, imported_at = now()
     WHERE id = ANY($1::text[])
        OR data->>'id' = ANY($1::text[])
        OR data->>'base44_partner_id' = ANY($1::text[])`,
    [idList, JSON.stringify(patch)]
  );
  const updated = (updatedBase44.rowCount || 0) + (updatedSupabase.rowCount || 0);
  if (!updated) return json(res, 404, { error: "Partner record was not found", message: "Partner record was not found" });
  return json(res, 200, { ok: true, updated });
}

async function handleGetUserById(req: any, res: any, body: any) {
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const userId = String(body?.userId || body?.user_id || "").trim();
  if (!userId) return json(res, 400, { error: "userId required" });

  const pool = getNeonPool();
  let { rows } = await pool.query(`SELECT id, data FROM base44."user" WHERE id = $1 LIMIT 1`, [userId]);
  if (!rows[0]) {
    const auth = await pool.query(`SELECT email FROM "user" WHERE id = $1 LIMIT 1`, [userId]);
    const email = String(auth.rows[0]?.email || "").trim().toLowerCase();
    if (email) {
      const byEmail = await pool.query(
        `SELECT id, data FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
        [email]
      );
      rows = byEmail.rows;
    }
  }
  if (!rows[0]) return json(res, 404, { error: "User not found" });

  const data = rows[0].data || {};
  return json(res, 200, {
    user: {
      id: rows[0].id,
      email: data.email || "",
      full_name: data.full_name || data.name || "",
      role: data.role || "user",
      partner_role: data.partner_role || "owner",
    },
  });
}

async function handleSyncPartnerToSupabase(res: any, body: any) {
  const partnerId = body?.partnerId || body?.event?.entity_id || body?.data?.id;
  const partnerEmail = body?.partnerEmail || body?.data?.primary_contact_email || "";
  if (!partnerId) return json(res, 400, { error: "partnerId required" });

  const row = await getPartnerRow(String(partnerId));
  const stored = row ? partnerRecord(row) : null;
  const partner = body?.data?.partner_name ? { ...stored, ...body.data, id: stored?.id || partnerId } : stored;
  if (!partner?.partner_name) return json(res, 404, { error: "Partner not found" });

  const email = String(partner.primary_contact_email || partnerEmail || "").trim();
  const payload = {
    partner_name: partner.partner_name,
    company_name: partner.company_name || partner.partner_name,
    primary_contact_name: partner.primary_contact_name || "",
    primary_contact_email: email,
    primary_contact_phone: partner.primary_contact_phone || "",
    market: partner.market || "",
    region: partner.region || "",
    status: partner.status || "lead",
    partner_type: partner.partner_type || "property_manager",
    contract_status: partner.contract_status || "none",
    notes: partner.notes || "",
    assigned_internal_owner: partner.assigned_internal_owner || "",
    start_date: partner.start_date || null,
    renewal_date: partner.renewal_date || null,
    go_live_date: partner.go_live_date || null,
    member_since: partner.member_since || null,
    parent_partner_id: partner.parent_partner_id || null,
    onboarding_stage: partner.onboarding_stage || null,
    billing_status: partner.billing_status || null,
    automated_billing: !!partner.automated_billing,
    tags: Array.isArray(partner.tags) ? partner.tags : [],
    base44_partner_id: String(partner.id || partnerId),
  };

  const pool = getNeonPool();
  const { rows: existing } = await pool.query(
    `SELECT id, data FROM supabase.partners
     WHERE data->>'base44_partner_id' = $1
        OR ($2 <> '' AND lower(coalesce(data->>'primary_contact_email', '')) = lower($2))
        OR ($3 <> '' AND data->>'partner_name' = $3)
     ORDER BY CASE WHEN data->>'base44_partner_id' = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [String(partner.id || partnerId), email, String(partner.partner_name || "")]
  );

  if (existing[0]) {
    const merged = { ...(existing[0].data || {}), ...payload, id: existing[0].data?.id || existing[0].id };
    await pool.query(
      `UPDATE supabase.partners SET data = $2::jsonb, imported_at = now() WHERE id = $1`,
      [existing[0].id, JSON.stringify(merged)]
    );
    return json(res, 200, { action: "updated", supabase_id: existing[0].id });
  }

  const id = newId();
  const record = { ...payload, id, created_at: new Date().toISOString() };
  await pool.query(
    `INSERT INTO supabase.partners (id, data) VALUES ($1, $2::jsonb)`,
    [id, JSON.stringify(record)]
  );
  return json(res, 200, { action: "created", supabase_id: id });
}

const PORTAL_ORIGIN = (process.env.BETTER_AUTH_URL || "https://portal.the100collection.com").replace(/\/$/, "");

function activationEmailHtml({
  firstName,
  partnerName,
  acceptUrl,
}: {
  firstName: string;
  partnerName: string;
  acceptUrl: string;
}) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAFBFC;font-family:Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFC;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0D1B2A;padding:32px 40px;text-align:center;">
<div style="color:#C9A96E;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">The 100 Collection</div>
</td></tr>
<tr><td style="padding:40px;color:#0D1B2A;font-size:15px;line-height:1.6;">
<p style="margin:0 0 16px;">Hi ${firstName},</p>
<p style="margin:0 0 16px;">Your partner portal for <strong>${partnerName}</strong> is ready. Use the button below to activate your account. This link expires in 14 days.</p>
<p style="margin:24px 0;text-align:center;">
<a href="${acceptUrl}" style="display:inline-block;background:#0D1B2A;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">Activate portal</a>
</p>
<p style="margin:0;color:#64748B;font-size:13px;">If the button does not work, open this link:<br>${acceptUrl}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function listPendingActivations(partnerId: string) {
  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.partner_invitation
     WHERE data->>'partner_id' = $1
       AND coalesce(data->>'invitation_type', '') = 'primary_activation'
       AND coalesce(data->>'status', '') = 'pending'
     ORDER BY created_date DESC NULLS LAST`,
    [partnerId]
  );
  return rows.map((row) => ({ id: row.id, ...(row.data || {}) }));
}

async function patchInvitation(id: string, patch: Record<string, any>) {
  const pool = getNeonPool();
  await pool.query(
    `UPDATE base44.partner_invitation
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
     WHERE id = $1`,
    [id, JSON.stringify({ ...patch, updated_date: new Date().toISOString() })]
  );
}

async function createInvitation(data: Record<string, any>) {
  const pool = getNeonPool();
  const id = newId();
  const now = new Date().toISOString();
  const record = { ...data, id, created_date: now, updated_date: now };
  await pool.query(
    `INSERT INTO base44.partner_invitation
      (id, created_date, updated_date, created_by, created_by_id, is_sample, data)
     VALUES ($1, now(), now(), $2, $2, false, $3::jsonb)`,
    [id, data.invited_by_user_id || "portal", JSON.stringify(record)]
  );
  return record;
}

async function handleSendActivationEmail(req: any, res: any, body: any) {
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const partnerId = String(body?.partner_id || "").trim();
  if (!partnerId) return json(res, 400, { error: "partner_id required" });

  const row = await getPartnerRow(partnerId);
  if (!row) return json(res, 404, { error: "Partner not found" });
  const partner = partnerRecord(row);
  const email = String(partner.primary_contact_email || "").trim();
  if (!email) return json(res, 400, { error: "No primary contact email set on this partner" });
  if (partner.status === "inactive" || partner.status === "paused") {
    return json(res, 400, { error: `Cannot send activation email to a ${partner.status} partner` });
  }
  if (partner.portal_user_id) {
    return json(res, 400, { error: "This partner has already activated their portal" });
  }

  const admin = gate.session.user as { id?: string; email?: string; name?: string; full_name?: string };
  const firstName = String(partner.primary_contact_name || "").split(" ")[0]?.trim() || "there";
  const partnerName = partner.partner_name || "your partner";
  const previewOnly = !!body?.preview_only;

  if (previewOnly) {
    const html = activationEmailHtml({
      firstName,
      partnerName,
      acceptUrl: `${PORTAL_ORIGIN}/portal/accept-invite`,
    });
    return json(res, 200, {
      ok: true,
      preview_html: html,
      first_name: firstName,
      partner_name: partnerName,
      email,
    });
  }

  const existing = await listPendingActivations(partner.id);
  let token = "";
  let invitationId = "";
  if (body?.resend) {
    for (const inv of existing) await patchInvitation(inv.id, { status: "revoked" });
  } else {
    const valid = existing.find((inv) => inv.expires_at && new Date(inv.expires_at) > new Date() && inv.token);
    if (valid) {
      token = String(valid.token);
      invitationId = valid.id;
    } else {
      for (const inv of existing) await patchInvitation(inv.id, { status: "expired" });
    }
  }

  if (!token) {
    token = randomUUID();
    const created = await createInvitation({
      partner_id: partner.id,
      partner_name: partnerName,
      email,
      invited_by_user_id: admin.id || null,
      invited_by_name: admin.full_name || admin.name || admin.email || "Admin",
      token,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      invitation_type: "primary_activation",
      partner_role: "owner",
    });
    invitationId = created.id;
  }

  const acceptUrl = `${PORTAL_ORIGIN}/portal/accept-invite?token=${encodeURIComponent(token)}`;
  const html = activationEmailHtml({ firstName, partnerName, acceptUrl });
  const sent = await sendPortalEmail({
    to: email,
    subject: `Activate your ${partnerName} portal`,
    html,
    text: `Hi ${firstName}, activate your portal for ${partnerName}: ${acceptUrl}`,
  });

  return json(res, 200, {
    ok: true,
    invitation_id: invitationId,
    resend_status: sent.skipped ? "skipped" : sent.ok ? "sent" : "failed",
    resend_error: "error" in sent ? sent.error || null : null,
    email,
    partner_name: partnerName,
  });
}

async function handleAcceptPartnerInvitation(req: any, res: any, body: any) {
  const action = String(body?.action || "");
  const token = String(body?.token || "").trim();
  if (!action || !token) return json(res, 400, { error: "action and token required" });

  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.partner_invitation WHERE data->>'token' = $1 LIMIT 1`,
    [token]
  );
  if (!rows[0]) return json(res, 404, { error: "not_found" });
  const inv = { id: rows[0].id, ...(rows[0].data || {}) };
  const partnerRow = await getPartnerRow(String(inv.partner_id || ""));
  if (!partnerRow) return json(res, 404, { error: "Partner not found" });
  const partner = partnerRecord(partnerRow);

  if (action === "lookup") {
    let status = inv.status || "pending";
    if (status === "pending" && inv.expires_at && new Date(inv.expires_at) < new Date()) status = "expired";
    return json(res, 200, {
      ok: true,
      status,
      email: inv.email,
      partner_name: partner.partner_name || "",
      invited_by_name: inv.invited_by_name || "",
      expires_at: inv.expires_at,
      invitation_type: inv.invitation_type || "teammate",
    });
  }

  if (action !== "accept") return json(res, 400, { error: "Unknown action" });

  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, 401, { error: "auth_required" });
  const sessionUser = gate.session.user as { id?: string; email?: string; name?: string; role?: string };
  const email = String(sessionUser.email || "").trim().toLowerCase();
  const isAdmin = sessionUser.role === "admin";
  if (!isAdmin && email !== String(inv.email || "").trim().toLowerCase()) {
    return json(res, 400, { error: "email_mismatch", expected: inv.email });
  }
  if (inv.status === "accepted") return json(res, 400, { error: "already_accepted" });
  if (inv.status === "revoked") return json(res, 400, { error: "revoked" });
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return json(res, 400, { error: "expired" });

  const { rows: portalUsers } = await pool.query(
    `SELECT id, data FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
    [email]
  );
  let portalUserId = portalUsers[0]?.id ? String(portalUsers[0].id) : "";
  if (!portalUserId) {
    portalUserId = newId();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO base44."user" (id, created_date, updated_date, data)
       VALUES ($1, now(), now(), $2::jsonb)`,
      [portalUserId, JSON.stringify({
        id: portalUserId,
        email,
        full_name: sessionUser.name || email.split("@")[0],
        role: isAdmin ? "admin" : "partner",
        partner_role: inv.partner_role || "owner",
        created_date: now,
        updated_date: now,
      })]
    );
  } else if (!isAdmin) {
    await pool.query(
      `UPDATE base44."user"
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
       WHERE id = $1`,
      [portalUserId, JSON.stringify({
        role: "partner",
        partner_role: inv.partner_role || "owner",
      })]
    );
  }

  const ids = Array.isArray(partner.portal_user_ids) ? [...partner.portal_user_ids] : [];
  if (partner.portal_user_id && !ids.includes(partner.portal_user_id)) ids.push(partner.portal_user_id);
  if (!ids.includes(portalUserId)) ids.push(portalUserId);
  const isPrimary = (inv.invitation_type || "teammate") === "primary_activation";
  await pool.query(
    `UPDATE base44.partner
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
     WHERE id = $1`,
    [partner.id, JSON.stringify({
      portal_user_ids: ids,
      ...(isPrimary ? { portal_user_id: portalUserId } : {}),
    })]
  );
  await patchInvitation(inv.id, {
    status: "accepted",
    accepted_at: new Date().toISOString(),
    accepted_by_user_id: portalUserId,
  });

  return json(res, 200, { ok: true, redirect: "/portal/dashboard" });
}

function teamInviteEmailHtml({
  inviterName,
  partnerName,
  acceptUrl,
}: {
  inviterName: string;
  partnerName: string;
  acceptUrl: string;
}) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAFBFC;font-family:Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFC;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0D1B2A;padding:32px 40px;text-align:center;">
<div style="color:#C9A96E;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">The 100 Collection</div>
</td></tr>
<tr><td style="padding:40px;color:#0D1B2A;font-size:15px;line-height:1.6;">
<h2 style="margin:0 0 16px;font-size:24px;font-weight:500;">You're invited</h2>
<p style="margin:0 0 16px;"><strong>${inviterName}</strong> invited you to join <strong>${partnerName}</strong>'s team on the partner portal.</p>
<p style="margin:0 0 24px;color:#64748B;font-size:13px;">This invitation expires in 14 days.</p>
<p style="margin:0 0 24px;text-align:center;">
<a href="${acceptUrl}" style="display:inline-block;background:#0D1B2A;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">Accept invitation</a>
</p>
<p style="margin:0;color:#64748B;font-size:13px;">${acceptUrl}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function callerIsAdmin(req: any) {
  const gate = await requireAdmin(req);
  return !("error" in gate && gate.error);
}

async function handleCreatePartnerInvitation(req: any, res: any, body: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, 401, { error: "Unauthorized" });
  const user = gate.session.user as {
    id?: string;
    email?: string;
    name?: string;
    full_name?: string;
    role?: string;
    partner_role?: string;
    portalId?: string;
  };

  const partnerId = String(body?.partner_id || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const partnerRole = String(body?.partner_role || "operations");
  if (!partnerId || !email.includes("@")) {
    return json(res, 400, { error: "partner_id and email are required" });
  }

  const row = await getPartnerRow(partnerId);
  if (!row) return json(res, 404, { error: "Partner not found" });
  const partner = partnerRecord(row);
  const memberIds = teamUserIds(partner);
  const isAdmin = await callerIsAdmin(req);
  const callerIds = [user.id, user.portalId].filter(Boolean) as string[];
  if (!isAdmin && !callerIds.some((id) => memberIds.includes(id))) {
    return json(res, 403, { error: "You do not have access to this partner organization" });
  }
  if (!isAdmin && (user.partner_role || "owner") !== "owner") {
    return json(res, 403, { error: "Only the account owner can invite teammates" });
  }

  const pool = getNeonPool();
  if (memberIds.length) {
    const { rows: members } = await pool.query(
      `SELECT id FROM base44."user"
       WHERE lower(data->>'email') = $1 AND id = ANY($2::text[])
       LIMIT 1`,
      [email, memberIds]
    );
    if (members[0]) return json(res, 409, { error: "This email is already a team member" });
  }

  const { rows: pending } = await pool.query(
    `SELECT id FROM base44.partner_invitation
     WHERE data->>'partner_id' = $1
       AND lower(data->>'email') = $2
       AND coalesce(data->>'status', '') = 'pending'`,
    [partner.id, email]
  );
  for (const inv of pending) await patchInvitation(inv.id, { status: "revoked" });

  const token = randomUUID();
  const inviterName = user.full_name || user.name || user.email || "A teammate";
  const partnerName = partner.partner_name || "your partner";
  const created = await createInvitation({
    partner_id: partner.id,
    partner_name: partnerName,
    email,
    invited_by_user_id: user.portalId || user.id || null,
    invited_by_name: inviterName,
    token,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    status: "pending",
    invitation_type: "teammate",
    partner_role: partnerRole,
  });

  const acceptUrl = `${PORTAL_ORIGIN}/portal/accept-invite?token=${encodeURIComponent(token)}`;
  const sent = await sendPortalEmail({
    to: email,
    subject: `You're invited to ${partnerName}'s partner portal`,
    html: teamInviteEmailHtml({ inviterName, partnerName, acceptUrl }),
    text: `${inviterName} invited you to join ${partnerName}'s team. Accept here: ${acceptUrl}`,
  });

  return json(res, 200, {
    ok: true,
    invitation_id: created.id,
    resend_status: sent.skipped ? "skipped" : sent.ok ? "sent" : "failed",
    resend_error: "error" in sent ? sent.error || null : null,
  });
}

async function handleManagePartnerInvitation(req: any, res: any, body: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, 401, { error: "Unauthorized" });
  const user = gate.session.user as { id?: string; portalId?: string; email?: string; name?: string; full_name?: string };
  const invitationId = String(body?.invitation_id || "").trim();
  if (!invitationId) return json(res, 400, { error: "invitation_id required" });

  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.partner_invitation WHERE id = $1 OR data->>'id' = $1 LIMIT 1`,
    [invitationId]
  );
  if (!rows[0]) return json(res, 404, { error: "Invitation not found" });
  const invitation = { id: rows[0].id, ...(rows[0].data || {}) };
  const partnerRow = await getPartnerRow(String(invitation.partner_id || ""));
  if (!partnerRow) return json(res, 404, { error: "Partner not found" });
  const partner = partnerRecord(partnerRow);
  const isAdmin = await callerIsAdmin(req);
  const callerIds = [user.id, user.portalId].filter(Boolean);
  if (!isAdmin && !callerIds.includes(partner.portal_user_id)) {
    return json(res, 403, { error: "Only the primary contact or an admin can manage invitations" });
  }

  if (body?.action === "revoke") {
    await patchInvitation(invitation.id, { status: "revoked" });
    return json(res, 200, { ok: true, status: "revoked" });
  }

  if (body?.action !== "resend") return json(res, 400, { error: "Unknown action" });
  if (invitation.status === "accepted") {
    return json(res, 400, { error: "Cannot resend an accepted invitation" });
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await patchInvitation(invitation.id, { status: "pending", expires_at: expiresAt });
  const partnerName = partner.partner_name || "your partner";
  const inviterName = invitation.invited_by_name || user.full_name || user.name || user.email || "A teammate";
  const acceptUrl = `${PORTAL_ORIGIN}/portal/accept-invite?token=${encodeURIComponent(invitation.token || "")}`;
  const sent = await sendPortalEmail({
    to: invitation.email,
    subject: `You're invited to ${partnerName}'s partner portal`,
    html: teamInviteEmailHtml({ inviterName, partnerName, acceptUrl }),
    text: `${inviterName} invited you to join ${partnerName}'s team. Accept here: ${acceptUrl}`,
  });
  return json(res, 200, {
    ok: true,
    status: "pending",
    expires_at: expiresAt,
    resend_status: sent.skipped ? "skipped" : sent.ok ? "sent" : "failed",
    resend_error: "error" in sent ? sent.error || null : null,
  });
}

function activityCategory(type: string, title: string, entityType: string) {
  const blob = `${type} ${title} ${entityType}`.toLowerCase();
  if (blob.includes("application") || blob.includes("signup") || blob.includes("signed up")) return "applications";
  if (type === "job_posting" || blob.includes("job") || blob.includes("career")) return "careers";
  if (type === "billed" || blob.includes("invoice") || blob.includes("billing") || blob.includes("payment")) return "billing";
  if (
    ["submitted", "approved", "rejected", "needs_revision", "under_review", "licensed"].includes(type) ||
    blob.includes("property")
  ) return "properties";
  return "updates";
}

function safeHref(href: string, isAdmin: boolean) {
  if (!href || !href.startsWith("/")) return null;
  if (!isAdmin && /^\/admin/i.test(href)) return null;
  return href;
}

function rolesAllow(raw: any, partnerRole: string) {
  const roles = Array.isArray(raw) ? raw.map((role) => String(role).toLowerCase()) : [];
  if (!roles.length) return true;
  return roles.includes(partnerRole);
}

async function handleGetActivityFeed(req: any, res: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message, message: gate.message });

  const user = gate.session.user as { email?: string; role?: string; partner_role?: string };
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return json(res, 401, { error: "Sign in required", message: "Sign in required" });

  const adminGate = await requireAdmin(req);
  const isAdmin = !("error" in adminGate && adminGate.error);
  const partnerRole = String(user.partner_role || "").toLowerCase();
  const pool = getNeonPool();

  const { rows: notifications } = await pool.query(
    `SELECT id, created_date, data
     FROM base44.portal_notification
     WHERE (
        ($1::boolean AND coalesce(data->>'recipient_role','') = 'admin'
          AND lower(coalesce(data->>'recipient_email','')) IN ('admin', $2))
        OR (
          lower(coalesce(data->>'recipient_email','')) = $2
          AND coalesce(data->>'recipient_role','') <> 'admin'
        )
      )
     ORDER BY created_date DESC NULLS LAST
     LIMIT 160`,
    [isAdmin, email]
  );

  const items: any[] = [];
  const seen = new Set<string>();
  const pushItem = (item: any) => {
    const key = item.dedup || `${item.title}|${item.message}|${String(item.at).slice(0, 16)}`;
    if (seen.has(key)) return;
    seen.add(key);
    delete item.dedup;
    items.push(item);
  };

  for (const row of notifications) {
    const data = row.data || {};
    const title = String(data.title || "").trim();
    const message = String(data.message || "").trim();
    if (!title) continue;
    if (/^(daily briefing|weekly digest)/i.test(title)) continue;
    if (!isAdmin && !rolesAllow(data.target_partner_roles, partnerRole)) continue;
    const type = String(data.type || "general");
    pushItem({
      id: `notice-${row.id}`,
      at: row.created_date,
      title,
      message,
      type,
      category: activityCategory(type, title, ""),
      property_name: data.property_name || null,
      unread: data.is_read === false || data.is_read === "false",
      href: safeHref(String(data.link || ""), isAdmin),
      dedup: data.dedup_key || "",
    });
  }

  if (isAdmin) {
    const { rows: audits } = await pool.query(
      `SELECT id, created_date, data
       FROM base44.audit_entry
       WHERE coalesce(data->>'action','') <> 'digest_sent'
         AND coalesce(data->>'entity_type','') <> 'AdminDigest'
       ORDER BY created_date DESC NULLS LAST
       LIMIT 80`
    );
    for (const row of audits) {
      const data = row.data || {};
      const action = String(data.action || "Update");
      const target = data.target_name || data.property_name || "";
      const label = ({
        property_brought_online: "Property brought online",
        property_taken_offline: "Property taken offline",
      } as Record<string, string>)[action] || action.replace(/_/g, " ");
      const title = target ? `${label} — ${target}` : label;
      const partnerName = data.partner_name ? String(data.partner_name) : "";
      const message = [partnerName, data.details].filter(Boolean).join(" · ");
      const entityType = String(data.entity_type || "");
      pushItem({
        id: `audit-${row.id}`,
        at: row.created_date,
        title,
        message,
        type: "audit",
        category: activityCategory(action, title, entityType),
        property_name: data.property_name || data.target_name || null,
        unread: false,
        href: null,
        dedup: "",
      });
    }
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return json(res, 200, {
    ok: true,
    scope: isAdmin ? "admin" : "partner",
    items: items.slice(0, 80),
  });
}

export const LOCAL_FUNCTIONS = new Set([
  "supabaseData",
  "supabaseProperties",
  "syncPartnerToSupabase",
  "sendActivationEmail",
  "createPartnerInvitation",
  "managePartnerInvitation",
  "acceptPartnerInvitation",
  "getPartnerTeam",
  "managePartnerTeam",
  "getUserById",
  "managePartnerDirectory",
  "getActivityFeed",
  "getEmailPreview",
  "buildAdminEmail",
  "sendResendEmail",
  "checkPropertyLinks",
  "syncPropertyToSupabase",
  ...STRIPE_FUNCTIONS,
]);

export async function handleNeonFunction(req: any, res: any, functionName: string) {
  if (!LOCAL_FUNCTIONS.has(functionName)) return false;
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (STRIPE_FUNCTIONS.has(functionName)) {
      await handleStripeFunction(req, res, functionName, body);
      return true;
    }
    if (functionName === "supabaseData") await handleSupabaseData(res, body);
    else if (functionName === "supabaseProperties") await handleSupabaseProperties(res, body);
    else if (functionName === "syncPartnerToSupabase") await handleSyncPartnerToSupabase(res, body);
    else if (functionName === "sendActivationEmail") await handleSendActivationEmail(req, res, body);
    else if (functionName === "createPartnerInvitation") await handleCreatePartnerInvitation(req, res, body);
    else if (functionName === "managePartnerInvitation") await handleManagePartnerInvitation(req, res, body);
    else if (functionName === "acceptPartnerInvitation") await handleAcceptPartnerInvitation(req, res, body);
    else if (functionName === "getPartnerTeam") await handleGetPartnerTeam(res, body);
    else if (functionName === "managePartnerTeam") await handleManagePartnerTeam(res, body);
    else if (functionName === "getUserById") await handleGetUserById(req, res, body);
    else if (functionName === "managePartnerDirectory") await handleManagePartnerDirectory(req, res, body);
    else if (functionName === "getActivityFeed") await handleGetActivityFeed(req, res);
    else if (functionName === "getEmailPreview") await handleGetEmailPreview(req, res, body);
    else if (functionName === "buildAdminEmail") await handleBuildAdminEmail(req, res, body);
    else if (functionName === "sendResendEmail") await handleSendResendEmail(req, res, body);
    else if (functionName === "checkPropertyLinks") await handleCheckPropertyLinks(req, res, body);
    else if (functionName === "syncPropertyToSupabase") await handleSyncPropertyToSupabase(req, res, body);
    return true;
  } catch (error: any) {
    console.error("[neon-functions]", functionName, error);
    json(res, 500, { error: error.message || "Neon function error" });
    return true;
  }
}
