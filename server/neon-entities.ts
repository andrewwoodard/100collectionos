import { getNeonPool, json, newId, readBody, toSnake } from "./neon-db.ts";

function toRecord(row: any) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return {
    ...data,
    id: row.id,
    created_date: row.created_date || data.created_date,
    updated_date: row.updated_date || data.updated_date,
    created_by: row.created_by ?? data.created_by,
    created_by_id: row.created_by_id ?? data.created_by_id,
    is_sample: row.is_sample ?? data.is_sample ?? false,
  };
}

function buildFilter(query: any, startIndex = 1) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return { sql: "", params: [] as any[] };
  }
  const clauses: string[] = [];
  const params: any[] = [];
  let i = startIndex;

  const addEq = (field: string, value: any) => {
    params.push(field, JSON.stringify(value), value == null ? "" : String(value));
    const f = `$${i++}`;
    const j = `$${i++}`;
    const t = `$${i++}`;
    clauses.push(`(data->${f} = ${j}::jsonb OR data->>${f} = ${t})`);
  };

  for (const [field, value] of Object.entries(query)) {
    if (field === "$or" && Array.isArray(value)) {
      const parts: string[] = [];
      for (const item of value) {
        const inner = buildFilter(item, i);
        if (!inner.sql) continue;
        parts.push(`(${inner.sql})`);
        params.push(...inner.params);
        i += inner.params.length;
      }
      if (parts.length) clauses.push(`(${parts.join(" OR ")})`);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Array.isArray((value as any).$in)) {
        const arr = (value as any).$in.map(String);
        params.push(field, arr, arr);
        const f = `$${i++}`;
        const a1 = `$${i++}`;
        const a2 = `$${i++}`;
        clauses.push(
          `(data->${f} ?| ${a1}::text[] OR data->>${f} = ANY(${a2}::text[]))`
        );
        continue;
      }
      if ("$ne" in (value as any)) {
        params.push(field, JSON.stringify((value as any).$ne));
        clauses.push(`NOT (data->$${i++} = $${i++}::jsonb)`);
        continue;
      }
    }
    addEq(field, value);
  }

  return { sql: clauses.join(" AND "), params };
}

function sortSql(sort?: string | null) {
  if (!sort) return "ORDER BY created_date DESC NULLS LAST";
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? "DESC" : "ASC";
  if (["created_date", "updated_date", "id"].includes(field)) {
    return `ORDER BY ${field} ${dir} NULLS LAST`;
  }
  return `ORDER BY data->>'${field.replace(/'/g, "''")}' ${dir} NULLS LAST`;
}

