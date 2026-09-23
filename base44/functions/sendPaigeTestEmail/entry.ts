import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { sendResendEmailDirect } from '../../shared/resendEmail.ts';
import { ADMIN_NOTIFICATION_RECIPIENTS } from '../../shared/adminRecipients.ts';

// One-shot deploy verification: fires a single direct test email to Paige
// (paige@theonehundredcollection.com) plus a mock "new partner application"
// admin notification to all ADMIN_NOTIFICATION_RECIPIENTS, to confirm the
// full admin notification pipeline reaches the right inboxes after her
// address was added to the recipient list.
//
// Idempotent: checks AuditEntry for action 'paige_test_email_sent' and no-ops
// if a send was already logged. This makes it safe to wire to an app_publish
// trigger — it fires on every deploy but only actually sends once.

const PAIGE_EMAIL = 'paige@theonehundredcollection.com';
const REPLY_TO = 'buck@theonehundredcollection.com';
const AUDIT_ACTION = 'paige_test_email_sent';
const PAIGE_SUBJECT = "Test: You're on the admin notification list";

function unwrap(res) {
  return (res && (res.data || res)) || {};
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Idempotency — only ever fire once across all deploys.
    const prior = await base44.asServiceRole.entities.AuditEntry.filter({ action: AUDIT_ACTION });
    if (prior && prior.length > 0) {
      const first = prior[0];
      console.log(`[paigeTestEmail] Already sent on ${first.created_date} — skipping.`);
      return Response.json({
        ok: true,
        skipped: 'already_sent',
        sent_at: first.created_date,
        audit_id: first.id,
      });
    }

    const sentAt = new Date().toISOString();
    const report = { sent_at: sentAt, paige: null, admins: null };

    // 2. Direct test email to Paige (no CTA, no reply prompt — informational).
    const paigeBuild = await base44.asServiceRole.functions.invoke('buildAdminEmail', {
      eventType: 'ADMIN NOTIFICATION TEST',
      urgency: 'info',
      headline: "You're all set, Paige",
      subheadline: "This is a one-time test to confirm you're receiving admin notifications from the Partner Portal.",
      contextBlock: "Going forward, you'll get an email here whenever a new partner application comes in, a team access request is submitted, or any admin-directed alert fires from the portal.\n\nIf you're seeing this, everything is wired up correctly. No action needed.\n\nIf you'd like to adjust which notifications you receive, let Buck or Andrew know.",
      footerNote: 'The 100 Collection Team',
      subject: PAIGE_SUBJECT,
      replyPrompt: false,
    });
    const paigeEmail = unwrap(paigeBuild);
    const paigeSend = await sendResendEmailDirect(base44, {
      to: PAIGE_EMAIL,
      subject: paigeEmail.subject || PAIGE_SUBJECT,
      html: paigeEmail.html,
      text: paigeEmail.text,
      replyTo: REPLY_TO,
    });
    report.paige = {
      to: PAIGE_EMAIL,
      ok: paigeSend.ok === true,
      resend_message_id: paigeSend.id || null,
      skipped: paigeSend.skipped || null,
      error: paigeSend.error || null,
    };

    // 3. Mock admin notification to all three recipients — same template that
    //    fires when a new PartnerApplication comes in, prefixed [TEST] and
    //    clearly marked as a test. Respects the AppConfig ADMIN_NOTIFICATION_LIST
    //    override (same resolution as notifyAdminsOfNewApplication).
    const configRows = await base44.asServiceRole.entities.AppConfig.list();
    const config = {};
    for (const row of configRows) config[row.key] = row.value;
    const overrideList = (config.ADMIN_NOTIFICATION_LIST || '').split(',').map(e => e.trim()).filter(Boolean);
    const adminRecipients = overrideList.length > 0 ? overrideList : ADMIN_NOTIFICATION_RECIPIENTS;

    const mockSubject = '[TEST] New partner application: Sample Applicant from Test Co';
    const mockDataRows = [
      { label: 'Applicant', value: 'Sample Applicant' },
      { label: 'Email', value: 'sample@testco.example' },
      { label: 'Company', value: 'Test Co' },
      { label: 'Location', value: 'Test Market, TS' },
      { label: 'Properties', value: '12' },
      { label: 'Track', value: 'Property Manager' },
      { label: 'How they heard', value: 'Test source' },
      { label: 'Source', value: 'Test — deploy verification' },
      { label: 'Message', value: 'TEST notification fired by sendPaigeTestEmail to verify the admin notification pipeline. No real application was submitted.' },
    ];
    const mockBuild = await base44.asServiceRole.functions.invoke('buildAdminEmail', {
      eventType: 'TEST — NEW PARTNER APPLICATION',
      urgency: 'default',
      headline: 'New application from Test Co',
      subheadline: 'Property Manager with 12 properties. [TEST — no real application was submitted]',
      contextBlock: 'Sample Applicant applied to join The 100 Collection. This is a TEST notification fired automatically on deploy to verify the admin notification pipeline reaches all three admin recipients. No action needed.',
      dataRows: mockDataRows,
      ctaLabel: 'Review in Admin Hub',
      ctaUrl: 'https://100c-os.base44.app/admin/hub?tab=applications',
      subject: mockSubject,
      replyPrompt: false,
    });
    const mockEmail = unwrap(mockBuild);
    const mockSend = await sendResendEmailDirect(base44, {
      to: adminRecipients,
      subject: mockEmail.subject || mockSubject,
      html: mockEmail.html,
      text: mockEmail.text,
      replyTo: REPLY_TO,
    });
    report.admins = {
      to: adminRecipients,
      ok: mockSend.ok === true,
      resend_message_id: mockSend.id || null,
      skipped: mockSend.skipped || null,
      error: mockSend.error || null,
    };

    // 4. Audit log (idempotency marker for future deploys).
    const paigeId = paigeSend.id || '';
    const mockId = mockSend.id || '';
    let auditId = null;
    try {
      const audit = await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: 'system',
        actor_role: 'system',
        action: AUDIT_ACTION,
        entity_type: 'email',
        target_name: PAIGE_EMAIL,
        details: `Paige test email -> ${PAIGE_EMAIL} (resend id ${paigeId || 'none'}). Mock admin notification -> ${adminRecipients.join(', ')} (resend id ${mockId || 'none'}).`,
        new_value: JSON.stringify({
          sent_at: sentAt,
          paige_message_id: paigeId,
          admin_message_id: mockId,
          admin_recipients: adminRecipients,
        }),
      });
      auditId = audit && audit.id;
    } catch (e) {
      console.error(`[paigeTestEmail] AuditEntry create failed: ${e.message}`);
    }

    // 5. Report to the deploy / editor console log.
    console.log(`[paigeTestEmail] === Paige test email report ===`);
    console.log(`[paigeTestEmail] sent_at: ${sentAt}`);
    console.log(`[paigeTestEmail] paige recipient: ${PAIGE_EMAIL} | ok=${report.paige.ok} | resend_message_id=${paigeId || 'none'}${report.paige.error ? ' | error=' + report.paige.error : ''}${report.paige.skipped ? ' | skipped=' + report.paige.skipped : ''}`);
    console.log(`[paigeTestEmail] admin recipients: ${adminRecipients.join(', ')} | ok=${report.admins.ok} | resend_message_id=${mockId || 'none'}${report.admins.error ? ' | error=' + report.admins.error : ''}${report.admins.skipped ? ' | skipped=' + report.admins.skipped : ''}`);
    console.log(`[paigeTestEmail] audit_id: ${auditId || 'none'}`);

    return Response.json({ ok: true, report, audit_id: auditId });
  } catch (error) {
    console.error(`[paigeTestEmail] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});