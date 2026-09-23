// Cold-signup intercept.
// Called from the frontend (ColdSignupHandler) when a user signs in via
// Google/email but is NOT registered in the app (user_not_registered).
// Creates an idempotent PortalAccessRequest, fuzzy-matches existing partners
// by email domain, checks for an existing PartnerApplication by email, sends
// a warm on-brand email routing them to /apply, and notifies admins.
//
// Spam defense: the email is scored with computeUserSpamScore BEFORE any
// record is created. High-confidence spam (>0.7) is silently rejected — no
// PortalAccessRequest, no admin notification, logged to SpamAttempt. Borderline
// (0.4-0.7) is quarantined to PortalAccessRequest status 'spam_review' with
// notifications suppressed. Base44's native signup already created the User
// record by this point; the nightly bulkPurgeSpamBase44Users cron cleans those
// up afterward.
//
// Uses the service role for all entity operations so it works even though the
// caller is not yet a registered app user.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { waitUntil } from 'base44:runtime';
import { sendResendEmailDirect } from '../../shared/resendEmail.ts';
import { ADMIN_NOTIFICATION_RECIPIENTS_CSV } from '../../shared/adminRecipients.ts';
import { withUtm } from '../../shared/attribution.ts';
import { computeUserSpamScore } from '../../shared/spamDetection.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const email = (body?.email || '').toString().trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const attribution = body?.attribution || null;
    const sourceLabel = attribution?.source_label || 'Unknown (pre-tracking)';

    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Spam defense: score the email before creating any records. Bots that
    // hit the sign-in flow directly bypass the /apply form defenses.
    const { score: spamScore, reasons: spamReasons } = computeUserSpamScore({ email, full_name: body?.full_name });
    const isSpamReview = spamScore >= 0.4 && spamScore <= 0.7;

    if (spamScore > 0.7) {
      // Silent reject — log to SpamAttempt, create nothing, notify no one.
      waitUntil((async () => {
        try {
          await svc.entities.SpamAttempt.create({
            attempted_at: new Date().toISOString(),
            ip_address: body?.ip_address || null,
            spam_score: spamScore,
            reason: spamReasons.join('; '),
            email,
            raw_payload: { email, full_name: body?.full_name || null, source: 'cold_signup' },
          });
        } catch (_) { /* non-fatal */ }
      })());
      // Fake success so the bot doesn't change behavior.
      return Response.json({ ok: true });
    }

    // Idempotency: if a request already exists for this email, don't duplicate.
    const existing = await svc.entities.PortalAccessRequest.filter({ email });
    if (existing && existing.length > 0) {
      return Response.json({ ok: true, existing: true, request: existing[0] });
    }

    const domain = email.split('@')[1] || '';

    // Fuzzy match partners by email domain / company signals.
    const partners = await svc.entities.Partner.list('-created_date', 500);
    let matchedPartner: any = null;
    let matchedConfidence = 0;
    for (const p of partners) {
      const pEmail = (p.primary_contact_email || '').toLowerCase();
      const pDomain = pEmail ? pEmail.split('@')[1] : '';
      const companySlug = (p.company_name || p.partner_name || '').toLowerCase();
      const bareDomain = domain.split('.')[0];

      if (pEmail && pDomain === domain) {
        matchedPartner = p;
        matchedConfidence = 0.9;
        break;
      }
      if (bareDomain && bareDomain.length > 5 && companySlug.includes(bareDomain)) {
        matchedPartner = p;
        matchedConfidence = 0.6;
      }
    }

    // Check for an existing PartnerApplication by email.
    let matchedApp: any = null;
    try {
      const apps = await svc.entities.PartnerApplication.filter({ email });
      if (apps && apps.length > 0) matchedApp = apps[0];
    } catch (_) { /* non-fatal */ }

    const requestedAt = new Date().toISOString();

    const accessRequest = await svc.entities.PortalAccessRequest.create({
      email,
      email_domain: domain,
      source: 'cold_signup',
      status: isSpamReview ? 'spam_review' : 'auto_routed',
      matched_partner_id: matchedPartner?.id || null,
      matched_partner_name: matchedPartner?.partner_name || null,
      matched_partner_confidence: matchedConfidence || null,
      matched_application_id: matchedApp?.id || null,
      matched_application_date: matchedApp?.submitted_date || matchedApp?.created_date || null,
      requested_at: requestedAt,
      source_label: sourceLabel,
      attribution: attribution,
    });

    // Fire-and-forget: send the warm routing email + notify admins.
    // Suppressed for spam_review — quarantine silently, no admin ping.
    if (!isSpamReview) {
      waitUntil((async () => {
        const applyUrl = withUtm(`https://100c-os.base44.app/apply?from=signup&email=${encodeURIComponent(email)}`, 'cold_signup_routing', 'cold_signup');
        try {
          await sendResendEmailDirect(base44, {
            to: email,
            subject: 'Welcome, let\'s get you started',
            content: `
              <p style="margin:0 0 16px;">Hi there,</p>
              <p style="margin:0 0 16px;">Thanks for your interest in The 100 Collection. It looks like you tried to sign in to the partner portal, but we don't have an invitation on file for you yet.</p>
              <p style="margin:0 0 16px;">That's perfectly fine. Before we set up portal access, we'd love to learn about you and your properties. It takes about three minutes, and we'll get back to you within 48 hours.</p>
              <p style="margin:24px 0;">
                <a href="${applyUrl}" style="display:inline-block;background:#C9A96E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;">Start your application</a>
              </p>
              <p style="margin:0 0 16px;">Warmly,<br/>The 100 Collection Team</p>
            `,
            text: 'Thanks for your interest in The 100 Collection. You tried to sign in to the partner portal, but we don\'t have an invitation on file for you yet. Before we set up portal access, we\'d love to learn about you and your properties. Start your application: ' + applyUrl,
          });
        } catch (e) {
          console.log('[handleColdSignup] email send failed (non-fatal):', e.message);
        }

        // Consolidated admin email (same recipient list as all other admin notifications).
        try {
          await sendResendEmailDirect(base44, {
            to: ADMIN_NOTIFICATION_RECIPIENTS_CSV,
            subject: `New portal signup attempt: ${email}`,
            content: `
              <p style="margin:0 0 12px;"><strong style="color:#0D1B2A;">Cold signup detected</strong></p>
              <p style="margin:0 0 12px;">${email} tried to sign in to the partner portal without an invitation. We sent them a warm welcome and pointed them to the application.</p>
              <table style="border-collapse:collapse;font-size:14px;margin:0 0 12px;">
                <tr><td style="padding:4px 16px 4px 0;color:#64748B;">Signup source</td><td style="padding:4px 0;font-weight:600;color:#0D1B2A;">${sourceLabel}</td></tr>
                <tr><td style="padding:4px 16px 4px 0;color:#64748B;">Email</td><td style="padding:4px 0;">${email}</td></tr>
                <tr><td style="padding:4px 16px 4px 0;color:#64748B;">Domain</td><td style="padding:4px 0;">${domain}</td></tr>
                ${matchedPartner ? `<tr><td style="padding:4px 16px 4px 0;color:#64748B;">Possible match</td><td style="padding:4px 0;">${matchedPartner.partner_name} (${Math.round(matchedConfidence * 100)}%)</td></tr>` : ''}
                ${matchedApp ? '<tr><td style="padding:4px 16px 4px 0;color:#64748B;">Applied already</td><td style="padding:4px 0;">Yes, has a pending application</td></tr>' : ''}
              </table>
              <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">This signup was auto-routed to the application. No action needed unless you want to reach out directly.</p>
            `,
            text: `Cold signup detected: ${email} (${domain}). Source: ${sourceLabel}. ${matchedPartner ? 'Possible partner match: ' + matchedPartner.partner_name + '. ' : ''}Routed to the application. Review at /admin/hub?tab=access_queue`,
          });
        } catch (e) {
          console.log('[handleColdSignup] admin email failed (non-fatal):', e.message);
        }

        try {
          const admins = await svc.entities.User.list('-created_date', 100);
          const adminUsers = admins.filter((u: any) => u.role === 'admin');
          for (const a of adminUsers) {
            await svc.entities.PortalNotification.create({
              recipient_email: a.email,
              recipient_role: 'admin',
              type: 'general',
              title: 'New cold signup routed to application',
              message: `${email} tried to sign in without an invitation and was routed to the application.${matchedPartner ? ` Possible partner match: ${matchedPartner.partner_name}.` : ''}${matchedApp ? ' They also have a pending application on file.' : ''}`,
              dedup_key: `${accessRequest.id}__cold_signup`,
              link: '/admin/hub?tab=access_queue',
            });
          }
        } catch (e) {
          console.log('[handleColdSignup] admin notification failed (non-fatal):', e.message);
        }
      })());
    }

    return Response.json({ ok: true, request: accessRequest });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}