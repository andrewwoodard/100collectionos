import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendResendEmailDirect } from '../../shared/resendEmail.ts';

// Creates a PartnerInvitation and sends a branded Resend email.
// Accessible by admins and the primary contact of the partner.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { partner_id, email, partner_role } = body;

    if (!partner_id || !email) {
      return Response.json({ error: 'partner_id and email are required' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let partner = null;
    try {
      const partners = await base44.asServiceRole.entities.Partner.filter({ id: partner_id });
      partner = partners?.[0];
    } catch (e) { /* not a Base44 entity */ }
    if (!partner) return Response.json({ error: 'Partner not found' }, { status: 404 });

    // Non-admin callers must belong to the target partner organization.
    const userIds = Array.isArray(partner.portal_user_ids) && partner.portal_user_ids.length > 0
      ? [...partner.portal_user_ids]
      : (partner.portal_user_id ? [partner.portal_user_id] : []);
    const isAdmin = user.role === 'admin';
    if (!isAdmin && !userIds.includes(user.id)) {
      return Response.json({ error: 'You do not have access to this partner organization' }, { status: 403 });
    }
    const isOwner = (user.partner_role || 'owner') === 'owner';
    if (!isAdmin && !isOwner) {
      return Response.json({ error: 'Only the account owner can invite teammates' }, { status: 403 });
    }

    // Check if email is already a team member
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const existingMember = allUsers.find(u => u.email === email && userIds.includes(u.id));
    if (existingMember) {
      return Response.json({ error: 'This email is already a team member' }, { status: 409 });
    }

    // Revoke any existing pending invitations for this email + partner
    const existingInvites = await base44.asServiceRole.entities.PartnerInvitation.filter({ partner_id, email, status: 'pending' });
    for (const inv of existingInvites) {
      await base44.asServiceRole.entities.PartnerInvitation.update(inv.id, { status: 'revoked' });
    }

    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const inviterName = user.full_name || user.email;

    const invitation = await base44.asServiceRole.entities.PartnerInvitation.create({
      partner_id,
      partner_name: partner.partner_name,
      email,
      invited_by_user_id: user.id,
      invited_by_name: inviterName,
      token,
      expires_at,
      status: 'pending',
      partner_role: partner_role || 'operations',
    });

    // NOTE: We intentionally do NOT call base44.users.inviteUser() here — it triggers
    // Base44's default welcome email which duplicates our branded invitation. The user
    // will be auto-created by Base44 platform auth when they click the activation link
    // and complete signup at /portal/accept-invite. Our acceptPartnerInvitation function
    // then handles the partner linkage.
    // Fallback: if there's an issue with the platform auto-creation flow discovered
    // in production, we can re-enable the inviteUser call here with a suppressed email.
    // For now, rely on Base44 platform auth to create the user on their first login.

    // Compose and send email
    const acceptUrl = `https://100c-os.base44.app/portal/accept-invite?token=${token}`;
    const partnerName = partner.partner_name || 'your partner';

    const content = `
      <h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">You're Invited</h2>
      <p style="margin:0 0 16px;"><strong>${inviterName}</strong> has invited you to join <strong>${partnerName}</strong>'s team on the 100 Collection Partner Portal.</p>
      <p style="margin:0 0 24px;color:#64748B;font-size:13px;">Click below to accept and create your account. This invitation expires in 14 days.</p>
      <a href="${acceptUrl}" style="display:inline-block;background:#0D1B2A;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">Accept Invitation &rarr;</a>
    `;
    const textBody = `${inviterName} has invited you to join ${partnerName}'s team on the 100 Collection Partner Portal. Accept here: ${acceptUrl}\n\nThis invitation expires in 14 days.`;

    let resendStatus = 'unknown';
    let resendError = null;
    try {
      const emailRes = await sendResendEmailDirect(base44, {
        to: email,
        subject: `You're invited to ${partnerName}'s 100 Collection Partner Portal`,
        content,
        text: textBody,
      });
      if (emailRes.skipped) {
        resendStatus = 'skipped';
      } else if (emailRes.ok) {
        resendStatus = 'sent';
      } else {
        resendError = emailRes.error || 'unknown';
        resendStatus = 'failed';
      }
    } catch (e) {
      resendError = e.message || 'email send failed';
      resendStatus = 'failed';
    }

    // Notify admins that a teammate was invited (idempotent)
    try {
      await base44.functions.invoke('notifyAdminsTeammateInvited', {
        invitation_id: invitation.id,
        partner_id,
        partner_name: partner.partner_name || '',
        invitee_email: email,
        invited_by_name: inviterName,
      });
    } catch (e) {
      console.warn('[createPartnerInvitation] admin notify failed:', e.message);
    }

    return Response.json({
      ok: true,
      invitation_id: invitation.id,
      resend_status: resendStatus,
      resend_error: resendError,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});