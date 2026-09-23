import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

// Accepts yyyy-mm-dd (and ISO strings). Returns a Date set to noon UTC of the
// given day, so the invoice anchors mid-day rather than midnight. Returns null
// for empty/invalid input.
function parseScheduleDate(value) {
  if (!value) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const d = new Date(isDateOnly ? `${value}T12:00:00Z` : value);
  if (isNaN(d.getTime())) return null;
  return d;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const { customer_id, license_unit_price, property_count, billing_interval, send_date } = await req.json();
    if (!customer_id) return Response.json({ error: 'customer_id is required' }, { status: 400 });
    if (!property_count || property_count < 1) return Response.json({ error: 'property_count must be at least 1' }, { status: 400 });

    // Optional scheduling: if send_date is a future date, anchor the subscription's
    // first invoice to that date instead of billing immediately. Stripe will create
    // and email the first invoice at the anchor time (collection_method: send_invoice).
    const scheduledAt = parseScheduleDate(send_date);
    const isScheduled = scheduledAt && scheduledAt.getTime() > Date.now();

    const interval = billing_interval === 'month' ? 'month' : 'year';
    const basePrice = Number(license_unit_price) > 0 ? Number(license_unit_price) : 1200;
    const unitAmount = interval === 'year'
      ? Math.round(basePrice * 100)
      : Math.round((basePrice / 12) * 100);

    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: unitAmount,
      recurring: { interval },
      product_data: { name: 'Property License' },
    });

    const subParams = {
      customer: customer_id,
      items: [{
        price: price.id,
        quantity: property_count,
      }],
      collection_method: 'send_invoice',
      days_until_due: 7,
      metadata: { source: '100c-os-admin' },
    };
    if (isScheduled) {
      subParams.billing_cycle_anchor = Math.floor(scheduledAt.getTime() / 1000);
      subParams.prorate = false;
    }

    const subscription = await stripe.subscriptions.create(subParams);

    // Finalize and email the first invoice to the customer.
    // When scheduled, the first invoice is created at the billing cycle anchor,
    // so we don't send it now — Stripe will email it on the scheduled date.
    let invoiceId = null;
    if (!isScheduled && subscription.latest_invoice) {
      try {
        const sent = await stripe.invoices.sendInvoice(subscription.latest_invoice);
        invoiceId = sent.id;
      } catch (_e) {
        invoiceId = subscription.latest_invoice;
      }
    }

    return Response.json({
      ok: true,
      subscription_id: subscription.id,
      invoice_id: invoiceId,
      scheduled: isScheduled,
      scheduled_for: isScheduled ? scheduledAt.toISOString() : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});