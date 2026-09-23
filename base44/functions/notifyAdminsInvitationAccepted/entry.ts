import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification when a teammate accepts a portal invitation.
// Called from acceptPartnerInvitation after marking the invitation accepted.
// Idempotent via dedup_key = `invitation_accepted__${invitation_id}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      invitation_id, partner_id, partner_name,
      user_name, user_email, invited_by_name, is_primary_activation,
    } = body;

    if (!invitation_id) return Response.json({ error: 'invitation_id required' }, { status: 400 });

    const dataRows = [
      { label: 'New User', value: user_name || user_email || '—' },
      { label: 'Email', value: user_email || '—' },
      { label: 'Role', value: 'Partner' },
      { label: 'Partner', value: partner_name || '—' },
      { label: 'Invited By', value: invited_by_name || '—' },
    ];

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'TEAMMATE JOINED',
      template_slug: 'admin-teammate-joined',
      template_context: { partner: { partner_name, id: partner_id }, teammate: { name: user_name, email: user_email, invited_by_name, is_primary_activation }, invitation: { id: invitation_id } },
      urgency: 'success',
      headline: `${user_name || user_email || 'A new teammate'} joined ${partner_name || 'a partner'}`,
      subheadline: `${is_primary_activation ? 'Primary contact activated their portal' : 'A teammate accepted their invitation'}.`,
      contextBlock: `${user_name || user_email || 'Someone'} just accepted the invitation from ${invited_by_name || 'a team member'} and is now part of ${partner_name || 'this partner'}'s portal.`,
      dataRows,
      ctaLabel: 'View Partner',
      ctaUrl: `https://100c-os.base44.app/PartnerDetail?id=${partner_id || ''}&tab=portal`,
      subject: `Teammate joined — ${user_name || user_email || 'new user'} (${partner_name || 'partner'})`,
      dedup_key: `invitation_accepted__${invitation_id}`,
      portalNotification: {
        type: 'general',
        title: `Teammate joined — ${partner_name || ''}`,
        message: `${user_name || user_email || 'A user'} accepted an invitation and joined ${partner_name || 'a partner'}.`,
        partnerName: partner_name,
        link: `/PartnerDetail?id=${partner_id || ''}&tab=portal`,
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});