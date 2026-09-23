import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { computeSpamScore } from '../../shared/spamDetection.ts';

// Public endpoint (no auth) that stores /apply funnel events.
// Frontend fire-and-forgets batches here; the function returns 200 fast.
//
// Defenses:
//   - Rate limit: max 20 events per IP per minute (extra events dropped,
//     not errored, so the frontend never blocks).
//   - Spam scoring: reuses the shared computeSpamScore on any captured
//     email/name/company. Events scoring > 0.5 are still stored (useful for
//     tuning) but tagged and hidden from default admin views.

const RATE_LIMIT_PER_MIN = 20;

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      return Response.json({ ok: true, stored: 0, reason: 'invalid json' });
    }

    // Normalize to an array of events.
    let events: any[] = [];
    if (Array.isArray(body)) events = body;
    else if (Array.isArray(body?.events)) events = body.events;
    else if (body?.event) events = [body.event];
    if (events.length === 0) {
      return Response.json({ ok: true, stored: 0 });
    }

    const ip = clientIp(req);
    const now = Date.now();

    // Rate limit: count this IP's events in the last 60s.
    let recentForIp: any[] = [];
    try {
      recentForIp = await base44.asServiceRole.entities.ApplyFunnelEvent.filter({ ip_address: ip }, '-created_date', 100);
    } catch (_) { /* best-effort */ }
    const inWindow = (recentForIp || []).filter((e: any) => {
      const t = e.created_date ? new Date(e.created_date).getTime() : 0;
      return t > 0 && now - t < 60_000;
    }).length;
    const remaining = Math.max(0, RATE_LIMIT_PER_MIN - inWindow);
    if (remaining === 0) {
      return Response.json({ ok: true, stored: 0, rate_limited: true, dropped: events.length });
    }
    const toStore = events.slice(0, remaining);

    let stored = 0;
    for (const ev of toStore) {
      if (!ev || !ev.session_id || !ev.event_type) continue;
      // Spam score from any captured PII.
      let spamScore = 0;
      let spamReasons: string[] = [];
      const emailVal = ev.email || (ev.event_type === 'email_captured' ? ev.event_data?.value : null);
      const nameVal = ev.full_name || (ev.event_type === 'name_captured' ? ev.event_data?.value : null);
      const companyVal = ev.company_name || (ev.event_type === 'company_captured' ? ev.event_data?.value : null);
      if (emailVal || nameVal || companyVal) {
        const { score, reasons } = computeSpamScore({
          email: emailVal || '',
          full_name: nameVal || '',
          company_name: companyVal || '',
          applicant_type: ev.applicant_type || '',
        });
        spamScore = score;
        spamReasons = reasons || [];
      }
      const record: any = {
        session_id: ev.session_id,
        event_type: ev.event_type,
        event_data: ev.event_data || {},
        applicant_type: ev.applicant_type ?? null,
        email: emailVal || (ev.event_type === 'email_captured' ? ev.event_data?.value : null) || null,
        full_name: nameVal || (ev.event_type === 'name_captured' ? ev.event_data?.value : null) || null,
        company_name: companyVal || (ev.event_type === 'company_captured' ? ev.event_data?.value : null) || null,
        page_path: ev.page_path || '',
        attribution_source_label: ev.attribution_source_label || '',
        ip_address: ip,
        user_agent: ev.user_agent || '',
        referrer: ev.referrer || '',
        spam_score: spamScore,
      };
      try {
        await base44.asServiceRole.entities.ApplyFunnelEvent.create(record);
        stored++;
      } catch (e) {
        console.log(`[logFunnelEvent] create failed: ${(e as Error).message}`);
      }
    }

    return Response.json({ ok: true, stored, rate_limited: remaining < events.length, dropped: events.length - stored });
  } catch (error) {
    console.error(`[logFunnelEvent] Error: ${(error as Error).message}`);
    return Response.json({ ok: true, stored: 0, error: (error as Error).message });
  }
}