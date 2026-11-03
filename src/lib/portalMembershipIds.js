/**
 * IDs that may appear on Partner.portal_user_ids for the current user.
 * Better Auth session id and Base44 portal user id can both be stored;
 * property/partner lookups must match either.
 */
export function portalMembershipIds(user) {
  if (!user) return [];
  const ids = [user.id, user.portalId]
    .map((id) => (id == null ? "" : String(id).trim()))
    .filter(Boolean);
  return [...new Set(ids)];
}
