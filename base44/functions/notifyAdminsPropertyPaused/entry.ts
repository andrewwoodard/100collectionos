import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification when a property is paused or taken off-market.
// Triggered by entity automation on Property update (status -> "paused" or "inactive").
// Idempotent via dedup_key = `property_paused__${property_id}__${new_status}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const data = body.data || {};
    const oldData = body.old_data || {};

    const newStatus = data.status;
    const prevStatus = oldData.status;

    // Only fire when status actually changed to a paused/off-market state
    const pausedStates = ['paused', 'inactive'];
    if (!pausedStates.includes(newStatus) || newStatus === prevStatus) {
      return Response.json({ ok: true, skipped: 'not a pause transition' });
    }

    const propertyName = data.property_name || 'Untitled';
    const partnerName = data.partner_name || '—';
    const changedBy = body.changed_by || (data.archived_by_user_id ? 'admin' : 'partner');

    const dataRows = [
      { label: 'Partner', value: partnerName },
      { label: 'Property', value: propertyName },
      { label: 'Previous Status', value: prevStatus || '—' },
      { label: 'New Status', value: newStatus },
      { label: 'Changed By', value: changedBy },
    ];

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'PROPERTY PAUSED',
      template_slug: 'admin-property-paused',
      template_context: { partner: { partner_name: partnerName }, property: { property_name: propertyName, id: data.id, previous_status: prevStatus, new_status: newStatus, changed_by: changedBy } },
      urgency: 'warning',
      headline: `${partnerName} paused ${propertyName}`,
      subheadline: 'The property is no longer active in the portfolio.',
      contextBlock: `${partnerName} changed ${propertyName} from ${prevStatus || 'its previous status'} to ${newStatus}.`,
      dataRows,
      callout: 'If this property is published on theonehundredcollection.com, confirm whether it should be depublished.',
      ctaLabel: 'View Property',
      ctaUrl: `https://100c-os.base44.app/portal/properties/${data.id || ''}`,
      subject: `Property paused — ${propertyName} (${partnerName})`,
      dedup_key: `property_paused__${data.id || 'unknown'}__${newStatus}`,
      portalNotification: {
        type: 'general',
        title: `Property paused — ${propertyName}`,
        message: `${partnerName} paused ${propertyName} (now ${newStatus}).`,
        partnerName,
        propertyName,
        link: data.id ? `/portal/properties/${data.id}` : undefined,
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});