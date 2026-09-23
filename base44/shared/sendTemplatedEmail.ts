// Shared module: render an email from a database-backed EmailTemplate and send it.
// Wraps renderFromTemplate + sendResendEmailDirect with audit logging for
// missing/archived templates.
//
// Usage:
//   const result = await sendTemplatedEmail(base44, 'property-approved', context, { to: partnerEmail });
//   // result: { ok, id?, skipped?, error?, template_name? }
//
// If the template is archived or missing, logs a warning and creates an
// AuditEntry with action "email_send_failed_no_template", then skips the send.
// Does NOT fall back to inline HTML — admins must restore the template.

import { renderFromTemplate } from "./renderFromTemplate.ts";
import { sendResendEmailDirect } from "./resendEmail.ts";

export interface SendTemplatedEmailParams {
  to: string | string[];
  // Optional: override the rendered subject (use when subject needs conditional
  // logic that can't be expressed via {{variable}} tokens)
  subject_override?: string;
  // Optional: override the "from" name
  from_name?: string;
}

export interface SendTemplatedEmailResult {
  ok: boolean;
  id?: string;
  skipped?: string;
  error?: string;
  template_name?: string;
  template_found?: boolean;
}

export async function sendTemplatedEmail(
  base44: any,
  slug: string,
  context: Record<string, any>,
  params: SendTemplatedEmailParams
): Promise<SendTemplatedEmailResult> {
  const { to, subject_override, from_name } = params;

  if (!to) {
    return { ok: false, error: "to is required" };
  }

  // 1. Render the email from the DB-backed template
  const rendered = await renderFromTemplate(base44, slug, context);

  if (!rendered.template_found) {
    console.warn(`[sendTemplatedEmail] Template not found or archived: ${slug}. Skipping send to ${to}.`);
    // Audit log so admins can see the failure
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: "system",
        actor_role: "system",
        action: "email_send_failed_no_template",
        entity_type: "EmailTemplate",
        details: `No active template found for slug "${slug}". Email to ${Array.isArray(to) ? to.join(", ") : to} was skipped.`,
      });
    } catch (_) { /* non-critical */ }
    return { ok: false, skipped: "template_not_found", template_found: false };
  }

  // 2. Send via Resend (with Base44 fallback)
  const subject = subject_override || rendered.subject;
  const sendParams: any = { to, subject, html: rendered.html, text: rendered.text };
  if (from_name) sendParams.from_name = from_name;

  const result = await sendResendEmailDirect(base44, sendParams);

  return {
    ok: result.ok,
    id: result.id,
    skipped: result.skipped,
    error: result.error,
    template_name: rendered.template_name,
    template_found: true,
  };
}