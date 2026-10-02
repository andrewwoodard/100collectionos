import { base44 } from "@/api/base44Client";

export async function fetchActivityFeed() {
  const res = await base44.functions.invoke("getActivityFeed", {});
  const body = res?.ok != null || res?.error || res?.items ? res : res?.data;
  if (body?.error) {
    throw new Error(typeof body.error === "string" ? body.error : body.message || "Could not load activity");
  }
  return {
    scope: body?.scope || "partner",
    items: Array.isArray(body?.items) ? body.items : [],
  };
}
