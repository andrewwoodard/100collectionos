import { json } from "./neon-db.js";
import { requireSession } from "./require-session.js";
import { sendPortalEmail } from "./reset-email.js";

/**
 * Local sendResendEmail — avoids flaky Base44 proxy responses that surface as
 * axios "Network Error" in the browser even after Resend has already accepted the mail.
 */
export async function handleSendResendEmail(req: any, res: any, body: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const { to, subject, content, text, html, replyTo, reply_to } = body || {};
  if (!to || !subject) {
    return json(res, 400, { error: "to and subject are required" });
  }

  const finalHtml =
    html ||
    `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0D1B2A;">${
      content || text || ""
    }</div>`;

  try {
    const result = await sendPortalEmail({
      to,
      subject: String(subject),
      html: String(finalHtml),
      text: text != null ? String(text) : "",
      replyTo: replyTo || reply_to || undefined,
    });
    return json(res, 200, result);
  } catch (error: any) {
    console.error("[sendResendEmail]", error);
    return json(res, 500, { ok: false, error: error?.message || "Send failed" });
  }
}
