import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { renderFromTemplate, buildPayloadFromTemplate } from '../../shared/renderFromTemplate.ts';
import { ADMIN_NOTIFICATION_RECIPIENTS_CSV } from '../../shared/adminRecipients.ts';

// Shared orchestrator for all admin-facing notifications.
// Pipeline: dedup check -> create in-app PortalNotification -> build branded
// email (buildAdminEmail) -> send via sendResendEmail to the admin list.
//
// Reads ADMIN_NOTIFICATION_LIST from AppConfig. If empty, falls back to the
// default ops list. If Resend is not configured, the email is gracefully
// skipped (same no-op pattern as sendResendEmail) but the in-app notification
// is still created.
//
// Every admin notification function should call THIS rather than hand-rolling
// HTML, recipient lists, or PortalNotification records.

const DEFAULT_ADMIN_LIST = ADMIN_NOTIFICATION_RECIPIENTS_CSV;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      eventType = '',
      urgency = 'default',
      headline = '',
      subheadline = '',
      contextBlock = '',
      dataRows = [],
      sections = [],
      callout = '',
      secondaryCtaLabel = '',
      secondaryCtaUrl = '',
      ctaLabel = '',
      ctaUrl = '',
      footerNote = '',
      subject = '',
      heroImage = '',
      whatHappensNext = [],
      socialProof = '',
      replyPrompt = false, // admin notifications default to no reply prompt
      dedupKey = '',
      portalNotification = {},
      recipientOverride = '',
      recipientConfigKey = '',
      template_slug = '',
      template_context = {},
    } = body;

    // 1. Idempotency: skip entirely if already notified for this dedup key
    if (dedupKey) {
      const existing = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
      if (existing.length > 0) {
        return Response.json({ ok: true, skipped: 'already notified' });
      }
    }

    // 2. Resolve admin recipient list (with default fallback)
    const configRows = await base44.asServiceRole.entities.AppConfig.list();
    const config = {};
    for (const row of configRows) config[row.key] = row.value;
    let adminList = '';
    let usingDefault = false;
    if (recipientOverride) {
      adminList = recipientOverride;
    } else {
      const key = recipientConfigKey || 'ADMIN_NOTIFICATION_LIST';
      adminList = config[key] || '';
      // Fallback: if the targeted key is empty, use the main admin list (then default)
      if (!adminList.trim() && key !== 'ADMIN_NOTIFICATION_LIST') {
        adminList = config.ADMIN_NOTIFICATION_LIST || '';
      }
      if (!adminList.trim()) {
        adminList = DEFAULT_ADMIN_LIST;
        usingDefault = true;
      }
    }
    const recipients = adminList.split(',').map(e => e.trim()).filter(Boolean);

    // 3. Create in-app notification (admin role)
    const pn = portalNotification || {};
    await base44.asServiceRole.entities.PortalNotification.create({
      recipient_role: 'admin',
      recipient_email: 'admin',
      type: pn.type || 'general',
      title: pn.title || headline || eventType,
      message: pn.message || subheadline || '',
      submission_id: pn.submissionId,
      property_name: pn.propertyName,
      partner_name: pn.partnerName,
      is_read: false,
      dedup_key: dedupKey || undefined,
      link: pn.link || ctaUrl,
    });

    // 4. Build the branded email
    // When template_slug is provided, render from the DB-backed EmailTemplate.
    // Otherwise, fall back to inline buildAdminEmail payload (for unmigrated callers).
    let email = {};
    if (template_slug) {
      // Fetch template record directly so we can merge inline overrides
      // (sections, dataRows) for dynamic content like digests.
      const templates = await base44.asServiceRole.entities.EmailTemplate.filter({
        slug: template_slug, status: 'active',
      });
      if (!templates || templates.length === 0) {
        console.warn(`[sendAdminNotification] Template not found: ${template_slug}. Email skipped, in-app notification still created.`);
        try {
          await base44.asServiceRole.entities.AuditEntry.create({
            actor_email: 'system',
            actor_role: 'system',
            action: 'email_send_failed_no_template',
            entity_type: 'EmailTemplate',
            details: `No active template found for slug "${template_slug}". Admin email was skipped but in-app notification was created.`,
          });
        } catch (_) {}
        return Response.json({ ok: true, notified: true, emailSent: false, emailStatus: 'skipped_no_template', recipients, usingDefaultList: usingDefault });
      } else {
        const tpl = templates[0];
        const payload = buildPayloadFromTemplate(tpl, template_context || {});
        // Override with inline values if provided (for dynamic content like digest sections)
        if (sections && sections.length > 0) payload.sections = sections;
        if (dataRows && dataRows.length > 0) payload.dataRows = dataRows;
        if (callout) payload.callout = callout;
        if (secondaryCtaLabel) payload.secondaryCtaLabel = secondaryCtaLabel;
        if (secondaryCtaUrl) payload.secondaryCtaUrl = secondaryCtaUrl;
        const emailRes = await base44.functions.invoke('buildAdminEmail', payload);
        email = emailRes?.data || {};
      }
    } else {
      const emailRes = await base44.functions.invoke('buildAdminEmail', {
        eventType, urgency, headline, subheadline, contextBlock, dataRows, sections, callout, secondaryCtaLabel, secondaryCtaUrl, ctaLabel, ctaUrl, footerNote, subject,
        heroImage, whatHappensNext, socialProof, replyPrompt,
      });
      email = emailRes?.data || {};
    }
    if (!email.html) {
      return Response.json({ ok: false, error: 'email rendering returned no html' }, { status: 500 });
    }

    // 5. Send the email (sendResendEmail supports a pre-wrapped `html` field)
    let emailSent = false;
    let emailStatus = 'unknown';
    try {
      const sendRes = await base44.functions.invoke('sendResendEmail', {
        to: recipients,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      emailSent = sendRes?.data?.ok === true || !!sendRes?.data?.skipped;
      emailStatus = sendRes?.data?.skipped ? 'skipped' : (sendRes?.data?.ok ? 'sent' : (sendRes?.data?.error || 'unknown'));
    } catch (e) {
      emailStatus = 'failed: ' + (e.message || String(e));
    }

    return Response.json({
      ok: true,
      notified: true,
      emailSent,
      emailStatus,
      recipients,
      usingDefaultList: usingDefault,
      email_html: email.html || '',
      email_subject: email.subject || '',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});