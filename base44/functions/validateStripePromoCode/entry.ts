import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { promotion_code_id } = await req.json();
    if (!promotion_code_id) {
      return Response.json({ valid: false, error: 'No promotion code ID provided' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const promoCode = await stripe.promotionCodes.retrieve(promotion_code_id);

    if (!promoCode || !promoCode.active) {
      return Response.json({ valid: false, error: 'Promotion code not found or inactive in Stripe' });
    }

    return Response.json({
      valid: true,
      code: promoCode.code,
      coupon: {
        name: promoCode.coupon?.name,
        percent_off: promoCode.coupon?.percent_off,
        amount_off: promoCode.coupon?.amount_off,
      },
    });
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === 'resource_missing') {
      return Response.json({ valid: false, error: 'Promotion code not found or inactive in Stripe' });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});