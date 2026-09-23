import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { promo_id } = await req.json();
    if (!promo_id) return Response.json({ code: null });

    const promoCode = await stripe.promotionCodes.retrieve(promo_id);
    if (!promoCode?.active) return Response.json({ code: null });

    return Response.json({ code: promoCode.code });
  } catch (_) {
    return Response.json({ code: null });
  }
});