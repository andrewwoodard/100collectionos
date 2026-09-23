// Shared logic for PartnerApplication admin notifications + PortalAccessRequest
// convergence. Used by onPartnerApplicationCreate (entity automation) and
// retroactivePartnerApplicationFix (one-shot backfill).
//
// Idempotency: the single guard is PartnerApplication.admin_notified_at.
// If already set, the notification is skipped. If null, the email fires and
// admin_notified_at is stamped after a successful send.
//
// Sends via the sendResendEmailDirect shared module (direct Resend API call)
// rather than base44.functions.invoke('sendResendEmail') — the cross-function
// invoke path 500s when the internal request lacks a forwarded auth context.

import { sendResendEmailDirect } from "./resendEmail.ts";
import { ADMIN_NOTIFICATION_RECIPIENTS } from "./adminRecipients.ts";

export async function notifyAdminsOfNewApplication(base44, app) {
  if (!app || !app.id) return { ok: false, error: 'application required' };

  // 1. Idempotency: admin_notified_at is the single guard
  if (app.admin_notified_at) {
    return { ok: true, skipped: 'already_notified', admin_notified_at: app.admin_notified_at };
  }

  const displayName = app.company_name || app.full_name || 'Unknown';
  const typeLabel = app.applicant_type === 'property_owner'
    ? 'Individual property owner'
    : (app.applicant_type === 'existing_partner_access_request' ? 'Existing partner access request' : 'Property Manager');

  const fromLabel = app.company_name || 'individual homeowner';
  const subject = `New partner application: ${app.full_name || displayName} from ${fromLabel}`;

  const dataRows = [
    { label: 'Applicant', value: app.full_name || '—' },
    { label: 'Email', value: app.email || '—' },
  ];
  if (app.phone) dataRows.push({ label: 'Phone', value: app.phone });
  if (app.applicant_type === 'property_manager') {
    dataRows.push({ label: 'Company', value: app.company_name || '—' });
  } else {
    dataRows.push({ label: 'Company', value: 'Individual property owner' });
  }
  if (app.property_locations || app.property_address) {
    dataRows.push({ label: 'Location', value: app.property_locations || app.property_address });
  }
  if (app.property_count) dataRows.push({ label: 'Properties', value: app.property_count });
  dataRows.push({ label: 'Track', value: typeLabel });
  if (app.how_heard) dataRows.push({ label: 'How they heard', value: app.how_heard });
  const sourceLabel = app.source_label || (app.attribution && app.attribution.source_label) || 'Unknown (pre-tracking)';
  dataRows.push({ label: 'Source', value: sourceLabel });
  if (app.message) {
    const excerpt = app.message.length > 200 ? app.message.slice(0, 200) + '...' : app.message;
    dataRows.push({ label: 'Message', value: excerpt });
  }

  // 2. Resolve admin recipients (AppConfig ADMIN_NOTIFICATION_LIST override, else constant)
  const configRows = await base44.asServiceRole.entities.AppConfig.list();
  const config = {};
  for (const row of configRows) config[row.key] = row.value;
  const overrideList = (config.ADMIN_NOTIFICATION_LIST || '').split(',').map(e => e.trim()).filter(Boolean);
  const recipients = overrideList.length > 0 ? overrideList : ADMIN_NOTIFICATION_RECIPIENTS;

  // 3. Build branded email via buildAdminEmail (asServiceRole cross-function invoke)
  const payload = {
    eventType: 'NEW PARTNER APPLICATION',
    urgency: 'default',
    headline: `New application from ${displayName}`,
    subheadline: `${typeLabel}${app.property_count ? ` with ${app.property_count} properties` : ''}.`,
    contextBlock: `${app.full_name || displayName} applied to join The 100 Collection. Here are the details.`,
    dataRows,
    ctaLabel: 'Review in Admin Hub',
    ctaUrl: `https://100c-os.base44.app/admin/hub?tab=applications&applicationId=${app.id}`,
    subject,
    replyPrompt: false,
  };
  const emailRes = await base44.asServiceRole.functions.invoke('buildAdminEmail', payload);
  const email = (emailRes && (emailRes.data || emailRes)) || {};
  if (!email.html) {
    return { ok: false, error: 'email rendering returned no html' };
  }

  // 4. Send via Resend (shared module — no cross-function invoke)
  const sendResult = await sendResendEmailDirect(base44, {
    to: recipients,
    subject: email.subject || subject,
    html: email.html,
    text: email.text,
  });

  // 5. Create in-app PortalNotification (dedup_key auto-skips duplicates).
  // Created regardless of email result so admins see the application in-app
  // even if the email send fails.
  try {
    await base44.asServiceRole.entities.PortalNotification.create({
      recipient_role: 'admin',
      recipient_email: 'admin',
      type: 'general',
      title: `New application from ${displayName}`,
      message: `${typeLabel}${app.property_count ? ` with ${app.property_count} properties` : ''}.`,
      submission_id: app.id,
      is_read: false,
      dedup_key: `partner_application__${app.id}`,
      link: `/admin/hub?tab=applications&applicationId=${app.id}`,
    });
  } catch (e) {
    console.log('[partnerApplicationNotifications] in-app notification create failed:', e.message);
  }

  // 6. Stamp admin_notified_at ONLY when the email actually sent, so a failed
  // or skipped send can be retried. The automation fires once on create; a
  // manual retry via retroactivePartnerApplicationFix re-runs this function
  // and only proceeds if admin_notified_at is still null.
  const emailActuallySent = sendResult.ok === true && !sendResult.skipped;
  if (emailActuallySent) {
    await base44.asServiceRole.entities.PartnerApplication.update(app.id, {
      admin_notified_at: new Date().toISOString(),
    });
  }

  return {
    ok: emailActuallySent,
    emailSent: emailActuallySent,
    emailId: sendResult.id,
    emailSkipped: sendResult.skipped,
    emailError: sendResult.error,
    recipients,
    admin_notified_at_set: emailActuallySent,
  };
}

export async function convergePortalAccessRequestForApplication(base44, app) {
  const emailLower = (app.email || '').toLowerCase();
  if (!emailLower) return { ok: true, skipped: 'no email' };

  // Find open PortalAccessRequests matching this email (case-insensitive)
  const recent = await base44.asServiceRole.entities.PortalAccessRequest.list('-created_date', 500);
  const openStatuses = ['auto_routed', 'pending', 'awaiting_response'];
  const matches = recent.filter(r =>
    (r.email || '').toLowerCase() === emailLower &&
    openStatuses.includes(r.status)
  );

  if (matches.length === 0) return { ok: true, skipped: 'no matching open request', email: emailLower };

  const now = new Date().toISOString();
  for (const r of matches) {
    const update = {
      status: 'converted_to_application',
      matched_application_id: app.id,
      matched_application_date: app.created_date || now,
      action_taken_at: now,
    };
    if (!r.action_taken) update.action_taken = 'converted_to_application';
    await base44.asServiceRole.entities.PortalAccessRequest.update(r.id, update);
  }
  return { ok: true, converged: matches.length, ids: matches.map(r => r.id) };
}