import { base44 } from "@/api/base44Client";

export async function managePartnerDirectory(partner, action) {
  const res = await base44.functions.invoke("managePartnerDirectory", {
    action,
    partner_id: partner?.id || null,
    base44_partner_id: partner?.base44_partner_id || null,
  });
  const body = res?.ok != null || res?.error ? res : res?.data;
  if (body?.error) {
    throw new Error(typeof body.error === "string" ? body.error : body.message || "Request failed");
  }
  if (!body?.ok) throw new Error(body?.message || "Partner could not be updated");
  return body;
}
