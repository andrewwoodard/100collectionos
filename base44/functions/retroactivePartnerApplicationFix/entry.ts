import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { notifyAdminsOfNewApplication, convergePortalAccessRequestForApplication } from '../../shared/partnerApplicationNotifications.ts';

// One-shot retroactive fix for PartnerApplications created before the
// admin_notified_at idempotency guard was wired up. Fires the admin
// notification (if not already sent), converges a matching PortalAccessRequest,
// and logs an AuditEntry.
//
// Payload:
//   application_id           — required
//   portal_access_request_id — optional; if provided, converges this specific PAR
//                              (with notes_append). If omitted, converges by email match.
//   actor_email              — admin email for the AuditEntry (default 'system')
//   notes_append             — optional text appended to the PAR notes
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { application_id, portal_access_request_id, actor_email, notes_append } = body;

    if (!application_id) {
      return Response.json({ error: 'application_id is required' }, { status: 400 });
    }

    // 1. Fetch the application (fresh, so admin_notified_at is current)
    const app = await base44.asServiceRole.entities.PartnerApplication.get(application_id);
    if (!app) {
      return Response.json({ error: 'application not found' }, { status: 404 });
    }

    // 2. Fire admin notification (idempotent on admin_notified_at)
    const notifResult = await notifyAdminsOfNewApplication(base44, app);

    // 3. Converge PortalAccessRequest
    let convergeResult = null;
    if (portal_access_request_id) {
      const par = await base44.asServiceRole.entities.PortalAccessRequest.get(portal_access_request_id);
      if (par) {
        const now = new Date().toISOString();
        const update = {
          status: 'converted_to_application',
          matched_application_id: app.id,
          matched_application_date: app.created_date || now,
          action_taken_at: now,
        };
        if (!par.action_taken) update.action_taken = 'converted_to_application';
        if (notes_append) {
          update.notes = (par.notes ? par.notes + ' | ' : '') + notes_append;
        }
        await base44.asServiceRole.entities.PortalAccessRequest.update(portal_access_request_id, update);
        convergeResult = { ok: true, target: 'specified', id: portal_access_request_id };
      } else {
        convergeResult = { ok: false, error: 'portal access request not found' };
      }
    } else {
      convergeResult = await convergePortalAccessRequestForApplication(base44, app);
    }

    // 4. AuditEntry
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: actor_email || 'system',
        actor_role: 'admin',
        action: 'retroactive_fix',
        entity_type: 'PortalAccessRequest',
        entity_id: portal_access_request_id || application_id,
        target_name: app.full_name || app.company_name || app.email,
        details: `Retroactive fix: fired admin notification for PartnerApplication ${application_id}${notifResult.skipped ? ' (skipped: ' + notifResult.skipped + ')' : ''} and converged PortalAccessRequest ${portal_access_request_id || '(by email match)'}.`,
      });
    } catch (e) {
      console.log('[retroactivePartnerApplicationFix] audit entry failed:', e.message);
    }

    return Response.json({ ok: true, notif: notifResult, converge: convergeResult });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});