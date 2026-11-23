/**
 * Portal CRUD against Neon cms.* tables (destinations, vrms, properties).
 * These are the portal source of truth — not Sanity (except travel posts) and
 * not classic Supabase.
 */
import { getNeonPool, json, newId, quoteIdent } from "./neon-db.js";
import { requireSession } from "./require-session.js";

const CMS_TABLES = new Set(["destinations", "vrms", "properties"]);

const DEST_COLUMNS = new Set([
  "id", "base44_destination_id", "supabase_destination_id", "name", "slug", "title",
  "is_exclusive", "geocode_query", "latitude", "longitude",
  "seo_title", "seo_description", "short_description", "area_descriptor", "area", "region",
  "states", "season_info", "months", "temporary_vrm_url", "video_url", "destination_not_on",
  "location_lat", "location_lng", "body_json", "body_text",
  "main_image_url", "map_image_url", "footer_image_url",
  "main_image_json", "map_image_json", "footer_image_json", "slider_images_json",
  "category_titles", "destination_type_titles", "experience_titles",
  "categories_json", "destination_types_json", "experiences_json",
  "sanity_id", "sanity_rev", "sanity_created_at", "sanity_updated_at",
  "created_at", "updated_at", "synced_at", "source",
]);

const VRM_COLUMNS = new Set([
  "id", "source_id", "name", "slug", "title", "partner_name", "email", "phone",
  "vrm_email", "vrm_phone", "vrm_url", "website", "source", "first_destination_slug",
  "destination_slugs", "unit_count", "onboarded", "is_onboarded", "show_properties",
  "doyen_name", "doyen_title", "doyen_short_description", "doyen_text", "doyen_or_doyenne",
  "doyen_image_url", "logo_image_url", "main_image_url",
  "attribute_one", "attribute_two", "bedrooms", "price", "prop_class", "video_url",
  "vrm_not_on", "published_at",
  "body_json", "body_text", "doyentext_json", "favorites_json", "showcase_json",
  "services_offered_json", "services_available_json", "services_offered_picks_json",
  "awards_json", "gallery_json", "slider_images_json", "categories_json", "destinations_json",
  "video_json", "doyen_image_json", "logo_image_json", "main_image_json",
  "last_header_ok", "last_header_has_link", "last_header_status", "last_header_error",
  "last_header_final_url", "last_header_checked_at",
  "last_trademark_ok", "last_trademark_status", "last_trademark_error",
  "last_trademark_final_url", "last_trademark_checked_at",
  "sanity_id", "sanity_vrm_id", "sanity_rev", "sanity_created_at", "sanity_updated_at",
  "created_at", "updated_at", "synced_at",
]);

const PROP_COLUMNS = new Set([
  "id", "row_id", "source_id", "base44_property_id", "supabase_property_id", "sanity_showcase_key",
  "name", "property_name", "slug", "url", "listing_url", "vrm_url", "hundred_collection_url",
  "partner_id", "partner_name", "destination", "market",
  "address", "location_full", "location_city", "location_state", "location_country",
  "latitude", "longitude",
  "bedrooms", "bathrooms", "half_bathrooms", "occupancy", "sleeps", "house_type", "property_type",
  "pet_friendly", "pet_policy_url",
  "status", "active", "portal_visible", "onboarding_status", "photography_status",
  "launch_date", "removal_date", "termination_date", "last_scan",
  "headline", "excerpt", "short_summary", "text", "description",
  "unique_feature", "unique_features", "why_onehundred", "why_100_collection", "best_fit_guest",
  "designed_by", "designer_name", "design_style_notes", "property_source", "property_html",
  "ai_search", "ai_fit_score", "photo_count", "property_image", "video_url", "internal_notes",
  "showcase_name", "showcase_roomcount", "showcase_occupancy", "showcase_property_link",
  "showcase_propvideo", "showcase_images_json",
  "images", "vrm_images", "photo_urls", "photo_alt_texts", "amenities", "filtered_amenities",
  "categories", "prop_categories", "tags", "reviews", "propdescription",
  "last_page_check_at", "last_page_check_ok", "last_page_check_status",
  "last_page_check_error", "last_page_check_final_url",
  "archived_at", "archived_by_user_id", "offboarding_status", "offboarding_reason",
  "offboarding_initiated_at", "offboarding_initiated_by", "offboarding_approved_at",
  "offboarding_approved_by",
  "created_at", "updated_at", "synced_at", "source",
]);

const TABLE_COLUMNS: Record<string, Set<string>> = {
  destinations: DEST_COLUMNS,
  vrms: VRM_COLUMNS,
  properties: PROP_COLUMNS,
};

