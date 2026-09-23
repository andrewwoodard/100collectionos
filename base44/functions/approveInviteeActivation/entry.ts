import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Admin-only: approve a pending invitee from the Admin Hub → Invitations tab.
//   1. Pre-authorize the platform account (inviteUser sends the set-your-password email).
//   2. Link the user to the partner now → portal activated.
//   3. Mark the invitation accepted (admin approved it on the invitee's behalf).
//   4. Send the branded activation email with a login link.
//
// Input: { invitation_id }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { invitation_id } = body;
    if (!invitation_id) return Response.json({ error: 'invitation_id required' }, { status: 400 });

    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const invitations = await base44.asServiceRole.entities.PartnerInvitation.filter({ id: invitation_id });
    const inv = invitations?.[0];
    if (!inv) return Response.json({ error: 'Invitation not found' }, { status: 404 });
    if (inv.status === 'accepted') return Response.json({ error: 'This invitation has already been accepted.' }, { status: 400 });
    if (inv.status === 'revoked') return Response.json({ error: 'This invitation has been revoked.' }, { status: 400 });

    const email = inv.email;
    if (!email) return Response.json({ error: 'Invitation has no email address.' }, { status: 400 });

    let partner = null;
    try {
      const partners = await base44.asServiceRole.entities.Partner.filter({ id: inv.partner_id });
      partner = partners?.[0];
    } catch (_) {}
    if (!partner) return Response.json({ error: 'Partner not found.' }, { status: 404 });

    const isPrimaryActivation = (inv.invitation_type || 'teammate') === 'primary_activation';
    const partnerName = partner.partner_name || 'your partner';
    const firstName = (partner.primary_contact_name || email.split('@')[0] || 'there').split(' ')[0]?.trim() || 'there';

    // 1. Pre-authorize the platform account — sends the set-your-password email.
    let inviteStatus = 'sent';
    try {
      await base44.users.inviteUser(email, 'user');
    } catch (e) {
      // Usually means the user already exists (previously invited/registered).
      inviteStatus = 'exists';
      console.warn('[approveInviteeActivation] inviteUser skipped:', e?.message);
    }

    // 2. Find the user by email and link them to the partner (activate portal).
    let linkedUser = null;
    try {
      const byEmail = await base44.asServiceRole.entities.User.filter({ email });
      linkedUser = byEmail?.[0] || null;
    } catch (_) {}
    if (!linkedUser) {
      try {
        const all = await base44.asServiceRole.entities.User.list('-created_date', 500);
        const norm = String(email).trim().toLowerCase();
        linkedUser = (all || []).find(u => u.email && String(u.email).trim().toLowerCase() === norm) || null;
      } catch (_) {}
    }

    let linked = false;
    if (linkedUser) {
      const ids = Array.isArray(partner.portal_user_ids) && partner.portal_user_ids.length > 0
        ? [...partner.portal_user_ids]
        : (partner.portal_user_id ? [partner.portal_user_id] : []);
      if (!ids.includes(linkedUser.id)) ids.push(linkedUser.id);
      const partnerPatch = { portal_user_ids: ids };
      if (isPrimaryActivation || !partner.portal_user_id) partnerPatch.portal_user_id = linkedUser.id;
      try {
        await base44.asServiceRole.entities.Partner.update(partner.id, partnerPatch);
        linked = true;
      } catch (e) {
        console.warn('[approveInviteeActivation] partner link failed:', e?.message);
      }

      const userPatch = {};
      if (linkedUser.role !== 'partner' && linkedUser.role !== 'admin') userPatch.role = 'partner';
      const desiredRole = inv.partner_role || (isPrimaryActivation ? 'owner' : 'operations');
      if (!linkedUser.partner_role) userPatch.partner_role = desiredRole;
      if (Object.keys(userPatch).length > 0) {
        try {
          await base44.asServiceRole.entities.User.update(linkedUser.id, userPatch);
        } catch (e) {
          console.warn('[approveInviteeActivation] user role update failed:', e?.message);
        }
      }
    }

    // 3. Mark the invitation accepted (admin approved on the invitee's behalf).
    try {
      await base44.asServiceRole.entities.PartnerInvitation.update(inv.id, {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: caller.id,
      });
    } catch (e) {
      console.warn('[approveInviteeActivation] invitation mark failed:', e?.message);
    }

    // 4. Send the branded activation email with a login link (accept link is moot
    //    now that the invitation is accepted).
    const loginUrl = 'https://100c-os.base44.app/login';
    const context = {
      partner: {
        partner_name: partnerName,
        primary_contact_name: partner.primary_contact_name || '',
        primary_contact_email: email,
        market: partner.market || '',
        partner_type: partner.partner_type || '',
      },
      inviter: { name: caller.full_name || caller.email },
      activation_url: loginUrl,
      first_name: firstName,
    };

    let emailStatus = 'unknown';
    try {
      const result = await sendTemplatedEmail(base44, 'activation-new-partner', context, { to: email });
      emailStatus = result?.skipped ? 'skipped' : (result?.ok ? 'sent' : 'failed');
    } catch (e) {
      emailStatus = 'failed';
      console.warn('[approveInviteeActivation] branded email failed:', e?.message);
    }

    return Response.json({
      ok: true,
      email,
      partner_name: partnerName,
      linked,
      invite_status: inviteStatus,
      email_status: emailStatus,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}