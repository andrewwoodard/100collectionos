import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { emails } = await req.json();
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return Response.json({ customers: {} });
    }

    // Look up customers by email in parallel
    const results = await Promise.all(
      emails.map(async (email) => {
        try {
          const customers = await stripe.customers.list({ email, limit: 1 });
          const customer = customers.data[0];
          if (!customer) return { email, data: null };

          // Get all paid invoices (without auto-expanding lines — we'll fetch them separately)
          const invoices = await stripe.invoices.list({
            customer: customer.id,
            status: 'paid',
            limit: 100,
          });

          const now = Math.floor(Date.now() / 1000);
          const ONE_YEAR = 365 * 24 * 60 * 60;
          const lastInvoice = invoices.data[0]; // most recent for display

          // Sum all paid invoices in the last 12 months using `total` (covers credit-settled invoices too)
          const annual_spend = invoices.data
            .filter(inv => inv.created >= now - ONE_YEAR)
            .reduce((sum, inv) => sum + (inv.total || 0), 0) / 100;

          // Count credits from ACTIVE SUBSCRIPTIONS, not invoices.
          // Each active subscription represents the current license entitlement —
          // counting it once eliminates double-counting from multiple invoices
          // per subscription (monthly cycles, annual renewals, etc.).
          const tsToDate = (ts) => ts ? new Date(ts * 1000).toISOString().split("T")[0] : null;

          const subList = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'all',
            limit: 100,
            expand: ['data.latest_invoice'],
          });

          const schedList = await stripe.subscriptionSchedules.list({
            customer: customer.id,
            limit: 100,
            expand: ['data.phases.items.price'],
          });

          // Subscriptions managed by active schedules are counted via the
          // schedule itself to avoid double-counting.
          const activeScheduleIds = new Set(
            schedList.data.filter(s => s.status === 'active').map(s => s.id)
          );

          const credit_slots = [];

          // 1. Count from regular subscriptions
          for (const sub of subList.data) {
            // Skip subs managed by active schedules (counted below)
            if (sub.schedule && activeScheduleIds.has(sub.schedule)) continue;

            const isActive = ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status);
            // Include canceled subs still within their period (cancel-at-period-end)
            const isCanceledActive = sub.status === 'canceled' && (sub.current_period_end || 0) > now;
            if (!isActive && !isCanceledActive) continue;

            // Only count credits when the latest invoice has been paid.
            // send_invoice subscriptions are 'active' immediately but the first
            // invoice may still be open/unpaid — those licenses are not usable yet.
            const latestInvoiceStatus = sub.latest_invoice?.status;
            if (latestInvoiceStatus && latestInvoiceStatus !== 'paid') continue;

            const items = sub.items?.data || [];
            for (const item of items) {
              const qty = item.quantity || 0;
              const unitAmount = (item.price?.unit_amount || item.plan?.amount || 0) / 100;
              const slotBase = {
                subscription_id: sub.id,
                status: sub.status,
                line_description: item.price?.nickname || item.plan?.nickname || "",
                period_start: sub.current_period_start || 0,
                period_end: sub.current_period_end || 0,
                unit_price: unitAmount,
                invoice_date: null,
                paid_date: null,
                paused: !!sub.pause_collection,
                resumes_at: sub.pause_collection?.resumes_at || null,
              };
              for (let i = 0; i < qty; i++) {
                credit_slots.push({ ...slotBase });
              }
            }
          }

          // 2. Count from active subscription schedules
          for (const sched of schedList.data.filter(s => s.status === 'active')) {
            const phases = sched.phases || [];
            const currentPhase = phases.find(p =>
              p.start_date <= now && (!p.end_date || p.end_date > now)
            );
            if (!currentPhase) continue;

            for (const item of (currentPhase.items || [])) {
              const qty = item.quantity || 0;
              const unitAmount = (item.price?.unit_amount || 0) / 100;
              const interval = item.price?.recurring?.interval || 'year';
              const slotBase = {
                subscription_id: sched.id,
                status: 'active',
                line_description: item.price?.nickname || "",
                period_start: currentPhase.start_date || 0,
                period_end: currentPhase.end_date || 0,
                unit_price: unitAmount,
                invoice_date: null,
                paid_date: null,
                paused: false,
                resumes_at: null,
              };
              for (let i = 0; i < qty; i++) {
                credit_slots.push({ ...slotBase });
              }
            }
          }

          // 3. Count credits from one-time paid invoices (no subscription).
          // These are license purchases made via send_invoice that aren't
          // tied to a recurring subscription — each line item quantity is a
          // license. Subscription invoices are skipped because they're already
          // counted via the subscription above.
          //
          // IMPORTANT: Annual renewal invoices repeat the same line items each
          // year, so we deduplicate by line_description — keeping only the most
          // recent occurrence (invoices are sorted most-recent-first by Stripe).
          // Without this, a partner on their 3rd annual cycle would show 3x
          // their actual license count.
          const seenDescriptions = new Set();
          for (const inv of invoices.data) {
            if (inv.subscription) continue; // skip subscription invoices
            try {
              const allLines = [];
              for await (const line of stripe.invoices.listLineItems(inv.id, { limit: 100 })) {
                allLines.push(line);
              }
              for (const line of allLines) {
                const qty = line.quantity || 0;
                if (qty <= 0) continue;
                const desc = line.description || "";
                // Skip line items we've already seen in a more recent invoice
                // (annual renewal of the same property license)
                if (desc && seenDescriptions.has(desc)) continue;
                if (desc) seenDescriptions.add(desc);
                const unitAmount = line.amount && qty ? line.amount / qty / 100 : 0;
                const slotBase = {
                  subscription_id: null,
                  invoice_id: inv.id,
                  invoice_number: inv.number || null,
                  status: 'paid',
                  line_description: desc,
                  period_start: inv.period_start || inv.created || 0,
                  period_end: inv.period_end || 0,
                  unit_price: unitAmount,
                  invoice_date: tsToDate(inv.created),
                  paid_date: tsToDate(inv.status_transitions?.paid_at || inv.created),
                };
                for (let i = 0; i < qty; i++) {
                  credit_slots.push({ ...slotBase });
                }
              }
            } catch (e) {
              // Skip this invoice if line items can't be fetched
              continue;
            }
          }

          // Determine billing cycle from the most recent paid invoice's line period
          let billing_cycle = null;
          if (lastInvoice) {
            const firstPeriod = lastInvoice.lines?.data?.[0]?.period;
            const pStart = firstPeriod?.start || lastInvoice.created || 0;
            const pEnd = firstPeriod?.end || 0;
            const pDays = pEnd > pStart ? Math.floor((pEnd - pStart) / 86400) : 365;
            billing_cycle = pDays < 100 ? "monthly" : "annual";
          }

          return {
            email,
            data: {
              customer_id: customer.id,
              last_invoice_amount: lastInvoice ? (lastInvoice.total ?? lastInvoice.amount_paid) / 100 : null,
              last_invoice_date: lastInvoice ? lastInvoice.created : null,
              billing_cycle,
              property_credits: credit_slots.length,
              credit_slots,
              annual_spend,
              paid_invoices_count: invoices.data.length,
            },
          };
        } catch (e) {
          return { email, data: null };
        }
      })
    );

    const customers = {};
    for (const r of results) {
      if (r.data) customers[r.email] = r.data;
    }

    return Response.json({ customers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});