import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// 3b. Fires when a partner submits a property edit request from the portal.
// Called from PropertyEditModal after the PropertySubmission is created.
// eventType: "PROPERTY EDIT REQUEST".

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      submissionId,
      partnerName,
      propertyName,
      fieldsChanged = 0,
      submittedBy,
    } = body;

    if (!submissionId) {
      return Response.json({ error: 'submissionId is required' }, { status: 400 });
    }

    const dataRows = [
      { label: 'Partner', value: partnerName || '—' },
      { label: 'Property', value: propertyName || '—' },
      { label: 'Fields Changed', value: fieldsChanged || '—' },
      { label: 'Submitted By', value: submittedBy || '—' },
    ];

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'PROPERTY EDIT REQUEST',
      template_slug: 'admin-property-edit-submitted',
      template_context: { partner: { partner_name: partnerName }, property: { property_name: propertyName }, submission: { id: submissionId, fields_changed: fieldsChanged, submitted_by: submittedBy } },
      urgency: 'default',
      headline: `${partnerName || 'A partner'} requested edits to ${propertyName || 'a property'}`,
      subheadline: 'A partner submitted changes for review. These need approval before they go live.',
      dataRows,
      ctaLabel: 'Review Edit',
      ctaUrl: `https://100c-os.base44.app/admin/review/${submissionId}`,
      subject: `Property edit request — ${propertyName || 'Untitled'} (${partnerName || 'Partner'})`,
      dedupKey: `${submissionId}__edit__admin`,
      portalNotification: {
        type: 'submitted',
        title: `Edit request — ${propertyName || 'Property'}`,
        message: `${partnerName || 'A partner'} submitted an edit request for ${propertyName || 'a property'}.`,
        submissionId,
        propertyName,
        link: `/admin/hub?tab=submissions&submissionId=${submissionId}`,
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});