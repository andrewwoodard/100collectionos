import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { computeSpamScoreWithContext, canonicalGmail, isGibberishText } from '../../shared/spamDetection.ts';

// Bulk cleanup v2: re-sweeps all PartnerApplication records with status
// 'pending' OR 'spam_review' using the strengthened spam algorithm.
//
// Rules:
//   score > 0.5  → spam_review (quarantine, do NOT delete — preserves audit
//                  trail; admin can restore false positives from the Spam tab)
//   score <= 0.5 → pending
//
// Preserve overrides (force to pending regardless of score):
//   - Explicit preserve-list IDs
//   - Email matches an active Partner's primary_contact_email
//   - Email domain matches an active Partner's contact email domain
//   - Company name matches an active Partner
//   - Message has 50+ chars of legitimate (non-gibberish) prose
//
// Hard delete (only for egregious bots):
//   score > 0.9 AND canonical gmail 5+ total submissions AND gibberish name
//   AND gibberish company AND empty/short message → delete + log to SpamAttempt
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const PRESERVE_IDS = ['6a95e42b1563eab8cb61ff25'];

    // Build preserve sets from all Partners
    const partners = await svc.entities.Partner.list('-created_date', 500);
    const partnerEmails = new Set(
      partners.map((p) => String(p.primary_contact_email || '').toLowerCase().trim()).filter(Boolean)
    );
    // Free email providers are NOT a reliable partner-association signal —
    // anyone can have a gmail address. Only custom domains count.
    const FREE_EMAIL_PROVIDERS = new Set([
      'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','outlook.com',
      'live.com','msn.com','aol.com','icloud.com','me.com','mac.com','protonmail.com',
      'proton.me','zoho.com','yandex.com','mail.com','gmx.com','comcast.net','sbcglobal.net',
      'verizon.net','att.net','bellsouth.net','earthlink.net',
    ]);
    const partnerDomains = new Set(
      partners.map((p) => String(p.primary_contact_email || '').split('@')[1]?.toLowerCase())
        .filter((d) => d && !FREE_EMAIL_PROVIDERS.has(d))
    );
    const partnerCompanyNames = new Set(
      partners.flatMap((p) => [p.partner_name, p.company_name])
        .map((n) => String(n || '').toLowerCase().trim()).filter(Boolean)
    );

    // Fetch all pending AND spam_review applications
    const pending = await svc.entities.PartnerApplication.filter({ status: 'pending' }, '-created_date', 500);
    const spamReview = await svc.entities.PartnerApplication.filter({ status: 'spam_review' }, '-created_date', 500);
    const allApps = [...pending, ...spamReview];

    // De-duplicate (in case an app appears in both result sets due to timing)
    const seen = new Set();
    const apps = allApps.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });

    // Group by canonical gmail for repeat detection (frozen counts)
    const canonicalCounts = {};
    for (const app of apps) {
      const canonical = canonicalGmail(app.email);
      if (canonical) {
        canonicalCounts[canonical] = (canonicalCounts[canonical] || 0) + 1;
      }
    }

    let movedToSpam = 0;
    let keptPending = 0;
    let restoredToPending = 0;
    let hardDeleted = 0;
    const movedNames = [];
    const deletedNames = [];
    const preservedNames = [];

    const forcePending = async (app, label) => {
      if (app.status === 'spam_review') {
        await svc.entities.PartnerApplication.update(app.id, { status: 'pending', spam_score: 0 });
        restoredToPending++;
      }
      keptPending++;
      preservedNames.push(`${app.full_name} <${app.email}> — ${label}`);
    };

    for (const app of apps) {
      // --- Preserve overrides ---
      if (PRESERVE_IDS.includes(app.id)) { await forcePending(app, 'explicit preserve ID'); continue; }

      const emailLower = String(app.email || '').toLowerCase().trim();
      const emailDomain = emailLower.split('@')[1];

      if (emailLower && partnerEmails.has(emailLower)) { await forcePending(app, 'email matches active Partner'); continue; }
      if (emailDomain && partnerDomains.has(emailDomain)) { await forcePending(app, 'domain matches active Partner'); continue; }

      const company = String(app.company_name || '').toLowerCase().trim();
      if (company && partnerCompanyNames.has(company)) { await forcePending(app, 'company matches active Partner'); continue; }

      const message = String(app.message || '').trim();
      if (message.length >= 50 && !isGibberishText(message)) { await forcePending(app, '50+ chars real prose'); continue; }

      // --- Score with canonical gmail context ---
      const canonical = canonicalGmail(app.email);
      const priorCount = canonical ? Math.max(0, (canonicalCounts[canonical] || 1) - 1) : 0;
      const { score, reasons } = computeSpamScoreWithContext(
        { ...app, applicant_type: app.applicant_type },
        { canonicalGmailPriorCount: priorCount }
      );

      // --- Hard delete: egregious bots ---
      const isEgregious = score > 0.9 &&
        priorCount >= 4 && // 5+ total from same canonical gmail
        isGibberishText(app.full_name) &&
        isGibberishText(app.company_name) &&
        String(app.message || '').trim().length < 20;

      if (isEgregious) {
        try {
          await svc.entities.SpamAttempt.create({
            attempted_at: new Date().toISOString(),
            ip_address: null,
            honeypot_triggered: false,
            time_to_submit_ms: null,
            spam_score: score,
            reason: `bulk_cleanup_hard_delete: ${reasons.join('; ')}`,
            raw_payload: { ...app },
            email: app.email || null,
          });
        } catch (e) { console.log('cleanup SpamAttempt log failed:', e.message); }
        await svc.entities.PartnerApplication.delete(app.id);
        hardDeleted++;
        deletedNames.push(`${app.full_name} <${app.email}> (${score.toFixed(2)})`);
        continue;
      }

      // --- Quarantine or pending based on score ---
      if (score > 0.5) {
        if (app.status !== 'spam_review' || app.spam_score !== score) {
          await svc.entities.PartnerApplication.update(app.id, { status: 'spam_review', spam_score: score });
        }
        movedToSpam++;
        movedNames.push(`${app.full_name} <${app.email}> (${score.toFixed(2)})`);
      } else {
        if (app.status === 'spam_review') {
          await svc.entities.PartnerApplication.update(app.id, { status: 'pending', spam_score: score });
          restoredToPending++;
        }
        keptPending++;
      }
    }

    return Response.json({
      ok: true,
      scanned: apps.length,
      movedToSpam,
      keptPending,
      restoredToPending,
      hardDeleted,
      moved_names: movedNames,
      deleted_names: deletedNames,
      preserved_names: preservedNames,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}