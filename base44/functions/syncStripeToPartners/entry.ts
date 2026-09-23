import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();

    // Pull partner emails from Base44 entities (source of truth for stripe_billing_email)
    const partnersRes = await base44.asServiceRole.entities.Partner.list('-created_date', 500);
    const base44Partners = partnersRes || [];

    // Build a map: supabase_id → email
    // Base44 partner id matches Supabase partner id
    const emailMap = {};
    for (const p of base44Partners) {
      const email = p.stripe_billing_email || p.primary_contact_email;
      if (p.id && email) emailMap[p.id] = { email, name: p.partner_name };
    }

    const results = [];

    for (const [partnerId, { email, name }] of Object.entries(emailMap)) {
      try {
        const customers = await stripe.customers.list({ email, limit: 1 });
        const customer = customers.data[0];
        if (!customer) {
          results.push({ id: partnerId, name, email, skipped: 'no stripe customer' });
          continue;
        }

        const invoices = await stripe.invoices.list({
          customer: customer.id,
          status: 'paid',
          limit: 100,
        });
        const lastInvoice = invoices.data[0];

        const now = Math.floor(Date.now() / 1000);
        const ONE_YEAR = 365 * 24 * 60 * 60;
        let property_credits = 0;
        let last_invoice_amount = null;
        let last_invoice_date = null;

        if (lastInvoice) {
          last_invoice_amount = lastInvoice.amount_paid / 100;
          last_invoice_date = new Date(lastInvoice.created * 1000).toISOString();
        }

        // Sum quantities from invoices within the 1-year active window.
        // Distinguish between annual (>$200/qty) and monthly (<=200/qty) pricing:
        // - Annual: count all invoices
        // - Monthly: count only the first invoice per 12-month window
        const monthlySeenByWindow = {};
        for (const invoice of invoices.data) {
          const invoiceCreated = invoice.created || 0;
          const activeUntil = invoiceCreated + ONE_YEAR;
          if (activeUntil >= now) {
            // Fetch ALL line items for this invoice (handles pagination beyond default 10)
            const allLines = [];
            for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 })) {
              allLines.push(line);
            }

            for (const line of allLines) {
              const qty = line.quantity || 0;
              const amount = line.amount || 0;
              const unitPrice = qty > 0 ? amount / qty : 0;
              const isAnnual = unitPrice > 200 * 100; // convert to cents

              if (isAnnual) {
                // Annual: always count
                property_credits += qty;
              } else {
                // Monthly: only count first one per window
                const windowStart = invoiceCreated - (invoiceCreated % ONE_YEAR);
                if (!monthlySeenByWindow[windowStart]) {
                  property_credits += qty;
                  monthlySeenByWindow[windowStart] = true;
                }
              }
            }
          }
        }

        // Count active properties for this partner by partner_name
        // (no status column — active is a boolean `active` field; partner linked by partner_name)
        const { count: activePropertyCount } = await supabase
          .from('properties')
          .select('*', { count: 'exact', head: true })
          .eq('partner_name', name)
          .eq('active', true);

        const updatePayload = {
          stripe_billing_email: email,
          last_invoice_amount,
          last_invoice_date,
          property_credits,
          active_property_count: activePropertyCount || 0,
        };

        const { error: uErr } = await supabase.from('partners').update(updatePayload).eq('id', partnerId);

        results.push({
          id: partnerId,
          name,
          email,
          last_invoice_amount,
          last_invoice_date,
          property_credits,
          saved: !uErr,
          save_error: uErr?.message,
        });
      } catch (e) {
        results.push({ id: partnerId, name, email, error: e.message });
      }
    }

    const saved = results.filter(r => r.saved).length;
    const saveErrors = results.filter(r => r.save_error);

    return Response.json({
      synced: saved,
      total_with_email: Object.keys(emailMap).length,
      results,
      note: saveErrors.length > 0
        ? 'Some saves failed — columns may not exist in Supabase. Run this SQL in Supabase SQL Editor: ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_billing_email text; ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_invoice_amount numeric; ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_invoice_date timestamptz; ALTER TABLE partners ADD COLUMN IF NOT EXISTS property_credits integer; ALTER TABLE partners ADD COLUMN IF NOT EXISTS active_property_count integer;'
        : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});