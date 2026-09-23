// Undo a recent admin action on a PortalAccessRequest.
// Reverts the request back into the open queue, cancels the scheduled outbound
// email if it has not sent yet (best-effort), and writes an AuditEntry so we
// always have a record of the intent even if the email already left.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendResendEmailDirect, cancelScheduledEmail } from '../../shared/resendEmail.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { request_id } = body;
    if (!request_id) {
      return Response.json({ error: 'request_id is required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const request = await svc.entities.PortalAccessRequest.get(request_id);
    if (!request) {
      return Response.json({ error: 'Access request not found' }, { status: 404 });
    }

    const originalAction = request.action_taken || 'unknown';
    const scheduledEmailId = request.scheduled_email_id || null;

    // Best-effort email cancellation. If the email already sent, Resend returns
    // an error and we carry on reverting the queue state + logging the intent.
    let emailCancelled = false;
    let emailCancelNote = 'no scheduled email';
    if (scheduledEmailId) {
      const cancel = await cancelScheduledEmail(base44, scheduledEmailId);
      emailCancelled = cancel.ok;
      emailCancelNote = cancel.ok ? 'cancelled before send' : `could not cancel: ${cancel.error}`;
    }

    // Restore the request to the open queue. Cold signups were auto_routed;
    // everything else goes back to pending.
    const restoredStatus = request.source === 'cold_signup' ? 'auto_routed' : 'pending';

    await svc.entities.PortalAccessRequest.update(request_id, {
      status: restoredStatus,
      action_taken: null,
      action_taken_by: null,
      action_taken_at: null,
      scheduled_email_id: null,
      scheduled_send_at: null,
    });

    await svc.entities.AuditEntry.create({
      actor_email: user.email,
      actor_role: 'admin',
      action: 'access_request_action_undone',
      entity_type: 'PortalAccessRequest',
      entity_id: request_id,
      target_name: request.full_name || request.email,
      details: `Undid ${originalAction} on ${request.email}. Email: ${emailCancelNote}.`,
      old_value: originalAction,
      new_value: restoredStatus,
    });

    return Response.json({ ok: true, email_cancelled: emailCancelled, restored_status: restoredStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}