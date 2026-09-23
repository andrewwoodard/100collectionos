import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { LOGO_URL, LOGO_BASE64, LOGO_ALT_TEXT } from '../../shared/emailAssets.ts';

// Reusable Resend email helper.
// Reads config from AppConfig entity (keys: RESEND_API_KEY, RESEND_FROM).
// Graceful no-op if RESEND_API_KEY is empty — logs and returns ok.
// All emails are wrapped in the 100 Collection branded HTML template.

function emailTemplate(content) {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { to, subject, content, text, html } = body;

    if (!to || !subject) {
      return Response.json({ error: "to and subject are required" }, { status: 400 });
    }

    // Read config from AppConfig
    const configRows = await base44.asServiceRole.entities.AppConfig.list();
    const config = {};
    for (const row of configRows) {
      config[row.key] = row.value;
    }

    const apiKey = config.RESEND_API_KEY || "";
    const from = config.RESEND_FROM || "The 100 Collection <noreply@the100collection.com>";

    const recipients = Array.isArray(to) ? to.join(",") : to;

    if (!apiKey) {
      console.log(`[email] RESEND_API_KEY not configured — skipping send to ${recipients}, subject: ${subject}`);
      return Response.json({ ok: true, skipped: "RESEND_API_KEY not configured" });
    }

    // If a pre-wrapped full HTML document is provided (e.g. from buildAdminEmail),
    // use it directly. Otherwise wrap the content in the legacy template.
    const finalHtml = html || emailTemplate(content || text || "");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html: finalHtml,
        text: text || "",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[email] Resend API error: ${res.status} ${errText}`);
      return Response.json({ ok: false, error: `Resend API error: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    console.log(`[email] Sent to ${recipients}, subject: ${subject}, id: ${data.id}`);
    return Response.json({ ok: true, id: data.id });
  } catch (error) {
    console.error(`[email] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});