const JSONB_COLUMNS = new Set([
  "months", "body_json", "main_image_json", "map_image_json", "footer_image_json",
  "slider_images_json", "category_titles", "destination_type_titles", "experience_titles",
  "categories_json", "destination_types_json", "experiences_json", "destination_slugs",
  "doyentext_json", "favorites_json", "showcase_json", "services_offered_json",
  "services_available_json", "services_offered_picks_json", "awards_json", "gallery_json",
  "destinations_json", "video_json", "doyen_image_json", "logo_image_json",
  "images", "vrm_images", "photo_urls", "photo_alt_texts", "amenities", "filtered_amenities",
  "categories", "prop_categories", "tags", "reviews", "propdescription", "showcase_images_json",
]);

const SEARCH_FIELDS: Record<string, string[]> = {
  destinations: ["name", "slug", "title", "area", "region", "states"],
  vrms: ["name", "slug", "title", "partner_name", "doyen_name"],
  properties: ["name", "property_name", "partner_name", "destination", "market", "url", "vrm_url"],
};

const ORDER_BY: Record<string, string> = {
  destinations: "name ASC NULLS LAST",
  vrms: "partner_name ASC NULLS LAST, name ASC NULLS LAST",
  properties: "updated_at DESC NULLS LAST, created_at DESC NULLS LAST",
};

