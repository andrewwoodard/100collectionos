import { json } from "./neon-db.js";
import { requireSession } from "./require-session.js";
import { applyPortalProfile, resolvePortalProfile } from "./portal-profile.js";

export async function handlePortalAccess(req: any, res: any) {
  try {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
    const gate = await requireSession(req);
    if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

    const user = gate.session.user;
    const profile = await resolvePortalProfile(user.email || "");
    const mapped = applyPortalProfile(user, profile);
    const isAdmin = mapped.role === "admin";
    return json(res, 200, {
      role: mapped.role,
      partner_role: mapped.partner_role,
      portalId: mapped.portalId,
      hasPartnerAccess: mapped.hasPartnerAccess,
      access: isAdmin || mapped.hasPartnerAccess,
    });
  } catch (error: any) {
    console.error("[portal-access]", error);
    return json(res, 500, { error: error.message || "Access check failed" });
  }
}
