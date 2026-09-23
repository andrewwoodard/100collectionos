import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification when a Stripe payment fails.
// Called from stripeWebhook on invoice.payment_failed / charge.failed.
// Routes to STRIPE_ADMIN_LIST if set, else the main admin list.
// Idempotent via dedup_key = `payment_failed__${license_id}__${attempt_number}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      license_id, partner_name, property_name, license_number,
      amount, failure_reason, attempt_count, next_retry_date,
      invoice_url, partner_contact_name,
    } = body;

    const formattedAmount = typeof amount === 'number'
      ? '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : (amount || '—');

    const dataRows = [
      { label: 'Partner', value: partner_name || '—' },
      { label: 'Property', value: property_name || '—' },
      { label: 'License Number', value: license_number || '—' },
      { label: 'Amount', value: formattedAmount },
      { label: 'Failure Reason', value: failure_reason || '—' },
      { label: 'Attempts', value: String(attempt_count || 1) },
    ];
    if (next_retry_date) dataRows.push({ label: 'Next Retry', value: next_retry_date });

    const callout = partner_contact_name
      ? `Suggested next step: Reach out to ${partner_contact_name} to update their payment method.`
      : 'Suggested next step: Reach out to the partner to update their payment method.';

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'PAYMENT FAILED',
      template_slug: 'admin-payment-failed',
      template_context: { partner: { partner_name, contact_name: partner_contact_name }, property: { property_name }, invoice: { amount: formattedAmount, license_number, invoice_url, failure_reason, attempt_count, next_retry_date, license_id } },
      urgency: 'alert',
      headline: `Payment failed for ${partner_name || 'a partner'}`,
      subheadline: 'Immediate follow-up recommended',
      contextBlock: `A payment for ${property_name || 'a property'}'s license could not be processed.`,
      dataRows,
      callout,
      ctaLabel: 'View in Stripe',
      ctaUrl: invoice_url || 'https://dashboard.stripe.com/invoices',
      secondaryCtaLabel: 'Manage License',
      secondaryCtaUrl: license_id ? `https://100c-os.base44.app/Licenses?licenseId=${license_id}` : 'https://100c-os.base44.app/Licenses',
      subject: `Payment failed — ${formattedAmount} (${partner_name || 'partner'})`,
      dedup_key: `payment_failed__${license_id || 'nolicense'}__${attempt_count || 1}`,
      recipientConfigKey: 'STRIPE_ADMIN_LIST',
      portalNotification: {
        type: 'general',
        title: `Payment failed — ${partner_name || ''}`,
        message: `Payment of ${formattedAmount} failed for ${property_name || 'a property'}'s license. ${failure_reason || ''}`.trim(),
        partnerName: partner_name,
        link: license_id ? `/Licenses?licenseId=${license_id}` : '/Licenses',
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});