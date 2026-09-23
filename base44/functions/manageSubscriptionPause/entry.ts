import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import Stripe from 'npm:stripe@14';

// Pauses or restarts (resumes) a partner's recurring billing on a Stripe
// subscription. Pausing uses pause_collection behavior 'void' so no renewal
// invoices are created while paused; resuming clears the pause so renewals
// resume on the normal cycle. Admin-only.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { subscription_id, action } = body || {};
    if (!subscription_id) {
      return Response.json({ error: 'subscription_id is required' }, { status: 400 });
    }
    if (!['pause', 'resume'].includes(action)) {
      return Response.json({ error: 'action must be "pause" or "resume"' }, { status: 400 });
    }

    // Subscription schedules don't support pause_collection — they're managed
    // through phase edits, which is a different flow. Surface a clear message.
    if (subscription_id.startsWith('sub_sched_')) {
      return Response.json({
        error: 'Pausing is not supported for subscription schedules. Update the schedule phases instead.',
      }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const sub = await stripe.subscriptions.retrieve(subscription_id);

    if (!['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) {
      return Response.json({
        error: `Subscription status is "${sub.status}" and cannot be paused or resumed.`,
      }, { status: 400 });
    }

    if (action === 'pause') {
      await stripe.subscriptions.update(subscription_id, {
        pause_collection: { behavior: 'void' },
      });
      return Response.json({ ok: true, subscription_id, paused: true });
    }

    // Resume: clear the pause so renewals resume on the normal cycle.
    await stripe.subscriptions.update(subscription_id, {
      pause_collection: '',
    });
    return Response.json({ ok: true, subscription_id, paused: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}