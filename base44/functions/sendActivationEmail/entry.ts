import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';
import { renderFromTemplate } from '../../shared/renderFromTemplate.ts';

// Sends (or previews) the branded primary-activation welcome email.
// Now routes through DB-backed EmailTemplate (slug: activation-new-partner).
//
//   preview_only: true  — returns full email HTML for admin preview (no invitation created, no email sent)
//   preview_only: false — creates/reuses PartnerInvitation, sends branded email via Resend
//   resend: true        — revokes existing pending invitation, creates fresh one with new token

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { partner_id, preview_only, resend } = body;

    if (!partner_id) return Response.json({ error: 'partner_id required' }, { status: 400 });

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    let partner = null;
    try {
      const partners = await base44.asServiceRole.entities.Partner.filter({ id: partner_id });
      partner = partners?.[0];
    } catch (e) { /* not a Base44 entity */ }
    if (!partner) return Response.json({ error: 'Partner not found' }, { status: 404 });

    const email = partner.primary_contact_email;
    if (!email) return Response.json({ error: 'No primary contact email set on this partner' }, { status: 400 });

    if (partner.status === 'inactive' || partner.status === 'paused') {
      return Response.json({ error: `Cannot send activation email to a ${partner.status} partner` }, { status: 400 });
    }

    if (partner.portal_user_id) {
      return Response.json({ error: 'This partner has already activated their portal' }, { status: 400 });
    }

    const firstName = (partner.primary_contact_name || '').split(' ')[0]?.trim() || 'there';
    const partnerName = partner.partner_name || 'your partner';
    const isHomeowner = partner.partner_type === 'owner';

    // Build context for template rendering
    const context = {
      partner: {
        partner_name: partnerName,
        primary_contact_name: partner.primary_contact_name || '',
        primary_contact_email: email,
        market: partner.market || '',
        partner_type: partner.partner_type || '',
      },
      inviter: {
        name: user.full_name || user.email,
      },
      activation_url: '#', // filled in below for real sends
      first_name: firstName,
    };

    // Preview only — return HTML without creating invitation or sending
    if (preview_only) {
      const rendered = await renderFromTemplate(base44, 'activation-new-partner', context);
      return Response.json({
        ok: true,
        preview_html: rendered.html || '',
        first_name: firstName,
        partner_name: partnerName,
        email,
      });
    }

    // Check for existing pending activation invitations
    const existingInvites = await base44.asServiceRole.entities.PartnerInvitation.filter({
      partner_id, invitation_type: 'primary_activation', status: 'pending'
    });

    let invitation;
    let token;

    if (resend) {
      // Revoke all existing pending invitations, create fresh
      for (const inv of existingInvites) {
        await base44.asServiceRole.entities.PartnerInvitation.update(inv.id, { status: 'revoked' });
      }
      token = crypto.randomUUID();
      const expires_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      invitation = await base44.asServiceRole.entities.PartnerInvitation.create({
        partner_id, partner_name: partnerName, email,
        invited_by_user_id: user.id, invited_by_name: user.full_name || user.email,
        token, expires_at, status: 'pending', invitation_type: 'primary_activation',
      });
    } else {
      // Reuse existing valid (non-expired) invitation, or create new
      const valid = existingInvites.find(inv => new Date(inv.expires_at) > new Date());
      if (valid) {
        invitation = valid;
        token = valid.token;
      } else {
        for (const inv of existingInvites) {
          await base44.asServiceRole.entities.PartnerInvitation.update(inv.id, { status: 'expired' });
        }
        token = crypto.randomUUID();
        const expires_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        invitation = await base44.asServiceRole.entities.PartnerInvitation.create({
          partner_id, partner_name: partnerName, email,
          invited_by_user_id: user.id, invited_by_name: user.full_name || user.email,
          token, expires_at, status: 'pending', invitation_type: 'primary_activation',
        });
      }
    }

    // Pre-authorize the user at platform level so they skip the "Request Access" gate
    try {
      await base44.users.inviteUser(email, 'user');
    } catch (e) {
      console.warn('Platform pre-auth skipped for', email, ':', e.message);
    }

    const acceptUrl = `https://100c-os.base44.app/portal/accept-invite?token=${token}`;
    context.activation_url = acceptUrl;

    const result = await sendTemplatedEmail(base44, 'activation-new-partner', context, { to: email });

    let resendStatus = 'unknown';
    let resendError = null;
    if (result.skipped) {
      resendStatus = 'skipped';
    } else if (result.ok) {
      resendStatus = 'sent';
    } else {
      resendError = result.error || 'unknown';
      resendStatus = 'failed';
    }

    return Response.json({
      ok: true,
      invitation_id: invitation.id,
      resend_status: resendStatus,
      resend_error: resendError,
      email,
      partner_name: partnerName,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});