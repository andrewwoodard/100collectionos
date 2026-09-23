import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allLicenses = await base44.asServiceRole.entities.LicenseRecord.list('-created_date', 1000);

    // Fix records where annual_fee is null, 0, or the stale $2,500 value (no base_fee, no deal, not Stripe-sourced)
    const toFix = allLicenses.filter(l => {
      const fee = l.annual_fee;
      if (fee == null || fee === 0) return true;
      // Fix stale $2,500 entries that have no base_fee and no Stripe invoice (manually entered at wrong price)
      if (fee === 2500 && !l.base_fee && !l.stripe_invoice_id) return true;
      return false;
    });

    if (toFix.length === 0) {
      return Response.json({ updated: 0, message: 'Nothing to backfill' });
    }

    const updates = [];
    for (const l of toFix) {
      const baseFee = l.base_fee || 498;
      const discountPct = l.discount_applied_percent || 0;
      const annualFee = +(baseFee * (1 - discountPct / 100)).toFixed(2);
      updates.push({ id: l.id, partner_name: l.partner_name, property_name: l.property_name, old_fee: l.annual_fee, base_fee: baseFee, discount: discountPct, new_fee: annualFee });
      await base44.asServiceRole.entities.LicenseRecord.update(l.id, {
        base_fee: baseFee,
        annual_fee: annualFee,
      });
    }

    return Response.json({
      updated: updates.length,
      sample: updates.slice(0, 5),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});