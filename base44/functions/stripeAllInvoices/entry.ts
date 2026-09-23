import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all partners with a stripe_billing_email from Base44
    const partners = await base44.asServiceRole.entities.Partner.list();
    const partnerEmails = partners
      .filter(p => p.stripe_billing_email)
      .map(p => ({ id: p.id, name: p.partner_name, email: p.stripe_billing_email }));

    if (partnerEmails.length === 0) {
      return Response.json({ invoices: [] });
    }

    // For each partner email, look up Stripe customer + invoices
    const results = await Promise.all(
      partnerEmails.map(async ({ id, name, email }) => {
        try {
          const customers = await stripe.customers.list({ email, limit: 1 });
          const customer = customers.data[0];
          if (!customer) return [];

          const invoiceList = await stripe.invoices.list({
            customer: customer.id,
            limit: 100,
          });

          const subList = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'all',
            limit: 100,
          });

          // Fetch subscription schedules (sub_sched_ IDs) — these manage
          // recurring billing separately from regular subscriptions
          const schedList = await stripe.subscriptionSchedules.list({
            customer: customer.id,
            limit: 100,
            expand: ['data.phases.items.price'],
          });

          // Build lookup maps from ALL subscriptions (including canceled)
          // so historical invoices linked to canceled subs can resolve quantity
          const subMap = new Map();
          const partnerUnitAmount = new Map();
          for (const sub of subList.data) {
            const items = sub.items.data || [];
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            const firstItem = items[0] || {};
            const unitAmount = (firstItem.price?.unit_amount || firstItem.plan?.amount || 0) / 100;
            subMap.set(sub.id, { quantity: totalQuantity || 1, unit_amount: unitAmount });
            if (!partnerUnitAmount.has(id) && unitAmount > 0) {
              partnerUnitAmount.set(id, unitAmount);
            }
          }

          const nowSec = Math.floor(Date.now() / 1000);

          // Build set of active schedule IDs — subscriptions managed by active
          // schedules will be replaced by schedule data to avoid double-counting
          const activeScheduleIds = new Set(
            schedList.data.filter(s => s.status === 'active').map(s => s.id)
          );

          // Include active/trialing/past_due/unpaid subs AND canceled subs
          // whose period_end is still in the future (cancel-at-period-end).
          // Skip subscriptions managed by active schedules (handled below).
          const includedSubIds = new Set();
          const subscriptions = subList.data
            .filter(sub => {
              if (sub.schedule && activeScheduleIds.has(sub.schedule)) return false;
              if (sub.status === 'active' || sub.status === 'trialing' ||
                  sub.status === 'past_due' || sub.status === 'unpaid') {
                includedSubIds.add(sub.id);
                return true;
              }
              if (sub.status === 'canceled' && sub.current_period_end > nowSec) {
                includedSubIds.add(sub.id);
                return true;
              }
              return false;
            })
            .map(sub => {
              const items = sub.items.data || [];
              const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
              const firstItem = items[0] || {};
              const plan = firstItem.plan || {};
              const unitAmount = (firstItem.price?.unit_amount || plan.amount || 0) / 100;
              const totalAmount = items.reduce((sum, item) => {
                const ua = (item.price?.unit_amount || item.plan?.amount || 0) / 100;
                return sum + (ua * (item.quantity || 0));
              }, 0);
              return {
                id: sub.id,
                status: sub.status,
                customer_id: customer.id,
                partner_id: id,
                partner_name: name,
                partner_email: email,
                current_period_end: sub.current_period_end,
                current_period_start: sub.current_period_start,
                interval: plan.interval, // 'month' or 'year'
                interval_count: plan.interval_count || 1,
                quantity: totalQuantity || 1,
                unit_amount: unitAmount,
                amount: totalAmount,
                currency: plan.currency,
                plan_name: plan.nickname || firstItem.price?.nickname || null,
                canceled_at: sub.canceled_at,
              };
            });

          // Convert active subscription schedules to the same format.
          // For each schedule, find the current phase and the next phase.
          // Use the NEXT phase's pricing (that's what will be charged at renewal)
          // falling back to the current phase if there's no next phase.
          const scheduledSubs = schedList.data
            .filter(sched => sched.status === 'active')
            .map(sched => {
              const phases = sched.phases || [];
              const currentPhase = phases.find(p =>
                p.start_date <= nowSec && (!p.end_date || p.end_date > nowSec)
              );
              if (!currentPhase) return null;

              // Find the next phase (starts at or after current phase end)
              const nextPhase = currentPhase.end_date
                ? phases.find(p => p.start_date >= currentPhase.end_date && p !== currentPhase)
                : null;

              // Use next phase pricing if available (renewal amount), else current
              const pricingPhase = nextPhase || currentPhase;
              const renewalEndDate = currentPhase.end_date;

              const totalQuantity = pricingPhase.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 1;
              const unitAmount = ((pricingPhase.items?.[0]?.price?.unit_amount) || 0) / 100;
              const totalAmount = pricingPhase.items?.reduce((sum, i) => {
                const ua = (i.price?.unit_amount || 0) / 100;
                return sum + (ua * (i.quantity || 0));
              }, 0) || 0;

              // If next phase exists, period_end is the transition date.
              // If not and current phase has no end_date, calculate based on interval.
              let periodEnd;
              if (renewalEndDate) {
                periodEnd = renewalEndDate;
              } else {
                const intervalSecs = (pricingPhase.items?.[0]?.price?.recurring?.interval === 'year' ? 365 : 30) * 86400;
                periodEnd = pricingPhase.start_date + intervalSecs;
              }

              return {
                id: sched.id,
                status: 'active',
                customer_id: customer.id,
                partner_id: id,
                partner_name: name,
                partner_email: email,
                current_period_end: periodEnd,
                current_period_start: currentPhase.start_date,
                interval: pricingPhase.items?.[0]?.price?.recurring?.interval || 'month',
                interval_count: pricingPhase.items?.[0]?.price?.recurring?.interval_count || 1,
                quantity: totalQuantity,
                unit_amount: unitAmount,
                amount: totalAmount,
                currency: sched.currency || 'usd',
                plan_name: pricingPhase.items?.[0]?.price?.nickname || null,
                canceled_at: null,
                is_schedule: true,
              };
            })
            .filter(Boolean);

          subscriptions.push(...scheduledSubs);

          const invoices = invoiceList.data.map(inv => {
            const lineItems = inv.lines?.data || [];
            const lineItemQty = lineItems.reduce((sum, line) => sum + (line.quantity || 0), 0);
            const subInfo = inv.subscription ? subMap.get(inv.subscription) : null;
            // Resolve unit price: invoice's subscription first, then any
            // subscription for this partner, then the invoice's own line items
            const lineUnitAmount = lineItems[0]?.price?.unit_amount
              ? lineItems[0].price.unit_amount / 100 : 0;
            const unitAmount = subInfo?.unit_amount || partnerUnitAmount.get(id) || lineUnitAmount || 0;
            // Calculate property count from invoice total / unit price — more
            // reliable than lines.data which is paginated on the list endpoint
            let quantity = lineItemQty || 1;
            if (unitAmount > 0 && inv.total > 0) {
              const calcQty = Math.round((inv.total / 100) / unitAmount);
              if (calcQty > 0) quantity = calcQty;
            }
            return {
              id: inv.id,
              number: inv.number,
              status: inv.status,
              amount_paid: inv.amount_paid / 100,
              amount_due: inv.amount_due / 100,
              total: inv.total / 100,
              created: inv.created,
              due_date: inv.due_date,
              period_start: inv.period_start,
              period_end: inv.period_end,
              hosted_invoice_url: inv.hosted_invoice_url,
              partner_id: id,
              partner_name: name,
              partner_email: email,
              customer_id: customer.id,
              subscription_id: inv.subscription,
              quantity,
            };
          });

          return { invoices, subscriptions };
        } catch (_) {
          return { invoices: [], subscriptions: [] };
        }
      })
    );

    // Flatten, filter to open/paid only, and deduplicate by invoice ID
    const seenIds = new Set();
    const invoices = results
      .flatMap(r => r.invoices)
      .filter(inv => (inv.status === "open" || inv.status === "paid") && !seenIds.has(inv.id) && seenIds.add(inv.id))
      .sort((a, b) => b.created - a.created);
    const subscriptions = results.flatMap(r => r.subscriptions);
    return Response.json({ invoices, subscriptions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});