function jsonParam(value: any) {
  if (value == null || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function pickColumns(data: Record<string, any> | null | undefined, allowed: Set<string>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
    if (!allowed.has(key)) continue;
    if (JSONB_COLUMNS.has(key)) {
      if (value == null || value === "") out[key] = null;
      else if (typeof value === "string") {
        const trimmed = value.trim();
        out[key] =
          trimmed.startsWith("{") || trimmed.startsWith("[") ? trimmed : JSON.stringify(value);
      } else out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function buildInsert(tableSql: string, record: Record<string, any>) {
  const cols = Object.keys(record);
  const params = cols.map((col) => (JSONB_COLUMNS.has(col) ? jsonParam(record[col]) : record[col]));
  const placeholders = cols.map((col, i) => (JSONB_COLUMNS.has(col) ? `$${i + 1}::jsonb` : `$${i + 1}`));
  return {
    sql: `INSERT INTO ${tableSql} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    params,
  };
}

function buildUpdate(tableSql: string, record: Record<string, any>, whereSql: string, whereParams: any[]) {
  const cols = Object.keys(record);
  const params = [...whereParams];
  const sets = cols.map((col) => {
    params.push(JSONB_COLUMNS.has(col) ? jsonParam(record[col]) : record[col]);
    return `${quoteIdent(col)} = $${params.length}${JSONB_COLUMNS.has(col) ? "::jsonb" : ""}`;
  });
  sets.push(`updated_at = now()`);
  sets.push(`synced_at = now()`);
  return {
    sql: `UPDATE ${tableSql} SET ${sets.join(", ")} WHERE ${whereSql} RETURNING *`,
    params,
  };
}

function buildFilters(filters: Record<string, any> | null | undefined, allowed: Set<string>, start = 1) {
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

function slugify(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Keep Base44 destination entity in sync for partner market matching. */
async function mirrorDestinationToBase44(row: Record<string, any>) {
  if (!row?.name) return;
  const pool = getNeonPool();
  const base44Id = row.base44_destination_id || null;
  const payload = {
    name: row.name,
    slug: row.slug || slugify(row.name),
    is_exclusive: !!row.is_exclusive,
    geocode_query: row.geocode_query || null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  };
  if (base44Id) {
    await pool.query(
      `UPDATE base44.destination
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
           updated_date = now()
       WHERE id = $1`,
      [base44Id, JSON.stringify({ ...payload, id: base44Id, updated_date: new Date().toISOString() })]
    );
    return base44Id;
  }
  const { rows: existing } = await pool.query(
    `SELECT id FROM base44.destination
     WHERE lower(data->>'name') = lower($1) OR data->>'slug' = $2
     LIMIT 1`,
    [row.name, payload.slug]
  );
  if (existing[0]?.id) {
    await pool.query(
      `UPDATE base44.destination
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
           updated_date = now()
       WHERE id = $1`,
      [existing[0].id, JSON.stringify({ ...payload, id: existing[0].id, updated_date: new Date().toISOString() })]
    );
    return existing[0].id;
  }
  const id = newId();
  await pool.query(
    `INSERT INTO base44.destination (id, created_date, updated_date, data)
     VALUES ($1, now(), now(), $2::jsonb)`,
    [
      id,
      JSON.stringify({
        ...payload,
        id,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      }),
    ]
  );
  return id;
}

export async function handleCmsData(req: any, res: any, body: any = {}) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const table = String(body.table || "");
  if (!CMS_TABLES.has(table)) {
    return json(res, 400, { error: `Unknown cms table: ${table}` });
  }

  const allowed = TABLE_COLUMNS[table];
  const pool = getNeonPool();
  const tableSql = `cms.${quoteIdent(table)}`;
  const { action, id, data, filters, search, limit } = body || {};
  const built = buildFilters(filters, allowed);
  const clauses = built.sql ? [built.sql] : [];
  const params = [...built.params];
  let i = built.next;

  const searchFields = SEARCH_FIELDS[table] || [];
  if (search && searchFields.length) {
    params.push(`%${search}%`);
    clauses.push(`(${searchFields.map((field) => `${quoteIdent(field)} ILIKE $${i}`).join(" OR ")})`);
    i += 1;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    if (action === "list") {
      const lim = Math.min(Number(limit || 500), 5000);
      params.push(lim);
      const { rows } = await pool.query(
        `SELECT * FROM ${tableSql} ${where} ORDER BY ${ORDER_BY[table] || "id ASC"} LIMIT $${i}`,
        params
      );
      return json(res, 200, { items: rows });
    }

    if (action === "get") {
      let sql = `SELECT * FROM ${tableSql} WHERE id = $1 OR slug = $1`;
      if (table === "destinations") sql += ` OR base44_destination_id = $1`;
      if (table === "properties") {
        sql += ` OR base44_property_id = $1 OR supabase_property_id = $1 OR url = $1 OR vrm_url = $1`;
      }
      if (table === "vrms") sql += ` OR partner_name = $1 OR sanity_id = $1`;
      sql += ` LIMIT 1`;
      const { rows } = await pool.query(sql, [String(id)]);
      if (!rows[0]) return json(res, 404, { error: "Not found" });
      return json(res, 200, { item: rows[0] });
    }

    if (action === "create") {
      const record = pickColumns(data, allowed);
      const rowId = String(data?.id || `${table.slice(0, 3)}:${newId()}`);
      if (!record.created_at) record.created_at = new Date().toISOString();
      record.updated_at = new Date().toISOString();
      record.synced_at = new Date().toISOString();
      if (table === "destinations" && !record.slug && record.name) record.slug = slugify(record.name);
      if (table === "destinations" && !record.source) record.source = "portal";

      if (table === "destinations") {
        const base44Id = await mirrorDestinationToBase44({ ...record, id: rowId });
        if (base44Id) record.base44_destination_id = base44Id;
      }

      const insert = buildInsert(tableSql, { id: rowId, ...record });
      const { rows } = await pool.query(insert.sql, insert.params);

      if (table === "destinations" && rows[0] && !rows[0].base44_destination_id) {
        const base44Id = await mirrorDestinationToBase44(rows[0]);
        if (base44Id) {
          const { rows: updated } = await pool.query(
            `UPDATE cms.destinations SET base44_destination_id = $2 WHERE id = $1 RETURNING *`,
            [rows[0].id, base44Id]
          );
          return json(res, 200, { item: updated[0] || rows[0] });
        }
      }
      return json(res, 200, { item: rows[0] });
    }

    if (action === "update") {
      const record = pickColumns(data, allowed);
      delete record.id;
      if (!Object.keys(record).length) return json(res, 400, { error: "No updatable fields" });
      const update = buildUpdate(tableSql, record, "id = $1", [String(id)]);
      const { rows } = await pool.query(update.sql, update.params);
      if (!rows[0]) return json(res, 404, { error: "Not found" });

      if (table === "destinations") {
        const base44Id = await mirrorDestinationToBase44(rows[0]);
        if (base44Id && rows[0].base44_destination_id !== base44Id) {
          const { rows: updated } = await pool.query(
            `UPDATE cms.destinations SET base44_destination_id = $2 WHERE id = $1 RETURNING *`,
            [rows[0].id, base44Id]
          );
          return json(res, 200, { item: updated[0] || rows[0] });
        }
      }
      return json(res, 200, { item: rows[0] });
    }

    if (action === "delete") {
      await pool.query(`DELETE FROM ${tableSql} WHERE id = $1`, [String(id)]);
      return json(res, 200, { success: true });
    }

    if (action === "bulk_create") {
      const items = [];
      for (const item of data || []) {
        const record = pickColumns(item, allowed);
        const rowId = String(item?.id || `${table.slice(0, 3)}:${newId()}`);
        if (!record.created_at) record.created_at = new Date().toISOString();
        record.updated_at = new Date().toISOString();
        record.synced_at = new Date().toISOString();
        if (table === "destinations" && !record.slug && record.name) record.slug = slugify(record.name);
        if (table === "destinations" && !record.source) record.source = "portal";
        if (table === "destinations") {
          const base44Id = await mirrorDestinationToBase44({ ...record, id: rowId });
          if (base44Id) record.base44_destination_id = base44Id;
        }
        const insert = buildInsert(tableSql, { id: rowId, ...record });
        const { rows } = await pool.query(insert.sql, insert.params);
        items.push(rows[0]);
      }
      return json(res, 200, { items, count: items.length });
    }

    return json(res, 400, { error: "Unknown action" });
  } catch (error: any) {
    console.error("[cmsData]", table, action, error);
    return json(res, 500, { error: error?.message || "cmsData failed" });
  }
}
