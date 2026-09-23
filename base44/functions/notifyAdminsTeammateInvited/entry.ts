import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification when a teammate is invited from the portal.
// Called from createPartnerInvitation after the invitation is created.
// Idempotent via dedup_key = `teammate_invited__${invitation_id}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      invitation_id, partner_id, partner_name,
      invitee_email, invited_by_name,
    } = body;

    if (!invitation_id) return Response.json({ error: 'invitation_id required' }, { status: 400 });

    const dataRows = [
      { label: 'Invitee', value: invitee_email || '—' },
      { label: 'Email', value: invitee_email || '—' },
      { label: 'Role', value: 'Partner (pending acceptance)' },
      { label: 'Partner', value: partner_name || '—' },
      { label: 'Invited By', value: invited_by_name || '—' },
    ];

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'TEAMMATE INVITED',
      template_slug: 'admin-teammate-invited',
      template_context: { partner: { partner_name, id: partner_id }, teammate: { email: invitee_email, invited_by_name }, invitation: { id: invitation_id } },
      urgency: 'default',
      headline: `${invited_by_name || 'Someone'} invited a teammate to ${partner_name || 'a partner'}`,
      subheadline: 'An invitation email was sent. The teammate will appear in the portal once they accept.',
      contextBlock: `${invited_by_name || 'A team member'} sent a portal invitation to ${invitee_email || 'a new teammate'} for ${partner_name || 'this partner'}.`,
      dataRows,
      ctaLabel: 'View Partner',
      ctaUrl: `https://100c-os.base44.app/PartnerDetail?id=${partner_id || ''}&tab=portal`,
      subject: `Teammate invited — ${invitee_email || ''} (${partner_name || 'partner'})`,
      dedup_key: `teammate_invited__${invitation_id}`,
      portalNotification: {
        type: 'general',
        title: `Teammate invited — ${partner_name || ''}`,
        message: `${invited_by_name || 'Someone'} invited ${invitee_email || 'a teammate'} to join ${partner_name || 'a partner'}.`,
        partnerName: partner_name,
        link: `/PartnerDetail?id=${partner_id || ''}&tab=portal`,
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});