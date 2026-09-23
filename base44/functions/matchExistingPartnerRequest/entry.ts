import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Scores partner matches for an existing_partner_access_request application.
// Writes top 3 candidates to PartnerApplication.match_candidates, fires admin
// PortalNotification, and sends auto-reply email to the applicant via sendResendEmail.

function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

function emailDomain(email) {
  if (!email) return '';
  const parts = email.split('@');
  return parts.length > 1 ? normalize(parts[1]) : '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { application_id } = body;

    if (!application_id) return Response.json({ error: 'application_id required' }, { status: 400 });

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const application = await base44.asServiceRole.entities.PartnerApplication.get(application_id);
    if (!application) return Response.json({ error: 'Application not found' }, { status: 404 });

    // Idempotency guard: skip if admin was already notified for this application recently
    if (application.admin_notified_at) {
      const notifiedAt = new Date(application.admin_notified_at);
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (notifiedAt > tenMinAgo) {
        console.log(`[matchExistingPartnerRequest] Skipping — admin already notified at ${application.admin_notified_at} for application ${application_id}`);
        return Response.json({ ok: true, skipped: 'admin_already_notified', match_candidates: application.match_candidates || [] });
      }
    }

    const companyName = normalize(application.company_name || '');
    const applicantEmail = normalize(application.email || '');
    const applicantDomain = emailDomain(application.email || '');

    // Fetch all partners
    const allPartners = await base44.asServiceRole.entities.Partner.list('-created_date', 500);

    const candidates = [];

    for (const p of allPartners) {
      const pName = normalize(p.partner_name || '');
      const pContactEmail = normalize(p.primary_contact_email || '');
      let confidence = 0;
      const reasons = [];

      if (companyName && pName && companyName === pName) {
        confidence = 100;
        reasons.push('Exact name match');
      }

      if (confidence < 100 && companyName && pName) {
        const sim = similarity(companyName, pName);
        if (sim >= 85) {
          confidence = Math.max(confidence, sim);
          reasons.push(`Fuzzy name match (${sim}%)`);
        } else if (pName && (companyName.includes(pName) || pName.includes(companyName)) && Math.min(companyName.length, pName.length) >= 4) {
          confidence = Math.max(confidence, 90);
          reasons.push('Substring name match');
        }
      }

      if (applicantEmail && pContactEmail && applicantEmail === pContactEmail) {
        confidence = 100;
        reasons.push('Exact contact email match');
      }

      // Words that are too generic to be identifying — strip before comparing
      const GENERIC_NAME_WORDS = new Set([
        'the', 'and', 'of', 'a', 'an', 'co', 'llc', 'inc', 'group', 'corp', 'corporation',
        'vacation', 'vacations', 'rental', 'rentals',
        'property', 'properties', 'management', 'managers',
        'home', 'homes', 'house', 'houses', 'cabin', 'cabins',
        'estate', 'estates', 'resort', 'resorts', 'lodging', 'lodge',
        'hospitality', 'collection', 'company', 'agency',
        'stays', 'stay', 'getaway', 'getaways', 'retreats', 'retreat',
      ]);

      if (applicantDomain && pName) {
        const domainPrefix = applicantDomain.split('.')[0]; // e.g. "seamountainvacations"
        const nameNoSpaces = pName.replace(/\s+/g, '');     // "seamountainvacations"

        // Path 1: full name (no spaces) IS the domain prefix — extremely strong signal
        if (nameNoSpaces && domainPrefix === nameNoSpaces && nameNoSpaces.length >= 5) {
          confidence = Math.max(confidence, 95);
          reasons.push('Domain exactly matches partner name');
        }
        // Path 2: distinctive words (generic-industry-words stripped) appear as a substring
        else {
          const distinctiveWords = pName
            .split(/\s+/)
            .filter(w => w.length >= 3 && !GENERIC_NAME_WORDS.has(w));
          const distinctiveJoined = distinctiveWords.join('');

          if (
            domainPrefix &&
            distinctiveJoined.length >= 5 &&
            domainPrefix.includes(distinctiveJoined)
          ) {
            confidence = Math.max(confidence, 80);
            reasons.push('Email domain match (distinctive name)');
          }
        }
      }

      if (confidence > 0) {
        candidates.push({
          partner_id: p.id,
          partner_name: p.partner_name,
          confidence,
          reason: reasons.join('; '),
        });
      }
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const topCandidates = candidates.slice(0, 3);

    await base44.asServiceRole.entities.PartnerApplication.update(application_id, {
      match_candidates: topCandidates,
    });

    // Admin notification (idempotent via dedup_key)
    const topMatch = topCandidates[0];
    const adminMessage = topMatch
      ? `${application.full_name} from ${application.company_name || '(no company)'} requested access. Top match: ${topMatch.partner_name} (${topMatch.confidence}%).`
      : `${application.full_name} from ${application.company_name || '(no company)'} requested access. No confident match found.`;

    // Admin notification (in-app + branded email) via shared orchestrator
    // When no match is found, suppress Match Confidence / Matched Partner rows
    // and use warning urgency so admins can see it needs manual review at a glance.
    const matchRows = topMatch
      ? [
          { label: 'Match Confidence', value: `${topMatch.confidence}%` },
          { label: 'Matched Partner', value: topMatch.partner_name },
        ]
      : [];

    console.log(`[matchExistingPartnerRequest] application_id=${application_id}, applicant=${application.full_name}, top_match=${topMatch?.partner_name || 'none'}, confidence=${topMatch?.confidence || 0}, admin_notified_at=${application.admin_notified_at || 'never'}`);

    await base44.functions.invoke('sendAdminNotification', {
      eventType: 'PORTAL ACCESS REQUEST',
      template_slug: 'admin-portal-access-request',
      template_context: { application: { full_name: application.full_name, company_name: application.company_name, email: application.email, match_partner_name: topMatch?.partner_name, match_confidence: topMatch?.confidence, id: application_id } },
      urgency: topMatch ? 'default' : 'warning',
      headline: `${application.full_name || 'Someone'} requested portal access`,
      subheadline: topMatch
        ? `Top match: ${topMatch.partner_name} (${topMatch.confidence}% confidence)`
        : 'No confident match found. Manual review needed.',
      contextBlock: `${application.full_name || 'An applicant'} from ${application.company_name || 'their company'} requested access to an existing partner portal.`,
      dataRows: [
        { label: 'Applicant Name', value: application.full_name || '—' },
        { label: 'Email', value: application.email || '—' },
        { label: 'Company', value: application.company_name || '—' },
        ...matchRows,
      ],
      ctaLabel: 'Review Request',
      ctaUrl: 'https://100c-os.base44.app/admin/applications',
      subject: `Portal access request — ${application.full_name || application.email || ''}`,
      dedup_key: `${application_id}__existing_partner_request`,
      portalNotification: {
        type: 'general',
        title: 'Existing partner requesting portal access',
        message: adminMessage,
        submissionId: application_id,
        link: `/admin/hub?tab=applications&filter=existing_partner_access`,
      },
    });

    // Mark admin as notified (idempotency guard for future calls)
    try {
      await base44.asServiceRole.entities.PartnerApplication.update(application_id, {
        admin_notified_at: new Date().toISOString(),
      });
    } catch (e) {
      console.log('[matchExistingPartnerRequest] Could not set admin_notified_at:', e.message);
    }

    // Auto-reply email to applicant
    const firstName = (application.full_name || '').split(' ')[0]?.trim() || 'there';
    const companyDisplayName = application.company_name || 'your company';

    let emailStatus = 'unknown';
    try {
      const result = await sendTemplatedEmail(base44, 'partner-application-auto-reply', {
        application: { first_name: firstName, full_name: application.full_name, company_name: companyDisplayName, email: application.email },
      }, { to: application.email });
      emailStatus = result.ok ? 'sent' : (result.error || 'unknown');
      if (result.skipped) emailStatus = 'skipped';
    } catch (e) {
      emailStatus = 'failed';
    }

    return Response.json({
      ok: true,
      match_candidates: topCandidates,
      notification_sent: true,
      email_status: emailStatus,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});