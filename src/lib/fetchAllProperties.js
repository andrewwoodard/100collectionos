import { base44 } from "@/api/base44Client";

/**
 * Fetches ALL Property records via paginated .list() calls.
 * Walks pages of 500 until every record is retrieved, so the
 * result is never silently truncated by a single-call limit.
 *
 * @param {string} sort - sort field, defaults to "-created_date"
 * @returns {Promise<Array>} all Property records
 */
export async function fetchAllProperties(sort = "-created_date") {
  const pageSize = 500;
  let all = [];
  let skip = 0;
  while (true) {
    const page = await base44.entities.Property.list(sort, pageSize, skip);
    all = all.concat(page);
    if (page.length < pageSize) break;
    skip += pageSize;
    if (skip > 10000) break; // hard safety
  }
  return all;
}