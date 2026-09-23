import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Accept flow for PartnerInvitations.
// Actions:
//   "lookup" — no auth required, returns invitation details for the landing page.
//   "accept" — requires auth, links the user to the partner, sets role=partner,
//              marks invitation accepted, fires a notification to the primary contact.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, token } = body;

    if (!action || !token) return Response.json({ error: 'action and token required' }, { status: 400 });

    const invitations = await base44.asServiceRole.entities.PartnerInvitation.filter({ token });
    const inv = invitations[0];
    if (!inv) return Response.json({ error: 'not_found' }, { status: 404 });

    let partner = null;
    try {
      const partners = await base44.asServiceRole.entities.Partner.filter({ id: inv.partner_id });
      partner = partners?.[0];
    } catch (e) { /* not a Base44 entity */ }
    if (!partner) return Response.json({ error: 'Partner not found' }, { status: 404 });

    // ── LOOKUP (no auth) ──────────────────────────────────────────────
    if (action === 'lookup') {
      let status = inv.status;
      if (status === 'pending' && new Date(inv.expires_at) < new Date()) {
        status = 'expired';
      }
      return Response.json({
        ok: true,
        status,
        email: inv.email,
        partner_name: partner?.partner_name || '',
        invited_by_name: inv.invited_by_name || '',
        expires_at: inv.expires_at,
        invitation_type: inv.invitation_type || 'teammate',
      });
    }

    // ── ACCEPT (auth required) ───────────────────────────────────────
    if (action === 'accept') {
      let user = null;
      let authDetail = null;
      try {
        user = await base44.auth.me();
      } catch (e) {
        authDetail = e.message || String(e);
      }
      console.log('[acceptPartnerInvitation] User authenticated at accept:', { email: user?.email, id: user?.id });
      if (!user) {
        const isPlatformGate = authDetail && (
          authDetail.includes('not_registered') ||
          authDetail.includes('not authorized') ||
          authDetail.includes('forbidden') ||
          authDetail.includes('Forbidden')
        );
        console.warn('acceptPartnerInvitation auth failed', {
          authDetail,
          hasAuthHeader: !!req.headers.get('authorization'),
          invitationEmail: inv.email,
          isPlatformGate,
        });
        return Response.json({
          error: isPlatformGate ? 'platform_gate_hit' : 'auth_required',
          detail: authDetail,
        }, { status: 401 });
      }

      if (inv.status === 'accepted') return Response.json({ error: 'already_accepted' }, { status: 400 });
      if (inv.status === 'revoked') return Response.json({ error: 'revoked' }, { status: 400 });
      if (new Date(inv.expires_at) < new Date()) return Response.json({ error: 'expired' }, { status: 400 });

      // Email must match (case-insensitive — emails are not case-sensitive).
      // Admins are trusted and may accept any pending invitation (e.g. to grant
      // themselves portal access to a partner for testing/support), so we skip
      // the email gate for them.
      const isCallerAdmin = user.role === 'admin';
      if (!isCallerAdmin && (user.email || '').trim().toLowerCase() !== (inv.email || '').trim().toLowerCase()) {
        return Response.json({ error: 'email_mismatch', expected: inv.email }, { status: 400 });
      }

      // Multi-partner access: a user may be linked to multiple partners.
      // The portal already unions all partners via portal_user_ids, so we
      // simply add this partner to the user's linked set.

      // Determine invitation type
      const isPrimaryActivation = (inv.invitation_type || 'teammate') === 'primary_activation';

      // Link user to this partner
      const userIds = Array.isArray(partner.portal_user_ids) && partner.portal_user_ids.length > 0
        ? [...partner.portal_user_ids]
        : (partner.portal_user_id ? [partner.portal_user_id] : []);
      if (!userIds.includes(user.id)) userIds.push(user.id);

      const partnerUpdate = { portal_user_ids: userIds };
      if (isPrimaryActivation) {
        partnerUpdate.portal_user_id = user.id;
      }

      await base44.asServiceRole.entities.Partner.update(inv.partner_id, partnerUpdate);

      // Set partner_role from the invitation. Preserve admin role — admins who
      // accept an invitation keep their admin privileges and simply gain portal
      // access to this partner.
      const userUpdate = { partner_role: inv.partner_role || 'operations' };
      if (user.role !== 'partner' && user.role !== 'admin') userUpdate.role = 'partner';
      await base44.asServiceRole.entities.User.update(user.id, userUpdate);

      // Mark invitation accepted
      await base44.asServiceRole.entities.PartnerInvitation.update(inv.id, {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: user.id,
      });

      if (isPrimaryActivation) {
        // Notify admins that partner activated their portal
        const dedupKey = `${inv.id}__activated`;
        const existingNotif = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
        if (existingNotif.length === 0) {
          await base44.asServiceRole.entities.PortalNotification.create({
            recipient_role: 'admin',
            recipient_email: 'admin',
            type: 'general',
            title: `${partner.partner_name} just activated their portal`,
            message: `${user.full_name || user.email} activated the portal for ${partner.partner_name}.`,
            submission_id: inv.id,
            property_name: partner.partner_name,
            is_read: false,
            dedup_key: dedupKey,
            link: `/PartnerDetail?id=${inv.partner_id}`,
          });
        }
      } else if (partner?.portal_user_id) {
        // Notify primary contact (teammate invitation)
        const dedupKey = `${inv.id}__accepted`;
        const existingNotif = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
        if (existingNotif.length === 0) {
          let primaryEmail = partner.primary_contact_email;
          try {
            const primaryUser = await base44.asServiceRole.entities.User.get(partner.portal_user_id);
            if (primaryUser?.email) primaryEmail = primaryUser.email;
          } catch (_) {}
          if (primaryEmail) {
            await base44.asServiceRole.entities.PortalNotification.create({
              recipient_email: primaryEmail,
              recipient_role: 'partner',
              type: 'general',
              title: 'Team member joined',
              message: `${user.full_name || user.email} accepted your invitation and joined ${partner.partner_name}'s team.`,
              submission_id: inv.id,
              property_name: partner.partner_name,
              is_read: false,
              dedup_key: dedupKey,
              link: `/PartnerDetail?id=${inv.partner_id}&tab=portal`,
            });
          }
        }
      }

      // Notify admins that a teammate / primary contact joined (idempotent)
      try {
        await base44.functions.invoke('notifyAdminsInvitationAccepted', {
          invitation_id: inv.id,
          partner_id: inv.partner_id,
          partner_name: partner?.partner_name || '',
          user_name: user.full_name || '',
          user_email: user.email || '',
          invited_by_name: inv.invited_by_name || '',
          is_primary_activation: isPrimaryActivation,
        });
      } catch (e) {
        console.warn('[acceptPartnerInvitation] admin notify failed:', e.message);
      }

      // Send follow-up welcome + FYI emails (non-blocking)
      try {
        await base44.functions.invoke('sendInvitationAcceptedEmails', {
          invitation_id: inv.id,
          is_primary_activation: isPrimaryActivation,
          user_id: user.id,
          partner_id: inv.partner_id,
        });
      } catch (e) {
        console.warn('[acceptPartnerInvitation] invitee follow-up email failed:', e.message);
      }

      return Response.json({ ok: true, redirect: '/portal/dashboard' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});