import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { LOGO_URL, LOGO_ALT_TEXT } from '../../shared/emailAssets.ts';

// Shared branded email template generator.
// Pure function: takes structured content, returns { subject, html, text }.
// Used by admin notifications (via sendAdminNotification) AND partner-facing
// trigger emails (sendPropertyEmail, sendActivationEmail, auto-replies, etc.)
// so the visual language stays consistent across Gmail, Outlook, and in-app views.
//
// Input:
//   eventType      — gold uppercase tag (e.g. "NEW PROPERTY SUBMISSION")
//   urgency        — "default" | "success" | "warning" | "alert"
//   headline       — Cormorant Garamond h1 (32px, navy)
//   subheadline    — Lato body lead (16px, slate)
//   contextBlock   — optional warm 1-2 sentence narrative (plain text)
//   dataRows       — optional array of { label, value } rendered 2-column
//   sections       — optional array of { title, dataRows, ctaLabel, ctaUrl }
//   callout        — optional highlighted note
//   ctaLabel       — button text
//   ctaUrl         — button link
//   secondaryCtaLabel / secondaryCtaUrl — optional secondary button
//   footerNote     — optional small grey note under the CTA
//   subject        — email subject (falls back to headline)
//
// Wander-inspired upgrades (all optional, backward compatible):
//   heroImage       — full-width image URL rendered at the top of the card,
//                     before the event tag. Rounded top corners via card
//                     overflow:hidden. Cream #FAFAF8 bg while loading.
//   whatHappensNext — array of { number?, title, body } rendered as a
//                     3-column numbered layout (stacks on mobile).
//   socialProof     — string with **bold** markers; gold-accented line below
//                     the CTA button.
//   replyPrompt     — boolean (default true). When true, renders "Questions?
//                     Just reply to this email — we read every one." above the
//                     footer. Set to false for admin notifications and digests.

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Parse **bold** markers into gold-accented <strong> tags.
function renderSocialProof(text) {
  if (!text) return '';
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong style="color:#C9A96E;font-weight:700;">$1</strong>');
}

const BRAND = { gold: '#C9A96E', navy: '#0D1B2A', ctaBg: '#0D1B2A', ctaText: '#ffffff' };
const URGENCY = {
  default: { tagBg: '#FBF3E0', tagText: '#A68B4B', calloutBg: '#FFFBEB', calloutBorder: '#C9A96E', calloutText: '#78350F', rule: '#E2E8F0' },
  success: { tagBg: '#ECFDF5', tagText: '#047857', calloutBg: '#ECFDF5', calloutBorder: '#059669', calloutText: '#064E3B', rule: '#D1FAE5' },
  warning: { tagBg: '#FFFBEB', tagText: '#B45309', calloutBg: '#FFFBEB', calloutBorder: '#D97706', calloutText: '#78350F', rule: '#FDE68A' },
  alert:   { tagBg: '#FEF2F2', tagText: '#B91C1C', calloutBg: '#FEF2F2', calloutBorder: '#DC2626', calloutText: '#7F1D1D', rule: '#FECACA' },
};

