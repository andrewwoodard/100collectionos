// Admin actions on PortalAccessRequest records from the unified access queue.
// Requires an authenticated admin. Actions:
//   approve_team_member  — creates a PartnerInvitation linking them to a partner
//   approve_new_partner  — creates a Partner + primary PartnerInvitation
//   route_to_application — sends the warm routing email
//   reject               — optionally sends a polite decline email

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendResendEmailDirect } from '../../shared/resendEmail.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { request_id, action, partner_id, partner_role, partner_name, send_email } = body;
    if (!request_id || !action) {
      return Response.json({ error: 'request_id and action are required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const request = await svc.entities.PortalAccessRequest.get(request_id);
    if (!request) {
      return Response.json({ error: 'Access request not found' }, { status: 404 });
    }

    const email = request.email;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomUUID();

    if (action === 'approve_team_member') {
      if (!partner_id) {
        return Response.json({ error: 'partner_id is required to approve as a team member' }, { status: 400 });
      }
      const partner = await svc.entities.Partner.get(partner_id);
      if (!partner) {
        return Response.json({ error: 'Partner not found' }, { status: 404 });
      }
      await svc.entities.PartnerInvitation.create({
        partner_id: partner.id,
        partner_name: partner.partner_name,
        email,
        invited_by_user_id: user.id,
        invited_by_name: user.full_name || user.email,
        token,
        expires_at: expiresAt,
        status: 'pending',
        invitation_type: 'teammate',
        partner_role: partner_role || 'operations',
      });
      await svc.entities.PortalAccessRequest.update(request_id, {
        status: 'approved',
        action_taken: 'approve_team_member',
        action_taken_by: user.email,
        action_taken_at: now,
      });
      return Response.json({ ok: true });
    }

    if (action === 'approve_new_partner') {
      const name = partner_name || request.full_name || email.split('@')[0];
      const partner = await svc.entities.Partner.create({
        partner_name: name,
        company_name: name,
        primary_contact_email: email,
        partner_type: 'property_manager',
        status: 'vetting',
        onboarding_stage: 'approved',
        contract_status: 'none',
        billing_status: 'not_setup',
      });
      await svc.entities.PartnerInvitation.create({
        partner_id: partner.id,
        partner_name: partner.partner_name,
        email,
        invited_by_user_id: user.id,
        invited_by_name: user.full_name || user.email,
        token,
        expires_at: expiresAt,
        status: 'pending',
        invitation_type: 'primary_activation',
        partner_role: 'owner',
      });
      await svc.entities.PortalAccessRequest.update(request_id, {
        status: 'approved',
        action_taken: 'approve_new_partner',
        action_taken_by: user.email,
        action_taken_at: now,
        matched_partner_id: partner.id,
        matched_partner_name: partner.partner_name,
      });
      return Response.json({ ok: true });
    }

    if (action === 'route_to_application') {
      const applyUrl = `https://100c-os.base44.app/apply?from=signup&email=${encodeURIComponent(email)}`;
      // Schedule ~65s out so an admin undo within that window can cancel the
      // send before it leaves (Resend's minimum scheduled delay is ~1 minute).
      const scheduledAt = new Date(Date.now() + 65 * 1000).toISOString();
      let scheduledEmailId = null;
      if (send_email !== false) {
        const result = await sendResendEmailDirect(base44, {
          to: email,
          subject: 'Welcome, let\'s get you started',
          scheduledAt,
          content: `
            <p style="margin:0 0 16px;">Hi there,</p>
            <p style="margin:0 0 16px;">Thanks for your interest in The 100 Collection. Before we set up portal access, we'd love to learn about you and your properties. It takes about three minutes, and we'll get back to you within 48 hours.</p>
            <p style="margin:24px 0;">
              <a href="${applyUrl}" style="display:inline-block;background:#C9A96E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;">Start your application</a>
            </p>
            <p style="margin:0 0 16px;">Warmly,<br/>The 100 Collection Team</p>
          `,
          text: 'Thanks for your interest in The 100 Collection. Before we set up portal access, we\'d love to learn about you and your properties. Start your application: ' + applyUrl,
        });
        scheduledEmailId = result?.id || null;
      }
      await svc.entities.PortalAccessRequest.update(request_id, {
        status: 'routed_to_application',
        action_taken: 'route_to_application',
        action_taken_by: user.email,
        action_taken_at: now,
        scheduled_email_id: scheduledEmailId,
        scheduled_send_at: send_email !== false ? scheduledAt : null,
      });
      return Response.json({ ok: true });
    }

    if (action === 'reject') {
      const scheduledAt = new Date(Date.now() + 65 * 1000).toISOString();
      let scheduledEmailId = null;
      if (send_email === true) {
        const result = await sendResendEmailDirect(base44, {
          to: email,
          subject: 'Your portal access request',
          scheduledAt,
          content: `
            <p style="margin:0 0 16px;">Hi there,</p>
            <p style="margin:0 0 16px;">Thank you for your interest in The 100 Collection. After reviewing your request, we're not able to set up portal access at this time. You're welcome to reapply in the future if your situation changes.</p>
            <p style="margin:0 0 16px;">Warmly,<br/>The 100 Collection Team</p>
          `,
          text: 'Thank you for your interest in The 100 Collection. After reviewing your request, we\'re not able to set up portal access at this time. You\'re welcome to reapply in the future if your situation changes.',
        });
        scheduledEmailId = result?.id || null;
      }
      await svc.entities.PortalAccessRequest.update(request_id, {
        status: 'rejected',
        action_taken: 'reject',
        action_taken_by: user.email,
        action_taken_at: now,
        scheduled_email_id: scheduledEmailId,
        scheduled_send_at: send_email === true ? scheduledAt : null,
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}