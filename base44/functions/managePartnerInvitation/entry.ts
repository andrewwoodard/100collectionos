import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendResendEmailDirect } from '../../shared/resendEmail.ts';

// Manages existing PartnerInvitations: resend or revoke.
// Actions: "resend" (reset expires_at + re-send email), "revoke" (set status=revoked).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, invitation_id } = body;

    if (!invitation_id) return Response.json({ error: 'invitation_id required' }, { status: 400 });

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let invitation = null;
    try {
      const invitations = await base44.asServiceRole.entities.PartnerInvitation.filter({ id: invitation_id });
      invitation = invitations?.[0];
    } catch (e) { /* not a Base44 entity */ }
    if (!invitation) return Response.json({ error: 'Invitation not found' }, { status: 404 });

    let partner = null;
    try {
      const partners = await base44.asServiceRole.entities.Partner.filter({ id: invitation.partner_id });
      partner = partners?.[0];
    } catch (e) { /* not a Base44 entity */ }
    if (!partner) return Response.json({ error: 'Partner not found' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    if (!isAdmin && partner.portal_user_id !== user.id) {
      return Response.json({ error: 'Only the primary contact or an admin can manage invitations' }, { status: 403 });
    }

    if (action === 'revoke') {
      await base44.asServiceRole.entities.PartnerInvitation.update(invitation_id, { status: 'revoked' });
      return Response.json({ ok: true, status: 'revoked' });
    }

    if (action === 'resend') {
      if (invitation.status === 'accepted') {
        return Response.json({ error: 'Cannot resend an accepted invitation' }, { status: 400 });
      }
      const expires_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await base44.asServiceRole.entities.PartnerInvitation.update(invitation_id, {
        status: 'pending',
        expires_at,
      });

      const acceptUrl = `https://100c-os.base44.app/portal/accept-invite?token=${invitation.token}`;
      const partnerName = partner.partner_name || 'your partner';
      const inviterName = invitation.invited_by_name || user.full_name || user.email;

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
          to: invitation.email,
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

      return Response.json({
        ok: true,
        status: 'pending',
        expires_at,
        resend_status: resendStatus,
        resend_error: resendError,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});