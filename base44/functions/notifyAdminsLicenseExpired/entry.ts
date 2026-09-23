import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification when a license has expired (end date passed, still active).
// Called from checkUpcomingRenewals. Also flips LicenseRecord.license_status to "expired".
// Idempotent via dedup_key = `license_expired__${license_id}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      license_id, partner_name, property_name, license_number,
      expired_on, days_overdue,
    } = body;

    if (!license_id) return Response.json({ error: 'license_id required' }, { status: 400 });

    // Auto-expire the license record if still active
    try {
      const existing = await base44.asServiceRole.entities.LicenseRecord.filter({ id: license_id });
      const rec = existing[0];
      if (rec && rec.license_status === 'active') {
        await base44.asServiceRole.entities.LicenseRecord.update(license_id, { license_status: 'expired' });
      }
    } catch (e) {
      console.warn('[notifyAdminsLicenseExpired] could not update license_status:', e.message);
    }

    const dataRows = [
      { label: 'Partner', value: partner_name || '—' },
      { label: 'Property', value: property_name || '—' },
      { label: 'License Number', value: license_number || '—' },
      { label: 'Expired On', value: expired_on || '—' },
      { label: 'Days Overdue', value: String(days_overdue ?? '—') },
    ];

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'LICENSE EXPIRED',
      template_slug: 'admin-license-expired',
      template_context: { partner: { partner_name }, property: { property_name }, invoice: { license_number, expired_on, days_overdue, license_id } },
      urgency: 'alert',
      headline: `License expired for ${partner_name || 'a partner'}`,
      subheadline: 'Property may need to be paused from Supabase publish',
      contextBlock: `The license for ${property_name || 'this property'} has passed its end date and is now marked expired.`,
      dataRows,
      callout: 'Suggested next step: Confirm whether the property should be depublished from theonehundredcollection.com.',
      ctaLabel: 'View License',
      ctaUrl: `https://100c-os.base44.app/Licenses?licenseId=${license_id}`,
      subject: `License expired — ${partner_name || 'partner'} (${property_name || 'property'})`,
      dedup_key: `license_expired__${license_id}`,
      portalNotification: {
        type: 'general',
        title: `License expired — ${partner_name || ''}`,
        message: `${partner_name || 'A partner'}'s license for ${property_name || 'a property'} expired on ${expired_on || 'recently'}.`,
        partnerName: partner_name,
        link: `/Licenses?licenseId=${license_id}`,
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});