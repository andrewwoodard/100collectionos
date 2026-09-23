import { getNeonPool } from "./neon-db.js";

const LOGO_URL =
  "https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png?v=logo2";

type ResetCapture = {
  url: string;
  at: number;
  sent?: boolean;
  skipped?: string;
  error?: string;
};

const resetCaptures = new Map<string, ResetCapture>();

type Config = { apiKey: string; from: string };

let cachedConfig: { at: number; value: Config } | null = null;

async function getResendConfig(): Promise<Config> {
  if (cachedConfig && Date.now() - cachedConfig.at < 60_000) return cachedConfig.value;
  const envKey = process.env.RESEND_API_KEY || "";
  const envFrom = process.env.RESEND_FROM || "";
  let apiKey = envKey;
  let from = envFrom || "The 100 Collection <hello@portal.theonehundredcollection.com>";
  try {
    const pool = getNeonPool();
    const { rows } = await pool.query(
      `SELECT data->>'key' AS key, data->>'value' AS value
       FROM base44.app_config
       WHERE data->>'key' IN ('RESEND_API_KEY', 'RESEND_FROM')`
    );
    for (const row of rows) {
      if (row.key === "RESEND_API_KEY" && row.value) apiKey = apiKey || row.value;
      if (row.key === "RESEND_FROM" && row.value) from = envFrom || row.value;
    }
  } catch (error) {
    console.warn("[reset-email] could not read AppConfig", (error as Error).message);
  }
  const value = { apiKey, from };
  cachedConfig = { at: Date.now(), value };
  return value;
}

function resetEmailHtml(name: string, url: string) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAFBFC;font-family:Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFC;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#0D1B2A;padding:32px 40px;text-align:center;">
<img src="${LOGO_URL}" alt="The 100 Collection" width="56" height="56" style="width:56px;height:56px;border-radius:8px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;"/>
<div style="color:#C9A96E;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">The 100 Collection</div>
</td></tr>
<tr><td style="padding:40px;color:#0D1B2A;font-size:15px;line-height:1.6;">
<p style="margin:0 0 16px;">${greeting}</p>
<p style="margin:0 0 16px;">We received a request to reset the password for your portal account. Click the button below to choose a new one. This link expires in one hour.</p>
<p style="margin:24px 0;text-align:center;">
<a href="${url}" style="display:inline-block;background:#0D1B2A;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">Reset password</a>
</p>
<p style="margin:0;color:#64748B;font-size:13px;">If you did not request this, you can ignore this email.</p>
</td></tr>
<tr><td style="padding:24px 40px 32px;border-top:1px solid #E2E8F0;">
<p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;line-height:1.5;">
The 100 Collection &middot; Curated Luxury Vacation Rentals
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function takeResetResult(email: string) {
  const key = email.toLowerCase();
  const entry = resetCaptures.get(key);
  resetCaptures.delete(key);
  return entry || null;
}

export async function deliverPasswordResetEmail({
  user,
  url,
}: {
  user: { email?: string; name?: string };
  url: string;
}) {
  const email = String(user.email || "").trim();
  const capture = (extra: Partial<ResetCapture>) => {
    if (email) resetCaptures.set(email.toLowerCase(), { url, at: Date.now(), ...extra });
  };
  if (!email) return { ok: false, skipped: "missing email", url };

  const { apiKey, from } = await getResendConfig();
  if (!apiKey) {
    console.log(`[reset-email] RESEND_API_KEY not configured — skipping send to ${email}`);
    capture({ sent: false, skipped: "RESEND_API_KEY not configured" });
    return { ok: true, skipped: "RESEND_API_KEY not configured", url };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your 100 Collection password",
      html: resetEmailHtml(user.name || "", url),
      text: `Reset your password: ${url}`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[reset-email] Resend API error: ${res.status} ${errText}`);
    capture({ sent: false, error: `Resend API error: ${res.status}` });
    return { ok: false, error: `Resend API error: ${res.status}`, url };
  }

  const data = await res.json();
  console.log(`[reset-email] sent to ${email}, id: ${data.id}`);
  capture({ sent: true });
  return { ok: true, id: data.id, url };
}
