import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';
import { notifyAdminsOfNewApplication, convergePortalAccessRequestForApplication } from '../../shared/partnerApplicationNotifications.ts';

// Fired by entity automation: PartnerApplication afterCreate.
// 1. Fires the admin notification email to ADMIN_NOTIFICATION_RECIPIENTS and
//    stamps admin_notified_at (idempotent on that field).
// 2. Converges any matching open PortalAccessRequest to converted_to_application.
// 3. Sends the homeowner auto-reply for multi-property owner submissions.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const app = body.data;
    if (!app) return Response.json({ ok: true, skipped: 'no data' });

    // existing_partner_access_request track is handled by matchExistingPartnerRequest,
    // which fires a more specific admin notification with match confidence data.
    // Skipping here prevents duplicate admin emails for the same application.
    if (app.applicant_type === 'existing_partner_access_request') {
      return Response.json({ ok: true, skipped: 'existing_partner_access_request handled by matchExistingPartnerRequest' });
    }

    // Spam guard (Layer 7): quarantined and high-scoring submissions must not
    // page admins. Records created with status 'spam_review' or a spam_score
    // above the notification threshold skip the admin email, the homeowner
    // auto-reply, and access-request convergence. (Restoring from the admin
    // Spam tab clears spam_score, so the belated notification goes through.)
    if (app.status === 'spam_review' || (typeof app.spam_score === 'number' && app.spam_score > 0.4)) {
      return Response.json({ ok: true, skipped: 'spam quarantine — notifications suppressed' });
    }

    const notifResult = await notifyAdminsOfNewApplication(base44, app);
    const convergeResult = await convergePortalAccessRequestForApplication(base44, app);

    // Auto-reply email to homeowner applicants with submitted properties
    if (app.applicant_type === 'property_owner' && Array.isArray(app.submitted_properties) && app.submitted_properties.length > 0) {
      const firstName = (app.full_name || '').split(' ')[0]?.trim() || 'there';
      const propCount = app.submitted_properties.length;
      try {
        await sendTemplatedEmail(base44, 'homeowner-application-multi', {
          homeowner: { first_name: firstName, properties_count: propCount, location: app.property_locations || app.property_address || '' },
        }, { to: app.email });
      } catch (e) {
        console.log('Homeowner auto-reply failed:', e.message);
      }
    }

    return Response.json({ ok: true, notif: notifResult, converge: convergeResult });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});