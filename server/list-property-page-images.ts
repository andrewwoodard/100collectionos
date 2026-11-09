import { getNeonPool, json } from "./neon-db.js";

const PAGE_SIZE_DEFAULT = 60;
const PAGE_SIZE_MAX = 200;

type BrowseBody = {
  search?: string;
  alt_filter?: "all" | "with_alt" | "missing_alt";
  partner?: string;
  limit?: number;
  offset?: number;
};

function sanitizeLike(raw: string): string {
  return raw.replace(/[%_\\]/g, "\\$&");
}

/**
 * Browse every photo used on property pages (propertiesbase44.images),
 * with alt text joined from image_metadata when the storage filename matches.
 */
export async function handleListPropertyPageImages(res: any, body: BrowseBody = {}) {
  const pool = getNeonPool();
  const search = String(body.search || "").trim();
  const altFilter = body.alt_filter === "with_alt" || body.alt_filter === "missing_alt"
    ? body.alt_filter
    : "all";
  const partner = String(body.partner || "").trim();
  const limit = Math.min(
    Math.max(Number(body.limit) || PAGE_SIZE_DEFAULT, 1),
    PAGE_SIZE_MAX,
  );
  const offset = Math.max(Number(body.offset) || 0, 0);

  const params: unknown[] = [];
  const where: string[] = [];
  let i = 1;

  if (search) {
    const like = `%${sanitizeLike(search)}%`;
    params.push(like);
    where.push(`(
      coalesce(a.alttext, '') ILIKE $${i}
      OR i.property_name ILIKE $${i}
      OR i.partner_name ILIKE $${i}
      OR i.destination ILIKE $${i}
    )`);
    i += 1;
  }

  if (altFilter === "with_alt") {
    where.push(`coalesce(a.alttext, '') <> ''`);
  } else if (altFilter === "missing_alt") {
    where.push(`coalesce(a.alttext, '') = ''`);
  }

  if (partner) {
    params.push(partner);
    where.push(`(i.partner_id = $${i} OR i.partner_name = $${i})`);
    i += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const cte = `
    WITH alt_by_file AS (
      SELECT DISTINCT ON (data->>'storage_path')
        data->>'storage_path' AS storage_path,
        nullif(trim(data->>'alttext'), '') AS alttext
      FROM supabase.image_metadata
      WHERE coalesce(data->>'storage_path', '') <> ''
      ORDER BY data->>'storage_path'
    ),
    imgs AS (
      SELECT
        p.id::text AS property_id,
        coalesce(p.name, '') AS property_name,
        coalesce(p.partner_name, '') AS partner_name,
        coalesce(p.partner_id::text, '') AS partner_id,
        coalesce(p.destination, '') AS destination,
        coalesce(p.url, '') AS property_url,
        coalesce(p.vrm_url, '') AS vrm_url,
        ord.ordinality::int AS image_index,
        img_url AS url,
        regexp_replace(img_url, '^.*/', '') AS filename
      FROM supabase.propertiesbase44 p
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p.images) = 'array' THEN p.images ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS ord(img_url, ordinality)
    )
  `;

  const countParams = [...params];
  const { rows: countRows } = await pool.query(
    `${cte}
     SELECT count(*)::int AS total
     FROM imgs i
     LEFT JOIN alt_by_file a ON a.storage_path = i.filename
     ${whereSql}`,
    countParams,
  );
  const total = countRows[0]?.total ?? 0;

  params.push(limit, offset);
  const { rows } = await pool.query(
    `${cte}
     SELECT
       i.property_id,
       i.property_name,
       i.partner_name,
       i.partner_id,
       i.destination,
       i.property_url,
       i.vrm_url,
       i.image_index,
       i.url,
       coalesce(a.alttext, '') AS alt
     FROM imgs i
     LEFT JOIN alt_by_file a ON a.storage_path = i.filename
     ${whereSql}
     ORDER BY i.property_name ASC, i.image_index ASC
     LIMIT $${i} OFFSET $${i + 1}`,
    params,
  );

  let partners: { id: string; name: string }[] = [];
  let catalogTotal = total;
  let catalogWithAlt = 0;

  // Only compute catalog/partner metadata on the first page of a browse session.
  if (offset === 0) {
    const [{ rows: partnerRows }, { rows: coverageRows }] = await Promise.all([
      pool.query(`
        SELECT DISTINCT coalesce(partner_name, '') AS name, coalesce(partner_id::text, '') AS id
        FROM supabase.propertiesbase44
        WHERE images IS NOT NULL
          AND jsonb_typeof(images) = 'array'
          AND jsonb_array_length(images) > 0
          AND coalesce(partner_name, '') <> ''
        ORDER BY 1
      `),
      pool.query(`
        WITH alt_by_file AS (
          SELECT DISTINCT ON (data->>'storage_path')
            data->>'storage_path' AS storage_path,
            nullif(trim(data->>'alttext'), '') AS alttext
          FROM supabase.image_metadata
          WHERE coalesce(data->>'storage_path', '') <> ''
          ORDER BY data->>'storage_path'
        ),
        imgs AS (
          SELECT regexp_replace(img_url, '^.*/', '') AS filename
          FROM supabase.propertiesbase44 p
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p.images) = 'array' THEN p.images ELSE '[]'::jsonb END
          ) AS img_url
        )
        SELECT
          (SELECT count(*)::int FROM imgs) AS catalog_total,
          (
            SELECT count(*)::int
            FROM imgs i
            LEFT JOIN alt_by_file a ON a.storage_path = i.filename
            WHERE a.alttext IS NOT NULL
          ) AS catalog_with_alt
      `),
    ]);

    partners = partnerRows.map((p) => ({
      id: p.id || p.name,
      name: p.name,
    }));
    catalogTotal = coverageRows[0]?.catalog_total ?? total;
    catalogWithAlt = coverageRows[0]?.catalog_with_alt ?? 0;
  }

  return json(res, 200, {
    items: rows.map((r) => ({
      id: `${r.property_id}-${r.image_index}`,
      url: r.url,
      alt: r.alt || "",
      hasAlt: Boolean(r.alt),
      index: Number(r.image_index) || 1,
      propertyId: r.property_id,
      propertyName: r.property_name,
      partnerId: r.partner_id || null,
      partnerName: r.partner_name,
      market: r.destination,
      propertyUrl: r.property_url,
      vrmUrl: r.vrm_url,
    })),
    total,
    limit,
    offset,
    catalog_total: catalogTotal,
    catalog_with_alt: catalogWithAlt,
    partners,
  });
}
