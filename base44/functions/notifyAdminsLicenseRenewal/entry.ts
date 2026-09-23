import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification for upcoming license renewals.
// Called from checkUpcomingRenewals for licenses due in 30/14/7 days.
// Idempotent via dedup_key = `renewal_reminder__${license_id}__${days_until}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      license_id, partner_name, property_name, license_number,
      renewal_date, annual_fee, days_until, auto_renew,
    } = body;

    if (!license_id || typeof days_until !== 'number') {
      return Response.json({ error: 'license_id and days_until required' }, { status: 400 });
    }

    const formattedFee = typeof annual_fee === 'number'
      ? '$' + annual_fee.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : (annual_fee || '—');

    const urgency = days_until <= 7 ? 'alert' : 'warning';

    const dataRows = [
      { label: 'Partner', value: partner_name || '—' },
      { label: 'Property', value: property_name || '—' },
      { label: 'License Number', value: license_number || '—' },
      { label: 'Renewal Date', value: renewal_date || '—' },
      { label: 'Annual Fee', value: formattedFee },
      { label: 'Auto-Renew', value: auto_renew ? 'Yes' : 'No' },
    ];

    const renewalSlug = `admin-renewal-${days_until}`;
    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: `RENEWAL DUE — ${days_until} DAYS`,
      template_slug: renewalSlug,
      template_context: { partner: { partner_name }, property: { property_name }, invoice: { license_number, renewal_date, annual_fee: formattedFee, auto_renew, license_id, days_until } },
      urgency,
      headline: `${partner_name || 'A partner'} renewal in ${days_until} days`,
      subheadline: days_until <= 7
        ? 'This renewal is coming up soon. Confirm the partner is ready.'
        : 'Heads up so you can plan outreach before the renewal date.',
      contextBlock: `The license for ${property_name || 'this property'} is scheduled to renew on ${renewal_date || 'an upcoming date'}.`,
      dataRows,
      ctaLabel: 'View License',
      ctaUrl: `https://100c-os.base44.app/Licenses?licenseId=${license_id}`,
      subject: `Renewal in ${days_until} days — ${partner_name || 'partner'} (${property_name || 'property'})`,
      dedup_key: `renewal_reminder__${license_id}__${days_until}`,
      portalNotification: {
        type: 'general',
        title: `Renewal in ${days_until} days — ${partner_name || ''}`,
        message: `${partner_name || 'A partner'}'s license for ${property_name || 'a property'} renews on ${renewal_date || 'soon'}.`,
        partnerName: partner_name,
        link: `/Licenses?licenseId=${license_id}`,
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});