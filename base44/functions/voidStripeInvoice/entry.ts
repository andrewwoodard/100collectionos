import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const { invoice_id } = await req.json();
    if (!invoice_id) return Response.json({ error: 'Missing invoice_id' }, { status: 400 });

    // Only open invoices can be voided. Paid/void/uncollectible cannot be removed.
    const invoice = await stripe.invoices.retrieve(invoice_id);
    if (invoice.status !== 'open') {
      return Response.json({
        error: `Only open invoices can be voided. This invoice is "${invoice.status}".`,
      }, { status: 400 });
    }

    const voided = await stripe.invoices.voidInvoice(invoice_id);
    return Response.json({
      invoice_id: voided.id,
      status: voided.status,
      number: voided.number,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});