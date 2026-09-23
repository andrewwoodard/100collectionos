import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { executeTermination, lookupPartnerEmail } from '../../shared/offboarding.ts';

// Daily automation: processes scheduled offboardings whose termination_date has arrived.
// Queries Property.filter({ offboarding_status: "scheduled" }) and checks termination_date <= today.
// For each match, calls executeTermination (updates property, cancels licenses, depublishes, emails, audits).
// Returns { processed: N, errors: [...] }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date().toISOString().slice(0, 10);

    // Fetch all scheduled offboardings
    const scheduled = await base44.asServiceRole.entities.Property.filter({ offboarding_status: 'scheduled' });

    // Filter to those whose termination_date has arrived
    const due = scheduled.filter(p => {
      if (!p.termination_date) return false;
      return p.termination_date <= today;
    });

    if (due.length === 0) {
      return Response.json({ ok: true, processed: 0, message: 'No scheduled offboardings due today.' });
    }

    const errors = [];
    let processed = 0;

    for (const prop of due) {
      try {
        const partnerEmail = await lookupPartnerEmail(base44, prop.partner_id);
        await executeTermination(base44, prop.id, {
          approvedBy: 'system',
          reason: prop.offboarding_reason || 'Scheduled termination processed automatically',
          partnerEmail,
          isScheduled: true,
        });
        processed++;
      } catch (e) {
        errors.push({ propertyId: prop.id, propertyName: prop.property_name, error: e.message });
        console.error(`Failed to process scheduled offboarding for ${prop.property_name} (${prop.id}):`, e.message);
      }
    }

    // Summary audit entry
    if (processed > 0) {
      try {
        await base44.asServiceRole.entities.AuditEntry.create({
          actor_email: 'system',
          actor_role: 'system',
          action: 'scheduled_offboarding_batch_processed',
          entity_type: 'Property',
          details: `Processed ${processed} scheduled termination(s) on ${today}. ${errors.length} error(s).`,
        });
      } catch {}
    }

    return Response.json({ ok: true, processed, errors, checked: due.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}