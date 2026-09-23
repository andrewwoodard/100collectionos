import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Sends follow-up emails after a PartnerInvitation is accepted:
//   A. Welcome email to the invitee (primary_activation or teammate variant)
//   B. FYI email to the inviter (teammate invitations only)
// Both are non-blocking: failures are logged but don't affect the acceptance flow.
// Slugs: invite-accepted-welcome-primary, invite-accepted-welcome-teammate, invite-accepted-fyi-inviter.

const PORTAL_URL = 'https://portal.theonehundredcollection.com';

const ROLE_LABELS = {
  owner: 'Owner',
  marketing: 'Marketing',
  finance: 'Finance',
  operations: 'Operations',
};

const ROLE_ACTIONS = {
  marketing: 'manage properties, media, careers, and the public profile',
  finance: 'view billing, licenses, invoices, and payment history',
  operations: 'manage properties, careers, and applications',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { invitation_id, is_primary_activation, user_id, partner_id } = body;

    if (!invitation_id || !user_id || !partner_id) {
      return Response.json({ error: 'invitation_id, user_id, and partner_id are required' }, { status: 400 });
    }

    // Look up invitation, partner, and user
    let inv = null;
    try { inv = await base44.asServiceRole.entities.PartnerInvitation.get(invitation_id); } catch (_) {}
    if (!inv) return Response.json({ ok: true, skipped: 'invitation not found' });

    let partner = null;
    try { partner = await base44.asServiceRole.entities.Partner.get(partner_id); } catch (_) {}
    if (!partner) return Response.json({ ok: true, skipped: 'partner not found' });

    let user = null;
    try { user = await base44.asServiceRole.entities.User.get(user_id); } catch (_) {}
    if (!user) return Response.json({ ok: true, skipped: 'user not found' });

    const partnerName = partner.partner_name || 'your partner';
    const firstName = (user.full_name || inv.email || 'there').split(' ')[0]?.trim() || 'there';
    const inviteeEmail = user.email || inv.email;
    const role = inv.partner_role || 'operations';
    const roleLabel = ROLE_LABELS[role] || role;
    const roleAction = ROLE_ACTIONS[role] || 'manage your partner portal';

    // ── A. Welcome email to the invitee ──────────────────────────────
    const welcomeSlug = is_primary_activation
      ? 'invite-accepted-welcome-primary'
      : 'invite-accepted-welcome-teammate';

    const welcomeContext = {
      partner: { partner_name: partnerName },
      teammate: {
        name: firstName,
        email: inviteeEmail,
        role: roleLabel,
        role_action: roleAction,
      },
      inviter: { name: inv.invited_by_name || 'The 100 Collection team' },
      portal_url: `${PORTAL_URL}/portal/dashboard`,
      first_name: firstName,
    };

    try {
      await sendTemplatedEmail(base44, welcomeSlug, welcomeContext, { to: inviteeEmail });
      console.log(`[sendInvitationAcceptedEmails] welcome email sent to ${inviteeEmail}`);
    } catch (e) {
      console.warn('[sendInvitationAcceptedEmails] welcome email failed:', e.message);
    }

    // ── B. FYI email to the inviter (teammate invitations only) ──────
    if (!is_primary_activation && inv.invited_by_user_id) {
      try {
        const inviter = await base44.asServiceRole.entities.User.get(inv.invited_by_user_id);
        if (inviter?.email) {
          const inviteeName = user.full_name || inviteeEmail;
          const joinedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          const fyiContext = {
            partner: { partner_name: partnerName },
            teammate: {
              name: inviteeName,
              email: inviteeEmail,
              role: roleLabel,
            },
            inviter: { name: inviter.full_name || inviter.email },
            joined_at: joinedAt,
            team_url: `${PORTAL_URL}/portal/team`,
          };

          await sendTemplatedEmail(base44, 'invite-accepted-fyi-inviter', fyiContext, { to: inviter.email });
          console.log(`[sendInvitationAcceptedEmails] inviter FYI email sent to ${inviter.email}`);
        }
      } catch (e) {
        console.warn('[sendInvitationAcceptedEmails] inviter FYI email failed:', e.message);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[sendInvitationAcceptedEmails] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});