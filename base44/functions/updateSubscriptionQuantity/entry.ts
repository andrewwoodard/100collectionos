import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import Stripe from 'npm:stripe@14';

// Updates the quantity billed on a partner's next renewal invoice.
// Applies the change with proration_behavior: 'none' so the current
// period is unaffected and the new quantity takes effect on the next invoice.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { subscription_id, customer_id, new_quantity } = body || {};
    const qty = Number(new_quantity);
    if (!subscription_id && !customer_id) {
      return Response.json({ error: 'subscription_id or customer_id is required' }, { status: 400 });
    }
    if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
      return Response.json({ error: 'new_quantity must be a positive whole number' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    let subId = subscription_id;
    if (!subId) {
      const subs = await stripe.subscriptions.list({
        customer: customer_id,
        status: 'all',
        limit: 50,
      });
      const live = subs.data.find(s => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status));
      if (!live) return Response.json({ error: 'No active subscription found for this customer.' }, { status: 404 });
      subId = live.id;
    }

    // Subscription schedules (sub_sched_*): set the current and future phases'
    // item quantities so the next renewal invoice bills the requested total.
    // Past (completed) phases are preserved unchanged. proration is disabled
    // so no immediate charge is created — the change takes effect on the next
    // invoice, matching the behavior for regular subscriptions below.
    if (subId.startsWith('sub_sched_')) {
      const schedule = await stripe.subscriptionSchedules.retrieve(subId, {
        expand: ['phases.items.price'],
      });
      const phases = schedule.phases || [];
      if (phases.length === 0) {
        return Response.json({ error: 'This schedule has no phases to update.' }, { status: 400 });
      }

      const now = Math.floor(Date.now() / 1000);
      const currentIdx = phases.findIndex(p => p.start_date <= now && (!p.end_date || p.end_date > now));

      const newPhases = phases.map((phase) => {
        const items = phase.items || [];
        const isPast = !!(phase.end_date && phase.end_date <= now);
        // Preserve completed phases, and any phase with no items (we can't
        // invent a price to add quantity to an empty phase).
        if (isPast || items.length === 0) {
          return {
            start_date: phase.start_date,
            end_date: phase.end_date,
            items: items.map(it => ({ price: it.price.id, quantity: it.quantity })),
          };
        }
        const total = items.reduce((s, it) => s + (it.quantity || 0), 0);
        let phaseItems;
        if (qty >= total) {
          // Increase (or no change): add the delta to the first item.
          const delta = qty - total;
          phaseItems = items.map((it, i) => ({
            price: it.price.id,
            quantity: i === 0 ? (it.quantity || 0) + delta : it.quantity,
          }));
        } else {
          // Decrease: remove/reduce items from the end until the total reaches qty.
          let toRemove = total - qty;
          const keep = new Map();
          for (const it of [...items].reverse()) {
            if (toRemove <= 0) { keep.set(it.id, it.quantity); continue; }
            const itemQty = it.quantity || 0;
            if (itemQty <= toRemove) { toRemove -= itemQty; }
            else { keep.set(it.id, itemQty - toRemove); toRemove = 0; }
          }
          phaseItems = items
            .filter(it => keep.has(it.id))
            .map(it => ({ price: it.price.id, quantity: keep.get(it.id) }));
        }
        return {
          start_date: phase.start_date,
          end_date: phase.end_date,
          items: phaseItems,
        };
      });

      await stripe.subscriptionSchedules.update(subId, {
        proration_behavior: 'none',
        phases: newPhases,
      });

      const currentPhase = currentIdx >= 0 ? phases[currentIdx] : phases[0];
      return Response.json({
        ok: true,
        schedule_id: subId,
        new_quantity: qty,
        phases_updated: phases.filter(p => !(p.end_date && p.end_date <= now)).length,
        next_invoice_at: currentPhase?.end_date || null,
      });
    }

    const sub = await stripe.subscriptions.retrieve(subId);
    const items = sub.items?.data || [];
    if (items.length === 0) {
      return Response.json({ error: 'Subscription has no line items to update.' }, { status: 400 });
    }

    // The subscription often has one line item PER property (each quantity 1),
    // not a single item whose quantity equals the property count. To make the
    // NEXT invoice bill exactly `qty` properties, we either add the delta to
    // the first item (when increasing) or remove/reduce items from the end
    // (when decreasing). proration_behavior 'none' means the change applies on
    // the next invoice with no immediate proration charge.
    const totalQuantity = items.reduce((sum, it) => sum + (it.quantity || 0), 0);

    if (qty === totalQuantity) {
      return Response.json({
        ok: true,
        subscription_id: subId,
        previous_total_quantity: totalQuantity,
        new_quantity: qty,
        items_changed: 0,
        next_invoice_at: sub.current_period_end || null,
      });
    }

    // Increasing: add the delta to the first item.
    if (qty > totalQuantity) {
      const target = items[0];
      const newQty = (target.quantity || 0) + (qty - totalQuantity);
      await stripe.subscriptionItems.update(target.id, {
        quantity: newQty,
        proration_behavior: 'none',
      });
      return Response.json({
        ok: true,
        subscription_id: subId,
        item_id: target.id,
        previous_quantity: target.quantity,
        previous_total_quantity: totalQuantity,
        item_new_quantity: newQty,
        new_quantity: qty,
        items_changed: 1,
        next_invoice_at: sub.current_period_end || null,
      });
    }

    // Decreasing: remove or reduce items from the end until the total reaches qty.
    let toRemove = totalQuantity - qty;
    const changed = [];
    for (const it of [...items].reverse()) {
      if (toRemove <= 0) break;
      const itemQty = it.quantity || 0;
      if (itemQty <= toRemove) {
        await stripe.subscriptionItems.del(it.id, { proration_behavior: 'none' });
        toRemove -= itemQty;
      } else {
        await stripe.subscriptionItems.update(it.id, {
          quantity: itemQty - toRemove,
          proration_behavior: 'none',
        });
        toRemove = 0;
      }
      changed.push(it.id);
    }

    return Response.json({
      ok: true,
      subscription_id: subId,
      previous_total_quantity: totalQuantity,
      new_quantity: qty,
      items_changed: changed.length,
      next_invoice_at: sub.current_period_end || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}