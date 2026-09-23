import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Fired by entity automation: PropertySubmission create + update.
// When status === "submitted", creates an admin notification (in-app + branded email).
// Detects edit requests (submission_type=edit) and direct/manual submissions (!ai_imported)
// to flag the eventType accordingly. Idempotent via dedup_key.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const sub = body.data;

    if (!sub || sub.status !== 'submitted') {
      return Response.json({ ok: true, skipped: 'not a submitted status' });
    }

    const partnerName = sub.partner_name || 'A partner';
    const propertyName = sub.property_name || 'Untitled';
    const market = sub.location_full || sub.location_city || '—';
    const submittedDate = sub.submitted_date
      ? new Date(sub.submitted_date).toLocaleDateString()
      : new Date().toLocaleDateString();

    const isEdit = sub.submission_type === 'edit';
    const isDirect = !isEdit && !sub.ai_imported;

    const eventType = isEdit
      ? 'PROPERTY EDIT REQUEST'
      : isDirect
        ? 'DIRECT PROPERTY SUBMISSION'
        : 'NEW PROPERTY SUBMISSION';

    const dataRows = [
      { label: 'Property', value: propertyName },
      { label: 'Partner', value: partnerName },
      { label: 'Market', value: market },
      { label: 'Submitted', value: submittedDate },
    ];
    if (isEdit && sub.source_property_id) dataRows.push({ label: 'Existing Property ID', value: sub.source_property_id });
    if (isDirect) dataRows.push({ label: 'Submission Type', value: 'Manual (no AI enrichment)' });

    const headline = isEdit
      ? `${partnerName} requested edits to ${propertyName}`
      : `${partnerName} submitted ${propertyName}`;

    const subheadline = isEdit
      ? 'A partner is requesting changes to an existing property.'
      : isDirect
        ? 'Submitted directly by the partner. Expect less AI enrichment on this one.'
        : 'A new property is ready for review.';

    const contextBlock = isEdit
      ? `${partnerName} submitted an edit request for ${propertyName}. Review the changes before approving.`
      : isDirect
        ? `${partnerName} submitted ${propertyName} directly through the portal without the AI wizard. Fields may need manual enrichment.`
        : `${partnerName} submitted ${propertyName} for review.`;

    const dedupKey = `${sub.id}__submitted__admin`;

    await base44.functions.invoke('sendAdminNotification', {
      eventType,
      template_slug: 'admin-new-property-submission',
      template_context: { partner: { partner_name: partnerName }, property: { property_name: propertyName, market, submitted_date: submittedDate, source_property_id: sub.source_property_id, submission_type: sub.submission_type }, submission: { id: sub.id } },
      urgency: 'default',
      headline,
      subheadline,
      contextBlock,
      dataRows,
      ctaLabel: isEdit ? 'Review Edit' : 'Review Submission',
      ctaUrl: `https://100c-os.base44.app/admin/review/${sub.id}`,
      subject: `${eventType} — ${propertyName} (${partnerName})`,
      dedup_key: dedupKey,
      portalNotification: {
        type: 'submitted',
        title: isEdit ? `Property edit request — ${propertyName}` : `New property submission — ${propertyName}`,
        message: `${partnerName} ${isEdit ? 'requested edits to' : 'submitted'} "${propertyName}".`,
        submissionId: sub.id,
        propertyName,
        link: `/admin/hub?tab=submissions&submissionId=${sub.id}`,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});