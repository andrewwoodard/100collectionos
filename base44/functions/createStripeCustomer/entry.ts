import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const { email, name } = await req.json();
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    // Check if a customer already exists for this email
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data[0]) {
      return Response.json({ ok: true, customer_id: existing.data[0].id, already_existed: true });
    }

    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { source: '100c-os' },
    });

    return Response.json({ ok: true, customer_id: customer.id, already_existed: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});