import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const partners = await base44.asServiceRole.entities.Partner.list('-created_date', 500);
    let migrated = 0;
    let skippedSeaMountain = 0;
    let skippedEmpty = 0;

    for (const partner of partners) {
      const pms = partner.pms || "";
      const pmsOther = partner.pms_other || "";

      // Skip Sea Mountain Vacations — leave empty for self-completion via portal
      if (partner.partner_name && partner.partner_name.toLowerCase().includes("sea mountain")) {
        skippedSeaMountain++;
        continue;
      }

      if (!pms && !pmsOther) {
        skippedEmpty++;
        continue;
      }

      // Check if TechStack row already exists
      const existing = await base44.asServiceRole.entities.PartnerTechStack.filter({ partner_id: partner.id });

      const payload = {
        partner_id: partner.id,
        pms: pms,
        pms_other: pmsOther,
        last_updated_by: user.email,
        last_updated_at: new Date().toISOString(),
      };

      if (existing.length > 0) {
        await base44.asServiceRole.entities.PartnerTechStack.update(existing[0].id, payload);
      } else {
        await base44.asServiceRole.entities.PartnerTechStack.create(payload);
      }

      migrated++;
    }

    return Response.json({
      success: true,
      total: partners.length,
      migrated,
      skippedSeaMountain,
      skippedEmpty,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});