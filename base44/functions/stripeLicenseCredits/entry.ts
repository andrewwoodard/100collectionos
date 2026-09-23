import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

const ONE_YEAR = 365 * 24 * 60 * 60;
const tsToDate = (ts) => ts ? new Date(ts * 1000).toISOString().split('T')[0] : null;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all partners and all license records in parallel
    const [partners, licenseRecords] = await Promise.all([
      base44.asServiceRole.entities.Partner.list(),
      base44.asServiceRole.entities.LicenseRecord.list('-created_date', 1000),
    ]);

    const partnersWithEmail = partners.filter(p => p.stripe_billing_email);

    // Build a lookup: partner_id -> queue of license records, property-linked first.
    // This lets us attach the real property/assignment to each subscription slot.
    const licensesByPartner = {};
    for (const lr of licenseRecords) {
      const key = lr.partner_id || lr.partner_name;
      if (!key) continue;
      if (!licensesByPartner[key]) licensesByPartner[key] = [];
      const linked = !!(lr.property_id || lr.property_name);
      licensesByPartner[key].push({ lr, linked });
    }
    // Sort each partner's queue so linked records come first
    for (const key of Object.keys(licensesByPartner)) {
      licensesByPartner[key].sort((a, b) => (b.linked ? 1 : 0) - (a.linked ? 1 : 0));
    }

    const now = Math.floor(Date.now() / 1000);

    // For each partner, fetch Stripe invoices and expand credit slots
    const allRows = [];

    // Helper: attach the next available license record for a partner to a slot
    const attachLicense = (slot, partner) => {
      const queue = licensesByPartner[partner.id] || licensesByPartner[partner.partner_name];
      if (queue && queue.length) {
        const { lr } = queue.shift();
        slot.license_record_id = lr.id || null;
        slot.property_name = lr.property_name || null;
        slot.property_id = lr.property_id || null;
        slot.license_number = lr.license_number || slot.license_number;
        slot.license_status = lr.license_status || slot.license_status;
        slot.is_deal = !!lr.is_deal;
        slot.deal_notes = lr.deal_notes || null;
        slot.notes = lr.notes || null;
        if (lr.stripe_invoice_id) {
          slot.stripe_invoice_id = lr.stripe_invoice_id;
          slot.stripe_invoice_number = lr.stripe_invoice_number || slot.stripe_invoice_number;
        }
        if (lr.annual_fee != null && (slot.is_deal || slot.annual_fee == null)) {
          slot.annual_fee = lr.annual_fee;
        }
      }
      return slot;
    };

    await Promise.all(partnersWithEmail.map(async (partner) => {
      try {
        const customers = await stripe.customers.list({ email: partner.stripe_billing_email, limit: 1 });
        const customer = customers.data[0];
        if (!customer) return;

        const invoiceList = await stripe.invoices.list({
          customer: customer.id,
          status: 'paid',
          limit: 100,
        });

        // Count credits from ACTIVE SUBSCRIPTIONS instead of invoices.
        // Each active subscription = current entitlement, counted once.
        // This eliminates double-counting from monthly invoice accumulation,
        // annual renewal overlaps, and multiple invoices per subscription.
        const subList = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'all',
          limit: 100,
        });

        const schedList = await stripe.subscriptionSchedules.list({
          customer: customer.id,
          limit: 100,
          expand: ['data.phases.items.price'],
        });

        const activeScheduleIds = new Set(
          schedList.data.filter(s => s.status === 'active').map(s => s.id)
        );

        const partnerSlots = [];

        // Process regular subscriptions
        for (const sub of subList.data) {
          if (sub.schedule && activeScheduleIds.has(sub.schedule)) continue;

          const isActive = ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status);
          const isCanceledActive = sub.status === 'canceled' && (sub.current_period_end || 0) > now;
          if (!isActive && !isCanceledActive) continue;

          const items = sub.items?.data || [];
          let slotIndex = 0;
          for (const item of items) {
            const qty = item.quantity || 0;
            if (qty <= 0) continue;
            const unitAmount = (item.price?.unit_amount || item.plan?.amount || 0) / 100;
            const interval = item.price?.recurring?.interval || item.plan?.interval || 'year';
            const periodDays = (sub.current_period_end || 0) - (sub.current_period_start || 0);
            const isMonthly = periodDays > 0 && periodDays < 100 * 86400;
            const annualFee = isMonthly ? unitAmount * 12 : unitAmount;
            const activeUntil = sub.current_period_end || 0;

            for (let i = 0; i < qty; i++) {
              slotIndex++;
              const licenseNumber = `${sub.id}-${slotIndex}`;
              partnerSlots.push({
                stripe_invoice_id: null,
                stripe_invoice_number: null,
                stripe_invoice_url: null,
                stripe_customer_id: customer.id,
                invoice_date: tsToDate(sub.current_period_start),
                paid_date: tsToDate(sub.current_period_start),
                annual_fee: annualFee,
                license_number: licenseNumber,
                is_active: activeUntil >= now,
                period_end: tsToDate(activeUntil),
                line_description: item.price?.nickname || item.plan?.nickname || '',
                partner_id: partner.id,
                partner_name: partner.partner_name,
                partner_email: partner.stripe_billing_email,
                license_record_id: null,
                property_name: null,
                property_id: null,
                license_status: activeUntil >= now ? 'active' : 'expired',
                is_deal: false,
                deal_notes: null,
                notes: null,
              });
            }
          }
        }

        // Process active subscription schedules
        for (const sched of schedList.data.filter(s => s.status === 'active')) {
          const phases = sched.phases || [];
          const currentPhase = phases.find(p =>
            p.start_date <= now && (!p.end_date || p.end_date > now)
          );
          if (!currentPhase) continue;

          let slotIndex = 0;
          for (const item of (currentPhase.items || [])) {
            const qty = item.quantity || 0;
            if (qty <= 0) continue;
            const unitAmount = (item.price?.unit_amount || 0) / 100;
            const interval = item.price?.recurring?.interval || 'year';
            const isMonthly = interval === 'month';
            const annualFee = isMonthly ? unitAmount * 12 : unitAmount;
            const activeUntil = currentPhase.end_date || 0;

            for (let i = 0; i < qty; i++) {
              slotIndex++;
              const licenseNumber = `${sched.id}-${slotIndex}`;
              partnerSlots.push({
                stripe_invoice_id: null,
                stripe_invoice_number: null,
                stripe_invoice_url: null,
                stripe_customer_id: customer.id,
                invoice_date: tsToDate(currentPhase.start_date),
                paid_date: tsToDate(currentPhase.start_date),
                annual_fee: annualFee,
                license_number: licenseNumber,
                is_active: activeUntil >= now,
                period_end: tsToDate(activeUntil),
                line_description: item.price?.nickname || '',
                partner_id: partner.id,
                partner_name: partner.partner_name,
                partner_email: partner.stripe_billing_email,
                license_record_id: null,
                property_name: null,
                property_id: null,
                license_status: activeUntil >= now ? 'active' : 'expired',
                is_deal: false,
                deal_notes: null,
                notes: null,
              });
            }
          }
        }

        // Attach real license records (with property links) to the slots
        for (const slot of partnerSlots) {
          attachLicense(slot, partner);
          allRows.push(slot);
        }
      } catch (_) {
        // Skip failed partners
      }
    }));

    // Any license records not consumed by a subscription slot still represent
    // real licenses linked to properties — include them so the "Linked to
    // Property" count reflects every license in the system, not just those
    // with a matching active subscription.
    for (const key of Object.keys(licensesByPartner)) {
      const queue = licensesByPartner[key];
      for (const { lr } of queue) {
        allRows.push({
          stripe_invoice_id: lr.stripe_invoice_id || null,
          stripe_invoice_number: lr.stripe_invoice_number || null,
          stripe_invoice_url: lr.stripe_invoice_url || null,
          stripe_customer_id: null,
          invoice_date: lr.invoice_date || null,
          paid_date: lr.paid_date || null,
          annual_fee: lr.annual_fee != null ? lr.annual_fee : null,
          license_number: lr.license_number || null,
          is_active: lr.license_status === 'active',
          period_end: lr.license_end_date || null,
          line_description: '',
          partner_id: lr.partner_id || null,
          partner_name: lr.partner_name || '—',
          partner_email: null,
          license_record_id: lr.id || null,
          property_name: lr.property_name || null,
          property_id: lr.property_id || null,
          license_status: lr.license_status || null,
          is_deal: !!lr.is_deal,
          deal_notes: lr.deal_notes || null,
          notes: lr.notes || null,
        });
      }
    }

    // Sort: active first, then by partner name, then invoice date desc
    allRows.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.partner_name < b.partner_name) return -1;
      if (a.partner_name > b.partner_name) return 1;
      return (b.invoice_date || '').localeCompare(a.invoice_date || '');
    });

    return Response.json({ slots: allRows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});