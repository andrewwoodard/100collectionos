import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const base44 = createClientFromRequest(req);

  // Handle checkout.session.completed — create license records
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Only process subscription checkouts
    if (session.mode !== "subscription") {
      return Response.json({ received: true });
    }

    const partnerId = session.metadata?.partner_id || '';
    const partnerName = session.metadata?.partner_name || '';
    const userId = session.metadata?.user_id || '';

    // Get the line items to find quantity
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    const totalLicenses = lineItems.data.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // Get subscription to find billing interval and amount
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const priceItem = subscription.items.data[0];
    const interval = priceItem?.price?.recurring?.interval || 'month';
    const unitAmount = priceItem?.price?.unit_amount || 4150;
    const baseFee = interval === 'year' ? unitAmount / 100 : (unitAmount / 100) * 12;

    // Fetch partner to capture discount fields at time of purchase
    let discountPct = 0;
    let discountLabel = null;
    if (partnerId) {
      const partnerRecords = await base44.asServiceRole.entities.Partner.filter({ id: partnerId });
      const partnerRecord = partnerRecords[0];
      discountPct = partnerRecord?.discount_percent || 0;
      discountLabel = partnerRecord?.discount_label || null;
    }
    const annualFee = +(baseFee * (1 - discountPct / 100)).toFixed(2);

    // Create one LicenseRecord per license purchased
    const licensePromises = [];
    for (let i = 0; i < totalLicenses; i++) {
      const licNum = `100C-${Date.now().toString(36).toUpperCase()}-${i + 1}`;
      licensePromises.push(
        base44.asServiceRole.entities.LicenseRecord.create({
          partner_id: partnerId,
          partner_name: partnerName,
          property_name: "Unassigned",
          license_number: licNum,
          license_status: "pending",
          payment_status: "paid",
          base_fee: 498,
          discount_applied_percent: discountPct,
          discount_applied_label: discountLabel,
          annual_fee: annualFee,
          stripe_invoice_id: subscription.latest_invoice || '',
          license_start_date: new Date().toISOString().split("T")[0],
          notes: `Created via Stripe checkout session ${session.id}`,
        })
      );
    }

    await Promise.all(licensePromises);
    console.log(`Created ${totalLicenses} license(s) for partner "${partnerName}" (user: ${userId})`);
    return Response.json({ received: true });
  }

  // Handle customer.subscription.deleted — cancel associated licenses
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const invoiceId = subscription.latest_invoice || '';

    if (invoiceId) {
      // Find all licenses tied to this subscription via invoice ID
      const allLicenses = await base44.asServiceRole.entities.LicenseRecord.list();
      const toCancel = allLicenses.filter(l => l.stripe_invoice_id === invoiceId);

      await Promise.all(
        toCancel.map(l =>
          base44.asServiceRole.entities.LicenseRecord.update(l.id, {
            license_status: "cancelled",
            payment_status: "unpaid",
            notes: (l.notes || '') + ` | Cancelled via Stripe subscription deletion ${subscription.id}`,
          })
        )
      );
      console.log(`Cancelled ${toCancel.length} license(s) for subscription ${subscription.id}`);
    }

    return Response.json({ received: true });
  }

  // Handle invoice.payment_succeeded — notify admins of payment received
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    const invoiceId = invoice.id || '';
    const amount = invoice.amount_paid ? invoice.amount_paid / 100 : null;
    const invoiceUrl = invoice.hosted_invoice_url || '';
    const paymentMethod = invoice.collection_method === 'send_invoice' ? 'Invoice' : 'Card';

    // Find the license tied to this invoice
    let license = null;
    try {
      const allLic = await base44.asServiceRole.entities.LicenseRecord.list('-created_date', 500);
      license = allLic.find(l => l.stripe_invoice_id === invoiceId) || allLic.find(l => l.stripe_invoice_id === (invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription) || '');
    } catch (e) {}

    try {
      await base44.functions.invoke('notifyAdminsPaymentSucceeded', {
        license_id: license?.id,
        partner_name: license?.partner_name || invoice.customer_name || '',
        property_name: license?.property_name || '',
        license_number: license?.license_number || '',
        amount,
        invoice_id: invoiceId,
        invoice_url: invoiceUrl,
        payment_method: paymentMethod,
      });
    } catch (e) {
      console.warn('[stripeWebhook] payment succeeded notify failed:', e.message);
    }
    return Response.json({ received: true });
  }

  // Handle invoice.payment_failed — notify admins of payment failure
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    const invoiceId = invoice.id || '';
    const amount = invoice.amount_due ? invoice.amount_due / 100 : null;
    const invoiceUrl = invoice.hosted_invoice_url || '';
    const attemptCount = invoice.attempt_count || 1;
    const nextRetry = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()
      : '';

    let license = null;
    let partnerContact = '';
    try {
      const allLic = await base44.asServiceRole.entities.LicenseRecord.list('-created_date', 500);
      license = allLic.find(l => l.stripe_invoice_id === invoiceId);
      if (license?.partner_id) {
        const partners = await base44.asServiceRole.entities.Partner.filter({ id: license.partner_id });
        partnerContact = partners[0]?.primary_contact_name || partners[0]?.primary_contact_email || '';
      }
    } catch (e) {}

    try {
      await base44.functions.invoke('notifyAdminsPaymentFailed', {
        license_id: license?.id,
        partner_name: license?.partner_name || invoice.customer_name || '',
        property_name: license?.property_name || '',
        license_number: license?.license_number || '',
        amount,
        failure_reason: invoice.last_finalization_error?.message || invoice.status || 'Payment failed',
        attempt_count: attemptCount,
        next_retry_date: nextRetry,
        invoice_url: invoiceUrl,
        partner_contact_name: partnerContact,
      });
    } catch (e) {
      console.warn('[stripeWebhook] payment failed notify failed:', e.message);
    }
    return Response.json({ received: true });
  }

  return Response.json({ received: true });
});