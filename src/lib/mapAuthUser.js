/**
 * Map a Better Auth user onto the shape the portal already expects
 * (Base44 User: full_name, role, partner_role).
 */
export function mapAuthUser(user) {
  if (!user) return null;
  const devAdmin = import.meta.env.VITE_AUTH_DEV_ADMIN === "true";
  return {
    ...user,
    full_name: user.full_name || user.name || "",
    role: devAdmin ? "admin" : user.role || "partner",
    partner_role: user.partner_role || "owner",
    portalId: user.portalId || null,
    hasPartnerAccess: !!user.hasPartnerAccess,
  };
}
