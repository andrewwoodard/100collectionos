import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { computeSpamScoreWithContext, isDisposableEmail, canonicalGmail } from '../../shared/spamDetection.ts';

// Public submission endpoint for all three /apply tracks. Runs the layered
// spam defense BEFORE any record is created:
//   Layer 1 — honeypot field (bots auto-fill invisible inputs)
//   Layer 2 — time-to-submit (under 3s = bot; under 8s = suspicious +0.6)
//   Layer 3 — content scoring via shared/spamDetection.ts
//   Layer 4 — IP rate limiting via SubmissionRateLimit
// Silent rejects return a fake success (same shape as a real one) so bots
// never learn they were caught and don't retry; every reject is logged to
// SpamAttempt for monitoring and tuning. Real humans get real success.

const HOUR_MS = 3600000;
const MIN_SUBMIT_MS = 3000;      // under 3s -> almost certainly a bot
const SUSPICIOUS_SUBMIT_MS = 8000; // under 8s -> +0.6 to the composite score
const RAPID_GAP_MS = 10000;      // no two accepted submissions within 10s
const MAX_PER_HOUR = 3;

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json();
    const { track, payload = {}, honeypot_value = '', time_to_submit_ms = null } = body;
    const ip = getClientIp(req);
    const nowIso = new Date().toISOString();
    const email = String(payload.email || '').trim();

    const fakeSuccess = () => Response.json({ ok: true, id: crypto.randomUUID(), status: 'pending', notify: false });

    const logSpam = async (reason, spamScore) => {
      try {
        await svc.entities.SpamAttempt.create({
          attempted_at: nowIso,
          ip_address: ip,
          honeypot_triggered: !!(String(honeypot_value || '').trim()),
          time_to_submit_ms: typeof time_to_submit_ms === 'number' ? time_to_submit_ms : null,
          spam_score: spamScore,
          reason,
          raw_payload: payload,
          email: email || null,
        });
      } catch (e) {
        console.log('SpamAttempt log failed:', e.message);
      }
    };

    const rejectSilently = async (reason, spamScore) => {
      await logSpam(reason, spamScore);
      return fakeSuccess();
    };

    // Layer 4 state: rate limiting by IP (read up front, counted at the end)
    let rl = null;
    try {
      rl = (await svc.entities.SubmissionRateLimit.filter({ ip_address: ip }))[0] || null;
    } catch (e) {
      console.log('rate limit lookup failed:', e.message);
    }
    const now = Date.now();
    const windowMs = rl?.window_start ? new Date(rl.window_start).getTime() : 0;
    const inWindow = windowMs > 0 && (now - windowMs) < HOUR_MS;
    const currentCount = inWindow ? (rl.count || 0) : 0;
    const lastCreatedMs = rl?.last_created_at ? new Date(rl.last_created_at).getTime() : 0;

    const countCreated = async () => {
      const record = {
        ip_address: ip,
        window_start: inWindow ? rl.window_start : new Date(now).toISOString(),
        count: currentCount + 1,
        last_created_at: new Date(now).toISOString(),
      };
      try {
        if (rl) await svc.entities.SubmissionRateLimit.update(rl.id, record);
        else await svc.entities.SubmissionRateLimit.create(record);
      } catch (e) {
        console.log('rate limit write failed:', e.message);
      }
    };

    // Layer 1: honeypot — real humans never see or fill this field.
    if (String(honeypot_value || '').trim()) {
      return await rejectSilently('honeypot: invisible field was filled', 1);
    }

    // Layer 4: IP rate limiting — max 3 accepted submissions per rolling
    // hour, and no two accepted submissions within 10 seconds of each other.
    if (lastCreatedMs && (now - lastCreatedMs) < RAPID_GAP_MS) {
      return await rejectSilently('rate_limit: submission within 10 seconds of a previous submission', 1);
    }
    if (currentCount >= MAX_PER_HOUR) {
      return await rejectSilently('rate_limit: more than 3 submissions in the past hour', 1);
    }

    // Layer 2: time-to-submit (client-reported; a missing value skips the check)
    if (typeof time_to_submit_ms === 'number' && time_to_submit_ms < MIN_SUBMIT_MS) {
      return await rejectSilently('time_to_submit: submitted in under 3 seconds', 1);
    }

    // Disposable email domains are a hard, silent reject.
    if (isDisposableEmail(email)) {
      return await rejectSilently(`disposable_email: ${String(email || '').split('@')[1]}`, 1);
    }

    // Layer 3: content-quality scoring (with canonical gmail repeat context)
    const canonical = canonicalGmail(email);
    let canonicalPriorCount = 0;
    if (canonical) {
      try {
        const recent = await svc.entities.PartnerApplication.list('-created_date', 100);
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        canonicalPriorCount = recent.filter((a) =>
          a.created_date && new Date(a.created_date).getTime() > sevenDaysAgo &&
          canonicalGmail(a.email) === canonical
        ).length;
      } catch (e) {
        console.log('canonical gmail lookup failed:', e.message);
      }
    }
    const { score: baseScore, reasons } = computeSpamScoreWithContext(
      { ...payload, applicant_type: payload.applicant_type || track },
      { canonicalGmailPriorCount: canonicalPriorCount }
    );
    let score = baseScore;
    if (typeof time_to_submit_ms === 'number' && time_to_submit_ms < SUSPICIOUS_SUBMIT_MS) {
      score += 0.6;
      reasons.push('time_to_submit: under 8 seconds (+0.6)');
    }

    if (score > 0.7) {
      return await rejectSilently(`spam_score ${score.toFixed(2)} — ${reasons.join('; ')}`, score);
    }

    const quarantined = score >= 0.4;

    // If this email already has a signup-created stub (source signup_vrm /
    // signup_homeowner from createSignupApplication), enrich that record
    // instead of creating a duplicate — the signup flow created the tagged
    // lead, and this full form submission completes it.
    let signupStub = null;
    try {
      const byEmail = await svc.entities.PartnerApplication.filter({ email });
      signupStub = byEmail.find((a) => a.source === 'signup_vrm' || a.source === 'signup_homeowner');
    } catch (e) {
      console.log('signup stub lookup failed:', e.message);
    }

    let recordId;
    if (signupStub) {
      const updated = await svc.entities.PartnerApplication.update(signupStub.id, {
        ...payload,
        status: quarantined ? 'spam_review' : 'pending',
        spam_score: score,
      });
      recordId = updated.id;
    } else {
      const created = await svc.entities.PartnerApplication.create({
        ...payload,
        status: quarantined ? 'spam_review' : 'pending',
        spam_score: score,
      });
      recordId = created.id;
    }
    await countCreated();

    // notify=false tells the client to skip the in-app admin notification and
    // partner matching for quarantined submissions (the create automation also
    // suppresses the admin email for high spam scores).
    return Response.json({
      ok: true,
      id: recordId,
      status: quarantined ? 'spam_review' : 'pending',
      notify: !quarantined,
    });
  } catch (error) {
    // Real server errors are NOT masked — legitimate applicants must see the
    // failure so they can retry or email the team.
    return Response.json({ error: error.message }, { status: 500 });
  }
}