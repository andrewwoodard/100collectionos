import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification when a Stripe payment succeeds.
// Called from stripeWebhook on invoice.payment_succeeded / charge.succeeded.
// Routes to STRIPE_ADMIN_LIST if set, else the main admin list.
// Idempotent via dedup_key = `payment_success__${license_id}__${invoice_id}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      license_id, partner_name, property_name, license_number,
      amount, invoice_id, invoice_url, payment_method,
    } = body;

    if (!license_id && !invoice_id) return Response.json({ error: 'license_id or invoice_id required' }, { status: 400 });

    const formattedAmount = typeof amount === 'number'
      ? '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : (amount || '—');

    const dataRows = [
      { label: 'Partner', value: partner_name || '—' },
      { label: 'Property', value: property_name || '—' },
      { label: 'License Number', value: license_number || '—' },
      { label: 'Amount', value: formattedAmount },
      { label: 'Payment Method', value: payment_method || '—' },
    ];
    if (invoice_url) dataRows.push({ label: 'Stripe Invoice', value: invoice_url });

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'PAYMENT RECEIVED',
      template_slug: 'admin-payment-succeeded',
      template_context: { partner: { partner_name }, property: { property_name }, invoice: { amount: formattedAmount, license_number, invoice_url, payment_method, license_id, invoice_id } },
      urgency: 'success',
      headline: `Payment received from ${partner_name || 'a partner'}`,
      subheadline: `${partner_name || 'The partner'} just paid their license for ${property_name || 'a property'}.`,
      contextBlock: `A payment was successfully processed for ${property_name || 'this property'}'s license.`,
      dataRows,
      ctaLabel: 'View License',
      ctaUrl: license_id ? `https://100c-os.base44.app/Licenses?licenseId=${license_id}` : 'https://100c-os.base44.app/Licenses',
      subject: `Payment received — ${formattedAmount} (${partner_name || 'partner'})`,
      dedup_key: `payment_success__${license_id || 'nolicense'}__${invoice_id || 'noinvoice'}`,
      recipientConfigKey: 'STRIPE_ADMIN_LIST',
      portalNotification: {
        type: 'general',
        title: `Payment received — ${partner_name || ''}`,
        message: `${partner_name || 'A partner'} paid ${formattedAmount} for ${property_name || 'a property'}'s license.`,
        partnerName: partner_name,
        link: license_id ? `/Licenses?licenseId=${license_id}` : '/Licenses',
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});