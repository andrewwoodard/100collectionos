import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all license records that have a stripe_invoice_id but are missing invoice data
    const allLicenses = await base44.asServiceRole.entities.LicenseRecord.list('-created_date', 1000);
    const toBackfill = allLicenses.filter(l =>
      l.stripe_invoice_id &&
      (!l.invoice_date || !l.paid_date || l.annual_fee == null || !l.license_number)
    );

    if (toBackfill.length === 0) {
      return Response.json({ updated: 0, message: 'All licenses already have invoice data' });
    }

    // Group by invoice_id to minimize Stripe API calls
    const invoiceMap = {};
    for (const l of toBackfill) {
      if (!invoiceMap[l.stripe_invoice_id]) invoiceMap[l.stripe_invoice_id] = [];
      invoiceMap[l.stripe_invoice_id].push(l);
    }

    const tsToDate = (ts) => ts ? new Date(ts * 1000).toISOString().split('T')[0] : null;

    let updated = 0;
    const errors = [];

    for (const [invoiceId, licenses] of Object.entries(invoiceMap)) {
      try {
        const invoice = await stripe.invoices.retrieve(invoiceId);

        // Get all line items for this invoice
        const allLines = [];
        for await (const line of stripe.invoices.listLineItems(invoiceId, { limit: 100 })) {
          allLines.push(line);
        }

        const invoiceDate = tsToDate(invoice.created);
        const paidDate = tsToDate(invoice.status_transitions?.paid_at || invoice.created);
        const invoiceNumber = invoice.number;

        // For each line, compute unit price to find the annual fee
        // We want the annual fee per property slot from this invoice
        let annualFeeFromInvoice = null;
        for (const line of allLines) {
          const qty = line.quantity || 0;
          const amount = line.amount || 0;
          const unitPrice = qty > 0 ? amount / qty : 0;
          const isAnnual = unitPrice > 200 * 100;
          if (isAnnual) {
            annualFeeFromInvoice = unitPrice / 100;
            break;
          }
        }

        // Update each license tied to this invoice
        for (let i = 0; i < licenses.length; i++) {
          const l = licenses[i];
          const updates = {};

          if (!l.invoice_date && invoiceDate) updates.invoice_date = invoiceDate;
          if (!l.paid_date && paidDate) updates.paid_date = paidDate;
          if (l.annual_fee == null && annualFeeFromInvoice != null) updates.annual_fee = annualFeeFromInvoice;
          if (!l.license_number && invoiceNumber) {
            // Use invoice_number-{i+1} within this invoice group
            updates.license_number = `${invoiceNumber}-${i + 1}`;
          }

          if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.LicenseRecord.update(l.id, updates);
            updated++;
          }
        }
      } catch (e) {
        errors.push({ invoiceId, error: e.message });
      }
    }

    return Response.json({ updated, total: toBackfill.length, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});