import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns team members + pending invitations for a partner.
// Accessible by admins and any user already in portal_user_ids.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { partner_id } = body;

    if (!partner_id) return Response.json({ error: 'partner_id required' }, { status: 400 });

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Use filter with try/catch — .filter({ id }) can throw when the id
    // doesn't exist as a Base44 Partner entity (e.g. Supabase-only id)
    let partner = null;
    try {
      const partners = await base44.asServiceRole.entities.Partner.filter({ id: partner_id });
      partner = partners?.[0];
    } catch (e) {
      // Not a Base44 entity — treat as not found
    }
    if (!partner) return Response.json({ error: 'Partner not found' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    const userIds = Array.isArray(partner.portal_user_ids) && partner.portal_user_ids.length > 0
      ? partner.portal_user_ids
      : (partner.portal_user_id ? [partner.portal_user_id] : []);

    if (!isAdmin && !userIds.includes(user.id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve user details for all linked team members
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const teamMembers = userIds.map(uid => {
      const u = allUsers.find(x => x.id === uid);
      if (!u) return { id: uid, full_name: '', email: '', partner_role: 'owner' };
      return { id: u.id, full_name: u.full_name || '', email: u.email || '', partner_role: u.partner_role || 'owner' };
    }).filter(m => m.id);

    const invitations = await base44.asServiceRole.entities.PartnerInvitation.filter({ partner_id });

    return Response.json({
      ok: true,
      partner: {
        id: partner.id,
        partner_name: partner.partner_name,
        portal_user_id: partner.portal_user_id,
        portal_user_ids: userIds,
        primary_contact_email: partner.primary_contact_email,
      },
      teamMembers,
      invitations,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});