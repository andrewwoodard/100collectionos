import { getNeonPool, json, newId, quoteIdent, readBody } from "./neon-db.ts";

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
  vrms: ["name", "partner_name", "market", "destination"],
};

function unwrap(row: any) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  const out = { ...data, id: data.id ?? row.id };
  if (out.created_at && !out.created_date) out.created_date = out.created_at;
  return out;
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
  return {
    id: row.row_id ?? row.id,
    created_date: row.created_at,
    property_name: row.name,
    market: row.destination,
    listing_url: row.url,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    sleeps: row.sleeps ?? row.occupancy,
    property_type: row.house_type,
    partner_name: row.partner_name,
    internal_notes: row.propdescription,
    address: row.address,
    status: row.active === true || row.active === "true" ? "active" : row.status || "inactive",
    onboarding_status: row.onboarding_status || "not_started",
    photography_status: row.photography_status || "not_started",
    launch_date: row.launch_date,
    portal_visible: row.portal_visible || false,
    partner_id: row.partner_id,
    latitude: row.latitude,
    longitude: row.longitude,
    pet_friendly: row.pet_friendly,
    unique_feature: row.unique_feature,
    why_onehundred: row.why_onehundred,
    excerpt: row.excerpt,
    text: row.text,
    property_image: row.property_image,
    images: parseImages(row.images),
    vrm_url: row.vrm_url,
    last_scan: row.last_scan,
  };
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

async function handleSupabaseData(res: any, body: any) {
  const { table, action, id, data, filters, search, limit } = body || {};
  if (!table || !TABLE_SEARCH_FIELDS[table]) {
    return json(res, 400, { error: `Invalid table: ${table}` });
  }
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
      clauses.push(`data->>'partner_id' = $${i++}`);
    }
    if (filters?.partner_name) {
      params.push(String(filters.partner_name));
      clauses.push(`data->>'partner_name' = $${i++}`);
    }
    if (filters?.status) {
      params.push(String(filters.status));
      clauses.push(`data->>'status' = $${i++}`);
    }
    if (filters?.active !== undefined) {
      params.push(String(filters.active));
      clauses.push(`(data->>'active' = $${i} OR data->'active' = $${i}::jsonb)`);
      i += 1;
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(data->>'name' ILIKE $${i} OR data->>'destination' ILIKE $${i} OR data->>'partner_name' ILIKE $${i} OR data->>'address' ILIKE $${i})`);
      i += 1;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(lim);
    const { rows } = await pool.query(
      `${rowSql} ${where} ORDER BY data->>'created_at' DESC NULLS LAST LIMIT $${i}`,
      params
    );
    return json(res, 200, { properties: rows.map((r) => fromSupabase(r.data)) });
  }

  if (action === "get") {
    const { rows } = await pool.query(
      `${rowSql} WHERE id = $1 OR data->>'row_id' = $1 OR data->>'id' = $1 LIMIT 1`,
      [String(id)]
    );
    return json(res, 200, { property: rows[0] ? fromSupabase(rows[0].data) : null });
  }

  if (action === "get_by_url") {
    const lookupUrl = url || data?.url || id;
    if (!lookupUrl) return json(res, 400, { error: "url required" });
    const normalized = String(lookupUrl).replace(/\/+$/, "").split("?")[0].split("#")[0];
    const { rows } = await pool.query(
      `${rowSql}
       WHERE data->>'vrm_url' IN ($1, $2) OR data->>'url' IN ($1, $2)
          OR data->>'vrm_url' ILIKE $3 OR data->>'url' ILIKE $3
       LIMIT 20`,
      [String(lookupUrl), normalized, `${normalized}%`]
    );
    const pick = rows
      .map((r) => r.data)
      .find((r) => parseImages(r.images).length > 0) || rows[0]?.data;
    return json(res, 200, { property: pick ? fromSupabase(pick) : null });
  }

  if (action === "create") {
    const record = { ...(data || {}), row_id: data?.row_id || Date.now(), created_at: new Date().toISOString() };
    const { rows } = await pool.query(
      `INSERT INTO supabase.propertiesbase44 (id, data) VALUES ($1, $2::jsonb) RETURNING *`,
      [String(record.row_id), JSON.stringify(record)]
    );
    return json(res, 200, { property: fromSupabase(rows[0].data) });
  }

  if (action === "update") {
    const patch = data || {};
    const { rows } = await pool.query(
      `UPDATE supabase.propertiesbase44
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, imported_at = now()
       WHERE id = $1 OR data->>'row_id' = $1 OR data->>'url' = $3 OR data->>'vrm_url' = $3
       RETURNING *`,
      [String(id || ""), JSON.stringify(patch), String(url || "")]
    );
    if (!rows[0]) return json(res, 404, { error: "Property not found" });
    return json(res, 200, { property: fromSupabase(rows[0].data) });
  }

  if (action === "delete") {
    await pool.query(
      `DELETE FROM supabase.propertiesbase44 WHERE id = $1 OR data->>'row_id' = $1`,
      [String(id)]
    );
    return json(res, 200, { success: true });
  }

  if (action === "stats") {
    const { rows } = await pool.query(`${rowSql}`);
    return json(res, 200, {
      properties: rows.map((r) => ({ created_at: r.data?.created_at, active: r.data?.active })),
    });
  }

  if (action === "list_by_urls") {
    const rawUrls = Array.isArray(body.urls) ? body.urls : [];
    const urls = rawUrls.map((u: any) => String(u || "").trim()).filter(Boolean);
    if (!urls.length) return json(res, 200, { properties: [] });
    const { rows } = await pool.query(
      `${rowSql} WHERE data->>'vrm_url' = ANY($1::text[]) OR data->>'url' = ANY($1::text[])`,
      [urls]
    );
    return json(res, 200, { properties: rows.map((r) => fromSupabase(r.data)) });
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
