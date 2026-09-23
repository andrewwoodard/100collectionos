import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { emails } = body;

    if (!emails || !Array.isArray(emails)) {
      return Response.json({ error: 'emails array required' }, { status: 400 });
    }

    const results = await Promise.all(
      emails.map(async (email) => {
        try {
          const customers = await stripe.customers.list({ email, limit: 10 });
          const customerInfos = await Promise.all(
            customers.data.map(async (cust) => {
              const subs = await stripe.subscriptions.list({
                customer: cust.id,
                status: 'all',
                limit: 100,
              });
              const scheds = await stripe.subscriptionSchedules.list({
                customer: cust.id,
                limit: 100,
                expand: ['data.phases.items.price'],
              });
              return {
                customer_id: cust.id,
                customer_email: cust.email,
                customer_name: cust.name,
                subscription_count: subs.data.length,
                subscriptions: subs.data.map(s => ({
                  id: s.id,
                  status: s.status,
                  schedule: s.schedule,
                  period_end: s.current_period_end,
                  period_end_date: s.current_period_end
                    ? new Date(s.current_period_end * 1000).toISOString().split('T')[0]
                    : null,
                  cancel_at_period_end: s.cancel_at_period_end,
                  amount: (s.items?.data || []).reduce((sum, i) => {
                    const ua = (i.price?.unit_amount || i.plan?.amount || 0) / 100;
                    return sum + (ua * (i.quantity || 0));
                  }, 0),
                })),
                schedule_count: scheds.data.length,
                schedules: scheds.data.map(sc => ({
                  id: sc.id,
                  status: sc.status,
                  subscription: sc.subscription,
                  end_behavior: sc.end_behavior,
                  phases: (sc.phases || []).map(p => ({
                    start: p.start_date,
                    start_date: p.start_date ? new Date(p.start_date * 1000).toISOString().split('T')[0] : null,
                    end: p.end_date,
                    end_date: p.end_date ? new Date(p.end_date * 1000).toISOString().split('T')[0] : null,
                    items: (p.items || []).map(i => ({
                      quantity: i.quantity,
                      price_id: typeof i.price === 'string' ? i.price : i.price?.id,
                      unit_amount: typeof i.price === 'object' ? i.price?.unit_amount : null,
                      interval: typeof i.price === 'object' ? i.price?.recurring?.interval : null,
                    })),
                  })),
                })),
              };
            })
          );
          return { email, customers_found: customers.data.length, customer_infos: customerInfos };
        } catch (e) {
          return { email, error: e.message };
        }
      })
    );

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});