Deno.serve(async (req) => {
  try {
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
      replyPrompt = true,
    } = body;

    const u = URGENCY[urgency] || URGENCY.default;

    // ── Hero image (full-width, top of card, before everything else) ──
    const heroHtml = heroImage
      ? `<tr><td style="padding:0;font-size:0;line-height:0;background:#FAFAF8;">
          <img src="${escapeHtml(heroImage)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;max-height:320px;object-fit:cover;background:#FAFAF8;" />
        </td></tr>`
      : '';

    const rows = (Array.isArray(dataRows) ? dataRows : [])
      .filter(r => r && r.label)
      .map(r => `
        <tr>
          <td style="padding:10px 0;color:#C9A96E;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;width:160px;vertical-align:top;">${escapeHtml(r.label)}</td>
          <td style="padding:10px 0;color:#0D1B2A;font-size:14px;font-weight:500;vertical-align:top;">${escapeHtml(r.value == null ? '—' : r.value)}</td>
        </tr>`).join('');

    const contextHtml = contextBlock
      ? `<p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.7;">${escapeHtml(contextBlock)}</p>`
      : '';

    const rowsHtml = rows
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-top:1px solid ${u.rule};border-bottom:1px solid ${u.rule};">${rows}</table>`
      : '';

    const sectionsHtml = (Array.isArray(sections) ? sections : [])
      .filter(s => s && s.title)
      .map(sec => {
        const sRows = (Array.isArray(sec.dataRows) ? sec.dataRows : [])
          .filter(r => r && r.label)
          .map(r => `<tr><td style="padding:8px 0;color:#C9A96E;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;width:170px;vertical-align:top;">${escapeHtml(r.label)}</td><td style="padding:8px 0;color:#0D1B2A;font-size:14px;font-weight:500;vertical-align:top;">${escapeHtml(r.value == null ? '—' : r.value)}</td></tr>`)
          .join('');
        const sRowsHtml = sRows
          ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;border-top:1px solid ${u.rule};border-bottom:1px solid ${u.rule};">${sRows}</table>`
          : `<p style="margin:8px 0 0;color:#94A3B8;font-size:13px;font-style:italic;">Nothing to report.</p>`;
        const sCta = (sec.ctaLabel && sec.ctaUrl)
          ? `<a href="${escapeHtml(sec.ctaUrl)}" style="display:inline-block;margin-top:8px;color:#C9A96E;font-size:13px;font-weight:600;text-decoration:none;">${escapeHtml(sec.ctaLabel)} &rarr;</a>`
          : '';
        return `<div style="margin:24px 0;padding-top:18px;border-top:1px solid #C9A96E;"><h3 style="margin:0 0 2px;font-family:'Lato',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#0D1B2A;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(sec.title)}</h3>${sRowsHtml}${sCta}</div>`;
      }).join('');

    // ── "What happens next" 3-step section ──
    const whnItems = (Array.isArray(whatHappensNext) ? whatHappensNext : []).filter(s => s && s.title);
    const whnHtml = whnItems.length > 0
      ? `<table class="whn-table" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
          <tr>
            ${whnItems.map((step, i) => {
              const num = step.number != null ? step.number : i + 1;
              return `<td width="${Math.floor(100 / whnItems.length)}%" valign="top" style="padding:0 8px;">
                <div style="width:32px;height:32px;border-radius:50%;background:#0D1B2A;color:#ffffff;font-size:14px;font-weight:700;text-align:center;line-height:32px;margin-bottom:12px;font-family:'Lato',Helvetica,Arial,sans-serif;">${escapeHtml(num)}</div>
                <h3 style="margin:0 0 6px;font-family:'Lato',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#0D1B2A;line-height:1.3;">${escapeHtml(step.title)}</h3>
                <p style="margin:0;font-size:13px;line-height:1.55;color:#475569;">${escapeHtml(step.body || '')}</p>
              </td>`;
            }).join('')}
          </tr>
        </table>
        <style>
          @media only screen and (max-width: 480px) {
            .whn-table td { display:block !important; width:100% !important; padding:0 0 20px 0 !important; }
          }
        </style>`
      : '';

    const calloutHtml = callout
      ? `<div style="margin:20px 0;padding:14px 18px;background:${u.calloutBg};border-left:3px solid ${u.calloutBorder};border-radius:8px;"><p style="margin:0;color:${u.calloutText};font-size:13px;line-height:1.6;font-weight:600;">${escapeHtml(callout)}</p></div>`
      : '';

    const ctaBorder = urgency === 'alert' ? `border:2px solid #DC2626;` : '';
    const ctaHtml = (ctaLabel && ctaUrl)
      ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0D1B2A;color:#ffffff;${ctaBorder}padding:14px 32px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">${escapeHtml(ctaLabel)}</a>`
      : '';

    const secondaryCtaHtml = (secondaryCtaLabel && secondaryCtaUrl)
      ? `<a href="${escapeHtml(secondaryCtaUrl)}" style="display:inline-block;margin-left:8px;background:transparent;color:#0D1B2A;padding:14px 24px;border:1px solid #E2E8F0;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(secondaryCtaLabel)}</a>`
      : '';

    // ── Social proof line (below CTA, gold-accented) ──
    const socialProofHtml = socialProof
      ? `<p style="margin:20px 0 0;font-size:13px;color:#475569;line-height:1.6;font-style:italic;">${renderSocialProof(socialProof)}</p>`
      : '';

    // ── Reply prompt (warm human touch, above footer) ──
    const replyPromptHtml = replyPrompt
      ? `<p style="margin:18px 0 0;font-size:14px;color:#475569;line-height:1.5;">Questions? Just reply to this email — we read every one.</p>`
      : '';

    const footerNoteHtml = footerNote
      ? `<p style="margin:16px 0 0;color:#94A3B8;font-size:12px;line-height:1.6;">${escapeHtml(footerNote)}</p>`
      : '';

    const tagHtml = eventType
      ? `<div style="display:inline-block;background:${u.tagBg};color:${u.tagText};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 14px;border-radius:999px;margin-bottom:20px;">${escapeHtml(eventType)}</div>`
      : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:'Lato',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:36px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(13,27,42,0.06);max-width:600px;">
${heroHtml}
<tr><td style="padding:36px 40px 8px;text-align:center;">
<img src="${LOGO_URL}" alt="${LOGO_ALT_TEXT}" width="56" height="56" style="width:56px;height:56px;border-radius:8px;margin-bottom:20px;display:block;"/>
</td></tr>
<tr><td style="padding:0 40px 40px;color:#0D1B2A;">
${tagHtml}
<h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#0D1B2A;line-height:1.25;">${escapeHtml(headline)}</h1>
<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">${escapeHtml(subheadline)}</p>
${contextHtml}
${rowsHtml}
${sectionsHtml}
${whnHtml}
${calloutHtml}
${ctaHtml}${secondaryCtaHtml}
${socialProofHtml}
${replyPromptHtml}
${footerNoteHtml}
</td></tr>
<tr><td style="padding:24px 40px 32px;border-top:1px solid #E2E8F0;background:#FAFBFC;">
<p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;line-height:1.6;">
The 100 Collection &mdash; Curated Luxury Vacation Rentals<br>
<a href="https://theonehundredcollection.com" style="color:#C9A96E;text-decoration:none;font-weight:600;">theonehundredcollection.com</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    // ── Plain-text version ──
    const textParts = [];
    if (eventType) textParts.push(`[${eventType}]`);
    textParts.push(headline);
    if (subheadline) textParts.push('', subheadline);
    if (contextBlock) textParts.push('', contextBlock);
    if (rows) {
      textParts.push('');
      for (const r of dataRows.filter(r => r && r.label)) {
        textParts.push(`${r.label}: ${r.value == null ? '—' : r.value}`);
      }
    }
    if (whnItems.length > 0) {
      textParts.push('', 'WHAT HAPPENS NEXT');
      for (let i = 0; i < whnItems.length; i++) {
        const step = whnItems[i];
        const num = step.number != null ? step.number : i + 1;
        textParts.push(`${num}. ${step.title}`, `   ${step.body || ''}`);
      }
    }
    if (ctaLabel && ctaUrl) textParts.push('', `${ctaLabel}: ${ctaUrl}`);
    if (secondaryCtaLabel && secondaryCtaUrl) textParts.push(`${secondaryCtaLabel}: ${secondaryCtaUrl}`);
    if (callout) textParts.push('', `NOTE: ${callout}`);
    if (Array.isArray(sections) && sections.length > 0) {
      for (const sec of sections.filter(s => s && s.title)) {
        textParts.push('', sec.title);
        const sRows = (Array.isArray(sec.dataRows) ? sec.dataRows : []).filter(r => r && r.label);
        if (sRows.length === 0) { textParts.push('  Nothing to report.'); }
        for (const r of sRows) textParts.push(`  ${r.label}: ${r.value == null ? '—' : r.value}`);
      }
    }
    if (socialProof) textParts.push('', socialProof.replace(/\*\*/g, ''));
    if (replyPrompt) textParts.push('', 'Questions? Just reply to this email — we read every one.');
    if (footerNote) textParts.push('', footerNote);
    textParts.push('', 'The 100 Collection — Curated Luxury Vacation Rentals', 'theonehundredcollection.com');
    const text = textParts.join('\n');

    return Response.json({
      subject: subject || headline,
      html,
      text,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});