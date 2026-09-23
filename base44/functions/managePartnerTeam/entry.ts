import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Manages team membership for a partner.
// Actions: "remove_member" (pull user id from portal_user_ids),
//          "make_primary" (set portal_user_id + primary_contact_email).
// Accessible by admins and the primary contact.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, partner_id, user_id } = body;

    if (!action || !partner_id || !user_id) {
      return Response.json({ error: 'action, partner_id, and user_id are required' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let partner = null;
    try {
      const partners = await base44.asServiceRole.entities.Partner.filter({ id: partner_id });
      partner = partners?.[0];
    } catch (e) { /* not a Base44 entity */ }
    if (!partner) return Response.json({ error: 'Partner not found' }, { status: 404 });

    const userIds = Array.isArray(partner.portal_user_ids) && partner.portal_user_ids.length > 0
      ? [...partner.portal_user_ids]
      : (partner.portal_user_id ? [partner.portal_user_id] : []);
    const isAdmin = user.role === 'admin';
    if (!isAdmin && !userIds.includes(user.id)) {
      return Response.json({ error: 'You do not have access to this partner organization' }, { status: 403 });
    }
    const isOwner = (user.partner_role || 'owner') === 'owner';
    if (!isAdmin && !isOwner) {
      return Response.json({ error: 'Only the account owner can manage the team' }, { status: 403 });
    }

    if (action === 'remove_member') {
      // Can't remove the primary contact
      if (partner.portal_user_id === user_id) {
        return Response.json({ error: 'Cannot remove the primary contact. Promote another member first.' }, { status: 400 });
      }
      if (!userIds.includes(user_id)) {
        return Response.json({ error: 'User is not a team member' }, { status: 400 });
      }
      const newIds = userIds.filter(id => id !== user_id);
      await base44.asServiceRole.entities.Partner.update(partner_id, { portal_user_ids: newIds });
      return Response.json({ ok: true, portal_user_ids: newIds });
    }

    if (action === 'link_member') {
      const { confirm_transfer } = body;
      // Only partner-role users can be linked as team members
      let targetUser;
      try {
        targetUser = await base44.asServiceRole.entities.User.get(user_id);
      } catch (_) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }
      if (targetUser.role !== 'partner' && targetUser.role !== 'admin') {
        return Response.json({ error: 'Only partner- or admin-role users can be linked to a partner' }, { status: 400 });
      }

      // Guardrail: check if user is already in another partner's portal_user_ids
      const allPartners = await base44.asServiceRole.entities.Partner.list('-created_date', 500);
      const conflictingPartner = allPartners.find(p =>
        p.id !== partner_id &&
        Array.isArray(p.portal_user_ids) && p.portal_user_ids.includes(user_id)
      );

      if (conflictingPartner && !confirm_transfer) {
        return Response.json({
          conflict: true,
          other_partner_id: conflictingPartner.id,
          other_partner_name: conflictingPartner.partner_name,
        });
      }

      // If confirmed: remove user from the old partner first
      if (conflictingPartner && confirm_transfer) {
        const oldIds = Array.isArray(conflictingPartner.portal_user_ids)
          ? conflictingPartner.portal_user_ids.filter(id => id !== user_id)
          : [];
        const oldUpdate = { portal_user_ids: oldIds };
        if (conflictingPartner.portal_user_id === user_id) {
          oldUpdate.portal_user_id = null;
        }
        await base44.asServiceRole.entities.Partner.update(conflictingPartner.id, oldUpdate);
      }

      // Add to new partner (no duplicates)
      const newIds = userIds.includes(user_id) ? userIds : [...userIds, user_id];
      const newUpdate = { portal_user_ids: newIds };

      // If new partner has no primary contact, set this user as primary
      if (!partner.portal_user_id) {
        newUpdate.portal_user_id = user_id;
        newUpdate.primary_contact_email = targetUser.email || partner.primary_contact_email;
      }

      await base44.asServiceRole.entities.Partner.update(partner_id, newUpdate);
      return Response.json({ ok: true, linked: true });
    }

    if (action === 'make_primary') {
      if (!userIds.includes(user_id)) {
        return Response.json({ error: 'User is not a team member' }, { status: 400 });
      }
      // Fetch the user's email for primary_contact_email
      let email = partner.primary_contact_email;
      try {
        const targetUser = await base44.asServiceRole.entities.User.get(user_id);
        if (targetUser?.email) email = targetUser.email;
      } catch (_) {}
      await base44.asServiceRole.entities.Partner.update(partner_id, {
        portal_user_id: user_id,
        primary_contact_email: email,
      });
      return Response.json({ ok: true, portal_user_id: user_id, primary_contact_email: email });
    }

    if (action === 'change_role') {
      const { new_role } = body;
      if (!['owner', 'marketing', 'finance', 'operations'].includes(new_role)) {
        return Response.json({ error: 'Invalid role' }, { status: 400 });
      }
      // Can't change your own role
      if (user_id === user.id) {
        return Response.json({ error: 'You cannot change your own role' }, { status: 400 });
      }
      if (!userIds.includes(user_id)) {
        return Response.json({ error: 'User is not a team member' }, { status: 400 });
      }
      // Last owner protection: can't demote the last remaining owner
      if (new_role !== 'owner') {
        const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
        const teamUsers = userIds.map(uid => allUsers.find(u => u.id === uid)).filter(Boolean);
        const ownerCount = teamUsers.filter(u => (u.partner_role || 'owner') === 'owner').length;
        const targetUser = teamUsers.find(u => u.id === user_id);
        const targetIsOwner = targetUser && (targetUser.partner_role || 'owner') === 'owner';
        if (targetIsOwner && ownerCount <= 1) {
          return Response.json({ error: 'Cannot demote the last remaining owner. Promote another member first.' }, { status: 400 });
        }
      }
      await base44.asServiceRole.entities.User.update(user_id, { partner_role: new_role });
      // Notify the affected user
      let targetEmail = '';
      try {
        const targetUser = await base44.asServiceRole.entities.User.get(user_id);
        targetEmail = targetUser?.email || '';
      } catch (_) {}
      if (targetEmail) {
        await base44.asServiceRole.entities.PortalNotification.create({
          recipient_email: targetEmail,
          recipient_role: 'partner',
          type: 'general',
          title: 'Your role has been updated',
          message: `Your role has been changed to ${new_role.charAt(0).toUpperCase() + new_role.slice(1)} by ${user.full_name || user.email}.`,
          is_read: false,
        }).catch(() => {});
      }
      return Response.json({ ok: true, user_id, partner_role: new_role });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});