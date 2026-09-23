import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { quantity = 1, billing_interval = 'month', success_url, cancel_url } = body;

    // Find the partner linked to this user — use service role to bypass RLS, try multiple fields
    let partners = await base44.asServiceRole.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } });
    if (partners.length === 0) {
      partners = await base44.asServiceRole.entities.Partner.filter({ stripe_billing_email: user.email });
    }
    if (partners.length === 0) {
      partners = await base44.asServiceRole.entities.Partner.filter({ primary_contact_email: user.email });
    }

    const partner = partners[0] || null;
    const billingEmail = partner?.stripe_billing_email || user.email;
    const partnerName = partner?.partner_name || user.full_name || user.email;

    // Find or create the Stripe customer by email
    let customerId;
    const customers = await stripe.customers.list({ email: billingEmail, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: billingEmail,
        name: partnerName,
        metadata: { partner_id: partner?.id || '', user_id: user.id },
      });
      customerId = customer.id;
    }

    // Pricing: admin-set annual license unit price (default $1,200) for a single
    // license, $498/year each for 2+, or $41.50/month
    const isAnnual = billing_interval === 'year';
    const basePrice = Number(partner?.license_unit_price) > 0 ? Number(partner.license_unit_price) : 1200;
    const unitAmount = isAnnual ? (quantity === 1 ? Math.round(basePrice * 100) : 49800) : 4150;
    const description = isAnnual
      ? 'Annual license fee per property listed on the 100 Collection'
      : 'Monthly license fee per property listed on the 100 Collection';

    // Create a Stripe Checkout session for a license subscription
    const sessionParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Property License',
              description,
            },
            unit_amount: unitAmount,
            recurring: { interval: billing_interval },
          },
          quantity,
        },
      ],
      success_url: success_url,
      cancel_url: cancel_url,
      metadata: {
        partner_id: partner?.id || '',
        partner_name: partnerName,
        user_id: user.id,
        discount_percent: String(partner?.discount_percent || 0),
        discount_label: partner?.discount_label || '',
      },
    };

    // Pre-apply promo code if partner has one; otherwise let them enter one manually
    if (partner?.stripe_promotion_code) {
      sessionParams.discounts = [{ promotion_code: partner.stripe_promotion_code }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});