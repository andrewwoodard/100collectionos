import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled 1st of each month 8am ET. Aggregates last month's financial rhythm.
// Always sends. Saves last HTML to AppConfig + logs to AuditEntry.
// Idempotent via dedup_key = `monthly_billing__${YYYY-MM}`.
const BILLING_URL = 'https://100c-os.base44.app/Billing';

function inRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const previewRecipient = body.preview_recipient || '';
    const now = new Date();
    // Last calendar month
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    end.setMilliseconds(-1);
    const monthLabel = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const configRows = await base44.asServiceRole.entities.AppConfig.list();
    const config = {};
    for (const row of configRows) config[row.key] = row.value;
    const enabled = (config.MONTHLY_BILLING_ENABLED || 'true').toLowerCase() !== 'false';
    if (!enabled) return Response.json({ ok: true, skipped: 'monthly billing disabled' });

    const dedupKey = `monthly_billing__${start.toISOString().slice(0, 7)}`;

    const licenses = await base44.asServiceRole.entities.LicenseRecord.list('-created_date', 2000);

    const issued = licenses.filter(l => inRange(l.created_date, start, end));
    const renewed = licenses.filter(l => inRange(l.license_start_date, start, end));
    const expired = licenses.filter(l => l.license_status === 'expired' && inRange(l.license_end_date, start, end));
    const cancelled = licenses.filter(l => l.license_status === 'cancelled' && inRange(l.updated_date, start, end));

    const paid = licenses.filter(l => inRange(l.paid_date, start, end));
    const totalCollected = paid.reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);
    const totalInvoiced = licenses.filter(l => inRange(l.invoice_date, start, end))
      .reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);
    const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;
    const failedPayments = licenses.filter(l => l.payment_status === 'overdue');
    const outstanding = failedPayments.reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);

    // Previous month for MoM
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd.setMilliseconds(-1);
    const prevCollected = licenses.filter(l => inRange(l.paid_date, prevStart, prevEnd))
      .reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);
    const momChange = prevCollected > 0 ? Math.round(((totalCollected - prevCollected) / prevCollected) * 100) : 0;
    const momArrow = momChange >= 0 ? '▲' : '▼';

    // Top 5 partners by revenue (collected in month)
    const byPartner = {};
    paid.forEach(l => { byPartner[l.partner_name] = (byPartner[l.partner_name] || 0) + (typeof l.annual_fee === 'number' ? l.annual_fee : 0); });
    const top5 = Object.entries(byPartner).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Renewals next month
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const renewalsNext = licenses.filter(l => {
      if (!l.license_end_date) return false;
      const d = new Date(l.license_end_date);
      return d >= nextMonthStart && d < nextMonthEnd && l.license_status === 'active';
    });
    const renewalsValue = renewalsNext.reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);

    // Discount usage
    const discounted = licenses.filter(l => (l.discount_applied_percent || 0) > 0 && inRange(l.created_date, start, end));
    const totalDiscounted = discounted.reduce((s, l) => {
      const base = typeof l.base_fee === 'number' ? l.base_fee : (typeof l.annual_fee === 'number' ? l.annual_fee : 0);
      const disc = base * ((l.discount_applied_percent || 0) / 100);
      return s + disc;
    }, 0);

    const healthOk = collectionRate >= 85 && failedPayments.length < 5;
    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'MONTHLY BILLING SUMMARY',
      template_slug: 'monthly-billing-summary',
      template_context: { month_label: monthLabel, total_collected: totalCollected, total_invoiced: totalInvoiced, collection_rate: collectionRate, mom_change: momChange, failed_payments: failedPayments.length, outstanding, issued: issued.length, renewed: renewed.length, expired: expired.length, cancelled: cancelled.length, health_ok: healthOk },
      urgency: healthOk ? 'success' : 'warning',
      headline: `${monthLabel} billing summary`,
      subheadline: healthOk
        ? 'A solid month. Collection is on track.'
        : 'A few things to keep an eye on this month.',
      contextBlock: `Here is the financial rhythm for ${monthLabel}.`,
      sections: [
        {
          title: 'Revenue',
          dataRows: [
            { label: 'Total invoiced', value: '$' + totalInvoiced.toLocaleString('en-US') },
            { label: 'Total collected', value: '$' + totalCollected.toLocaleString('en-US') },
            { label: 'Collection rate', value: collectionRate + '%' },
            { label: 'Month-over-month', value: `${momArrow} ${Math.abs(momChange)}%` },
          ],
        },
        {
          title: 'License activity',
          dataRows: [
            { label: 'New licenses issued', value: String(issued.length) },
            { label: 'Licenses renewed', value: String(renewed.length) },
            { label: 'Licenses expired', value: String(expired.length) },
            { label: 'Licenses cancelled', value: String(cancelled.length) },
          ],
        },
        {
          title: 'Payment health',
          dataRows: [
            { label: 'Successful payments', value: String(paid.length) },
            { label: 'Failed / overdue payments', value: String(failedPayments.length) },
            { label: 'Outstanding balance', value: '$' + outstanding.toLocaleString('en-US') },
          ],
        },
        {
          title: 'Discount usage',
          dataRows: [
            { label: 'Discounted licenses', value: String(discounted.length) },
            { label: 'Total discounted', value: '$' + Math.round(totalDiscounted).toLocaleString('en-US') },
          ],
        },
        {
          title: 'Top 5 partners by revenue',
          dataRows: top5.length
            ? top5.map(([name, amt]) => ({ label: name || 'Partner', value: '$' + amt.toLocaleString('en-US') }))
            : [{ label: 'No revenue collected', value: '—' }],
        },
        {
          title: 'Renewals coming up next month',
          dataRows: [
            { label: 'Renewals due', value: String(renewalsNext.length) },
            { label: 'Pipeline value', value: '$' + renewalsValue.toLocaleString('en-US') },
          ],
        },
      ],
      ctaLabel: 'View Full Billing',
      ctaUrl: BILLING_URL,
      subject: `Monthly billing summary — ${monthLabel}`,
      dedup_key: previewRecipient ? '' : dedupKey,
      recipientOverride: previewRecipient || config.DIGEST_RECIPIENTS || '',
      recipientConfigKey: 'STRIPE_ADMIN_LIST',
      portalNotification: {
        type: 'general',
        title: `Monthly billing — ${monthLabel}`,
        message: `Collected $${totalCollected.toLocaleString('en-US')} (${collectionRate}% collection rate). ${failedPayments.length} failed payments.`,
        link: '/Billing',
      },
    });

    if (res?.data?.email_html) {
      try {
        const existingCfg = (await base44.asServiceRole.entities.AppConfig.filter({ key: 'LAST_MONTHLY_DIGEST' }))[0];
        if (existingCfg) await base44.asServiceRole.entities.AppConfig.update(existingCfg.id, { value: res.data.email_html, updated_by: 'system' });
        else await base44.asServiceRole.entities.AppConfig.create({ key: 'LAST_MONTHLY_DIGEST', value: res.data.email_html, updated_by: 'system' });
      } catch (e) { console.warn('[monthlyBillingSummary] save failed:', e.message); }
    }
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: 'system', actor_role: 'system', action: 'digest_sent',
        entity_type: 'AdminDigest', details: JSON.stringify({ dedup_key: dedupKey, recipients: res?.data?.recipients, month: monthLabel }),
      });
    } catch (e) {}

    return Response.json({ ok: true, sent: !res?.data?.skipped, month: monthLabel, collected: totalCollected, collectionRate });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});