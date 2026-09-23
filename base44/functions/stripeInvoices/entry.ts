import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { email } = await req.json();
    if (!email) return Response.json({ invoices: [] });

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) return Response.json({ invoices: [] });

    const invoiceList = await stripe.invoices.list({
      customer: customer.id,
      limit: 50,
    });

    // Only show open and paid invoices (exclude draft, void, uncollectible)
    // and deduplicate by invoice ID
    const seenIds = new Set();
    const invoices = [];
    for (const inv of invoiceList.data) {
      if (inv.status !== "open" && inv.status !== "paid") continue;
      if (seenIds.has(inv.id)) continue;
      seenIds.add(inv.id);

      // Fetch ALL line items (avoids the default 10-item pagination limit)
      const allLines = [];
      for await (const line of stripe.invoices.listLineItems(inv.id, { limit: 100 })) {
        allLines.push(line);
      }
      // Sum quantity across all line items
      const quantity = allLines.reduce((sum, line) => sum + (line.quantity || 0), 0);
      invoices.push({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        total: inv.total,
        amount_paid: inv.amount_paid,
        amount_due: inv.amount_due,
        created: inv.created,
        hosted_invoice_url: inv.hosted_invoice_url,
        description: inv.description,
        quantity,
        lines: allLines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          amount: l.amount,
        })),
      });
    }

    return Response.json({ invoices });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});