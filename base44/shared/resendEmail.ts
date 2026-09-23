// Shared Resend email sender.
// Reads config from AppConfig (RESEND_API_KEY, RESEND_FROM) and sends a
// branded email via the Resend API. Used directly by backend functions that
// need to send email — avoids the fragile cross-function HTTP call through
// base44.functions.invoke('sendResendEmail'), which can fail with a 500 when
// the internal request lacks a forwarded auth context.
//
// Usage:
//   const base44 = createClientFromRequest(req);
//   const result = await sendResendEmailDirect(base44, { to, subject, content, text });

import { LOGO_URL, LOGO_ALT_TEXT } from "./emailAssets.ts";

function emailTemplate(content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAFBFC;font-family:'Lato',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFC;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#0D1B2A;padding:32px 40px;text-align:center;">
<img src="${LOGO_URL}" alt="${LOGO_ALT_TEXT}" width="56" height="56" style="width:56px;height:56px;border-radius:8px;margin-bottom:14px;display:block;"/>
<div style="color:#C9A96E;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">The 100 Collection</div>
</td></tr>
<tr><td style="padding:40px;color:#0D1B2A;font-size:15px;line-height:1.6;">
${content}
</td></tr>
<tr><td style="padding:24px 40px 32px;border-top:1px solid #E2E8F0;">
<p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;line-height:1.5;">
The 100 Collection &middot; Curated Luxury Vacation Rentals<br>
<a href="https://the100collection.com" style="color:#C9A96E;text-decoration:none;">the100collection.com</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  content?: string; // inner HTML, wrapped in branded template
  text?: string;    // plain-text fallback
  html?: string;    // pre-wrapped full HTML document (overrides content)
  scheduledAt?: string; // ISO 8601 — schedule the send (Resend minimum is ~1 minute in the future)
  replyTo?: string; // optional Reply-To header passed through to Resend
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  skipped?: string;
  error?: string;
}

export async function sendResendEmailDirect(
  base44: any,
  params: SendEmailParams
): Promise<SendEmailResult> {
  const { to, subject, content, text, html, scheduledAt, replyTo } = params;

  if (!to || !subject) {
    return { ok: false, error: "to and subject are required" };
  }

  // Read config from AppConfig
  const configRows = await base44.asServiceRole.entities.AppConfig.list();
  const config: Record<string, string> = {};
  for (const row of configRows) {
    config[row.key] = row.value;
  }

  const apiKey = config.RESEND_API_KEY || "";
  const from = config.RESEND_FROM || "The 100 Collection <hello@theonehundredcollection.com>";
  const toArray = (Array.isArray(to) ? to : [to]).map(r => String(r).trim()).filter(Boolean);
  const recipients = toArray.join(",");

  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not configured — skipping send to ${recipients}, subject: ${subject}`);
    return { ok: true, skipped: "RESEND_API_KEY not configured" };
  }

  const finalHtml = html || emailTemplate(content || text || "");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: toArray,
      subject,
      html: finalHtml,
      text: text || "",
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[email] Resend API error: ${res.status} ${errText}`);

    // Fallback to Base44 built-in SendEmail integration (one email per
    // recipient, since it only accepts a single address).
    try {
      console.log(`[email] Falling back to Base44 SendEmail for ${recipients}`);
      for (const r of toArray) {
        await base44.integrations.Core.SendEmail({
          to: r,
          subject,
          body: finalHtml,
          from_name: "The 100 Collection",
        });
      }
      console.log(`[email] Fallback SendEmail succeeded for ${recipients}`);
      return { ok: true, id: `base44-fallback`, error: `Resend failed (${res.status}), sent via Base44 fallback` };
    } catch (fallbackErr) {
      console.error(`[email] Base44 fallback also failed: ${fallbackErr.message}`);
      return { ok: false, error: `Resend API error: ${res.status}` };
    }
  }

  const data = await res.json();
  console.log(`[email] Sent to ${recipients}, subject: ${subject}, id: ${data.id}`);
  return { ok: true, id: data.id };
}

// Cancel a scheduled Resend email. Best-effort: returns ok:true if the send was
// cancelled, or ok:false with a reason (already sent, not found, etc.). Used by
// the access-queue undo flow to pull back an outbound email before it leaves.
export async function cancelScheduledEmail(
  base44: any,
  emailId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!emailId) return { ok: false, error: "no email id" };

  const configRows = await base44.asServiceRole.entities.AppConfig.list();
  const config: Record<string, string> = {};
  for (const row of configRows) config[row.key] = row.value;
  const apiKey = config.RESEND_API_KEY || "";
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };

  const res = await fetch(`https://api.resend.com/emails/${emailId}/cancel`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.log(`[email] cancel ${emailId} -> ${res.status} ${errText}`);
    return { ok: false, error: `Resend cancel error: ${res.status}` };
  }
  console.log(`[email] Cancelled scheduled email ${emailId}`);
  return { ok: true };
}