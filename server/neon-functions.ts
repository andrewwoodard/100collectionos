import { getNeonPool, json, newId, quoteIdent, readBody } from "./neon-db.js";
import { ingestRemoteImages } from "./blob.js";

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
    status: source.active === true || source.active === "true" ? "active" : source.status || "inactive",
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

function toPropertyRecord(data: any) {
  const record = pickColumns(data, PROP_COLUMNS, PROP_ALIASES);
  if (data?.listing_url && !record.vrm_url) record.vrm_url = data.listing_url;
  if (data?.status !== undefined && record.active === undefined) {
    record.active = data.status === "active";
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
    const record = await withIngestedImages(toPropertyRecord({
      ...data,
      row_id: data?.row_id || Date.now(),
      created_at: data?.created_at || new Date().toISOString(),
    }));
    if (!record.name) record.name = data?.property_name || data?.name || "Untitled property";
    const insert = buildInsert("supabase.propertiesbase44", {
      id: String(record.row_id || newId()),
      ...record,
    });
    const { rows } = await pool.query(insert.sql, insert.params);
    return json(res, 200, { property: fromSupabase(rows[0]) });
  }

  if (action === "update") {
    const record = await withIngestedImages(toPropertyRecord(data || {}));
    if (!Object.keys(record).length) return json(res, 400, { error: "No updatable fields" });
    const update = buildUpdate(
      "supabase.propertiesbase44",
      record,
      "id = $1 OR row_id::text = $1 OR url = $2 OR vrm_url = $2",
      [String(id || ""), String(url || "")]
    );
    const { rows } = await pool.query(update.sql, update.params);
    if (!rows[0]) return json(res, 404, { error: "Property not found" });
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

const LOCAL_FUNCTIONS = new Set(["supabaseData", "supabaseProperties", "getPartnerTeam", "managePartnerTeam"]);

export async function handleNeonFunction(req: any, res: any, functionName: string) {
  if (!LOCAL_FUNCTIONS.has(functionName)) return false;
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (functionName === "supabaseData") await handleSupabaseData(res, body);
    else if (functionName === "supabaseProperties") await handleSupabaseProperties(res, body);
    else if (functionName === "getPartnerTeam") await handleGetPartnerTeam(res, body);
    else if (functionName === "managePartnerTeam") await handleManagePartnerTeam(res, body);
    return true;
  } catch (error: any) {
    console.error("[neon-functions]", functionName, error);
    json(res, 500, { error: error.message || "Neon function error" });
    return true;
  }
}
