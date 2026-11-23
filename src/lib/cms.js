/**
 * Portal helper for Neon cms.* tables (destinations, vrms, properties).
 * Prefer this over supabaseData / Sanity for destination & VRM content.
 */
import { base44 } from "@/api/base44Client";

export async function cmsQuery(payload) {
  const res = await base44.functions.invoke("cmsData", payload);
  return res?.data || res;
}

export const cms = {
  list: (table, filters, search, limit) =>
    cmsQuery({ table, action: "list", filters, search, limit }),
  get: (table, id) => cmsQuery({ table, action: "get", id }),
  create: (table, data) => cmsQuery({ table, action: "create", data }),
  update: (table, id, data) => cmsQuery({ table, action: "update", id, data }),
  delete: (table, id) => cmsQuery({ table, action: "delete", id }),
  bulkCreate: (table, data) => cmsQuery({ table, action: "bulk_create", data }),
};