export async function handleNeonEntity(req: any, res: any, entityName: string, restPath: string, search: URLSearchParams) {
  const table = `"${toSnake(entityName).replace(/"/g, '""')}"`;
  const pool = getNeonPool();
  const method = (req.method || "GET").toUpperCase();
  const rest = (restPath || "").replace(/\/$/, "");

  try {
    if (method === "GET" && (rest === "me" || rest.endsWith("/me"))) {
      return json(res, 401, { message: "Use Better Auth session" });
    }

    if (method === "GET" && rest === "count") {
      const filter = search.get("q") ? JSON.parse(search.get("q") as string) : null;
      const built = buildFilter(filter);
      const where = built.sql ? `WHERE ${built.sql}` : "";
      const { rows } = await pool.query(
        `SELECT count(*)::int AS count FROM base44.${table} ${where}`,
        built.params
      );
      return json(res, 200, { count: rows[0].count });
    }

    if (method === "GET" && (rest === "v2/list" || rest === "v2/list/")) {
      const filter = search.get("q") ? JSON.parse(search.get("q") as string) : null;
      const built = buildFilter(filter);
      const where = built.sql ? `WHERE ${built.sql}` : "";
      const limit = Math.min(Number(search.get("limit") || 100), 1000);
      const skip = Number(search.get("cursor") || 0) || 0;
      const { rows } = await pool.query(
        `SELECT * FROM base44.${table} ${where} ${sortSql(search.get("sort"))} LIMIT $${built.params.length + 1} OFFSET $${built.params.length + 2}`,
        [...built.params, limit, skip]
      );
      const items = rows.map(toRecord);
      return json(res, 200, {
        items,
        has_more: items.length === limit,
        next_cursor: items.length === limit ? String(skip + limit) : null,
      });
    }

    if (method === "GET" && !rest) {
      const filter = search.get("q") ? JSON.parse(search.get("q") as string) : null;
      const built = buildFilter(filter);
      const where = built.sql ? `WHERE ${built.sql}` : "";
      const limit = Math.min(Number(search.get("limit") || 100), 5000);
      const skip = Number(search.get("skip") || 0);
      const { rows } = await pool.query(
        `SELECT * FROM base44.${table} ${where} ${sortSql(search.get("sort"))} LIMIT $${built.params.length + 1} OFFSET $${built.params.length + 2}`,
        [...built.params, limit, skip]
      );
      return json(res, 200, rows.map(toRecord));
    }

    if (method === "GET" && rest) {
      const { rows } = await pool.query(`SELECT * FROM base44.${table} WHERE id = $1`, [rest]);
      if (!rows[0]) return json(res, 404, { message: "Not found" });
      return json(res, 200, toRecord(rows[0]));
    }

    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};

    if (method === "POST" && rest === "bulk") {
      const records = Array.isArray(body) ? body : body.records || [];
      const created = [];
      for (const item of records) {
        const id = item.id || newId();
        const data = { ...item, id };
        const { rows } = await pool.query(
          `INSERT INTO base44.${table} (id, created_date, updated_date, created_by, created_by_id, is_sample, data)
           VALUES ($1, now(), now(), $2, $3, $4, $5::jsonb)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = now()
           RETURNING *`,
          [id, item.created_by || null, item.created_by_id || null, !!item.is_sample, JSON.stringify(data)]
        );
        created.push(toRecord(rows[0]));
      }
      return json(res, 200, created);
    }

    if (method === "POST" && !rest) {
      const id = body.id || newId();
      const data = { ...body, id };
      const { rows } = await pool.query(
        `INSERT INTO base44.${table} (id, created_date, updated_date, created_by, created_by_id, is_sample, data)
         VALUES ($1, now(), now(), $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [id, body.created_by || null, body.created_by_id || null, !!body.is_sample, JSON.stringify(data)]
      );
      return json(res, 200, toRecord(rows[0]));
    }

    if (method === "PUT" && rest === "bulk") {
      const records = Array.isArray(body) ? body : [];
      const updated = [];
      for (const item of records) {
        if (!item.id) continue;
        const { rows } = await pool.query(
          `UPDATE base44.${table}
           SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
           WHERE id = $1
           RETURNING *`,
          [item.id, JSON.stringify(item)]
        );
        if (rows[0]) updated.push(toRecord(rows[0]));
      }
      return json(res, 200, updated);
    }

    if ((method === "PUT" || method === "PATCH") && rest && rest !== "update-many") {
      const { rows } = await pool.query(
        `UPDATE base44.${table}
         SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
         WHERE id = $1
         RETURNING *`,
        [rest, JSON.stringify(body)]
      );
      if (!rows[0]) return json(res, 404, { message: "Not found" });
      return json(res, 200, toRecord(rows[0]));
    }

    if (method === "DELETE" && rest) {
      await pool.query(`DELETE FROM base44.${table} WHERE id = $1`, [rest]);
      return json(res, 200, { success: true });
    }

    return json(res, 404, { message: `Unhandled ${method} ${entityName}/${rest}` });
  } catch (error: any) {
    console.error("[neon-entities]", entityName, error);
    return json(res, 500, { message: error.message || "Neon entity error" });
  }
}
