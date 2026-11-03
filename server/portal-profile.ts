import { getNeonPool } from "./neon-db.js";

export type PortalProfile = {
  portalId: string | null;
  role: string | null;
  partner_role: string | null;
  name: string | null;
  partnerCount: number;
};

export async function resolvePortalProfile(email: string): Promise<PortalProfile> {
  const empty: PortalProfile = {
    portalId: null,
    role: null,
    partner_role: null,
    name: null,
    partnerCount: 0,
  };
  const key = String(email || "").trim().toLowerCase();
  if (!key) return empty;

  const pool = getNeonPool();
  const { rows: users } = await pool.query(
    `SELECT id, data FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
    [key]
  );
  const portal = users[0];
  const portalId = portal?.id ? String(portal.id) : null;
  const data = portal?.data || {};

  // Also match Better Auth session ids already stored on the partner (dual-id membership).
  const { rows: authUsers } = await pool.query(
    `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
    [key]
  );
  const authId = authUsers[0]?.id ? String(authUsers[0].id) : null;

  const { rows: partners } = await pool.query(
    `SELECT id FROM base44.partner
     WHERE ($1::text IS NOT NULL AND (
            data->>'portal_user_id' = $1
            OR data->'portal_user_ids' ? $1
          ))
        OR ($3::text IS NOT NULL AND (
            data->>'portal_user_id' = $3
            OR data->'portal_user_ids' ? $3
          ))
        OR lower(coalesce(data->>'primary_contact_email', '')) = $2
     LIMIT 5`,
    [portalId, key, authId]
  );

  return {
    portalId,
    role: data.role || null,
    partner_role: data.partner_role || null,
    name: data.full_name || data.name || null,
    partnerCount: partners.length,
  };
}

export function applyPortalProfile<T extends { role?: string | null; partner_role?: string | null; name?: string | null; mustChangePassword?: boolean | null }>(
  user: T,
  profile: PortalProfile
) {
  return {
    ...user,
    role: profile.role || user.role || "partner",
    partner_role: profile.partner_role || user.partner_role || "owner",
    portalId: profile.portalId,
    full_name: profile.name || user.name || "",
    hasPartnerAccess: profile.partnerCount > 0,
    mustChangePassword: !!user.mustChangePassword,
  };
}
