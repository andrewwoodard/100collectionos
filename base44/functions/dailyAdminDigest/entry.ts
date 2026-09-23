import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled weekday 8am ET. Aggregates yesterday's activity (Mon covers Fri-Sun).
// Skips send entirely if every section is zero. Saves last HTML to AppConfig + logs to AuditEntry.
// Idempotent via dedup_key = `daily_digest__${YYYY-MM-DD}`.
const ADMIN_HUB = 'https://100c-os.base44.app/AdminHub';

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function inRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const previewRecipient = body.preview_recipient || '';
    const now = new Date();

    // Determine the covered window. Monday digest covers Fri-Sun.
    const dayOfWeek = now.getDay(); // 0=Sun,1=Mon
    let start;
    if (dayOfWeek === 1) {
      // Monday: cover from Friday 00:00 through Sunday 23:59
      start = new Date(now);
      start.setDate(now.getDate() - 3);
    } else {
      start = new Date(now);
      start.setDate(now.getDate() - 1);
    }
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    end.setMilliseconds(-1);

    const rangeLabel = start.toDateString() === end.toDateString()
      ? start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    // Config: enable flags + recipients
    const configRows = await base44.asServiceRole.entities.AppConfig.list();
    const config = {};
    for (const row of configRows) config[row.key] = row.value;
    const enabled = (config.DAILY_DIGEST_ENABLED || 'true').toLowerCase() !== 'false';
    if (!enabled) return Response.json({ ok: true, skipped: 'daily digest disabled' });

    const dedupKey = `daily_digest__${fmtDate(end)}`;

    // Fetch activity sources
    const [apps, subs, partners, notifs] = await Promise.all([
      base44.asServiceRole.entities.PartnerApplication.list('-created_date', 500),
      base44.asServiceRole.entities.PropertySubmission.list('-created_date', 500),
      base44.asServiceRole.entities.Partner.list('-created_date', 500),
      base44.asServiceRole.entities.PortalNotification.list('-created_date', 500),
    ]);

    const newApps = apps.filter(a => inRange(a.created_date, start, end));
    const newSubs = subs.filter(s => inRange(s.created_date, start, end) && s.status === 'submitted');
    const newSignups = partners.filter(p => inRange(p.created_date, start, end));

    // Payments from LicenseRecord payment_status changes / paid_date in range
    const licenses = await base44.asServiceRole.entities.LicenseRecord.list('-created_date', 500);
    const paidInRange = licenses.filter(l => inRange(l.paid_date, start, end));
    const totalPaid = paidInRange.reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);
    const failedPayments = notifs.filter(n => inRange(n.created_date, start, end) && (n.title || '').includes('Payment failed'));

    // Job postings closed in range
    let jobPostings = [];
    try {
      jobPostings = await base44.asServiceRole.entities.JobPosting.list('-created_date', 500);
    } catch (e) {}
    const closedJobs = jobPostings.filter(j => inRange(j.closed_at, start, end));

    const allZero = newApps.length === 0 && newSubs.length === 0 && newSignups.length === 0
      && paidInRange.length === 0 && failedPayments.length === 0 && closedJobs.length === 0;

    if (allZero) {
      console.log('[dailyAdminDigest] all sections zero, skipping send');
      return Response.json({ ok: true, skipped: 'all_zero', range: rangeLabel });
    }

    const sections = [];

    sections.push({
      title: `You received ${newApps.length} new application${newApps.length === 1 ? '' : 's'}`,
      dataRows: newApps.length
        ? newApps.slice(0, 6).map(a => ({ label: a.company_name || a.full_name || 'Applicant', value: a.applicant_type === 'property_owner' ? 'Property Owner' : 'Property Manager' }))
        : [],
    });

    sections.push({
      title: `You received ${newSubs.length} new property submission${newSubs.length === 1 ? '' : 's'}`,
      dataRows: newSubs.length
        ? newSubs.slice(0, 6).map(s => ({ label: s.partner_name || 'Partner', value: s.property_name || 'Untitled' }))
        : [],
    });

    sections.push({
      title: `You collected ${paidInRange.length} payment${paidInRange.length === 1 ? '' : 's'} totaling $${totalPaid.toLocaleString('en-US')}`,
      dataRows: paidInRange.length
        ? paidInRange.slice(0, 6).map(l => ({ label: l.partner_name || 'Partner', value: '$' + (typeof l.annual_fee === 'number' ? l.annual_fee.toLocaleString('en-US') : '—') }))
        : [],
    });

    sections.push({
      title: failedPayments.length > 0 ? `${failedPayments.length} payment failure${failedPayments.length === 1 ? '' : 's'} need attention` : 'No payment failures',
      dataRows: failedPayments.length
        ? failedPayments.slice(0, 6).map(n => ({ label: n.partner_name || n.title || 'Failure', value: n.message || '' }))
        : [],
    });

    sections.push({
      title: `${newSignups.length} new portal signup${newSignups.length === 1 ? '' : 's'}`,
      dataRows: newSignups.length
        ? newSignups.slice(0, 6).map(p => ({ label: p.partner_name || 'Partner', value: p.primary_contact_email || p.market || '' }))
        : [],
    });

    sections.push({
      title: `${closedJobs.length} job posting${closedJobs.length === 1 ? '' : 's'} closed`,
      dataRows: closedJobs.length
        ? closedJobs.slice(0, 6).map(j => ({ label: j.partner_name || 'Partner', value: `${j.title || 'Position'} (${j.closed_reason === 'filled' ? 'Filled' : 'Closed'})` }))
        : [],
    });

    const isMonday = dayOfWeek === 1;
    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'DAILY BRIEFING',
      template_slug: 'daily-digest',
      template_context: { range_label: rangeLabel, new_apps: newApps.length, new_subs: newSubs.length, new_payments: paidInRange.length, total_paid: totalPaid, failed_payments: failedPayments.length, new_signups: newSignups.length, closed_jobs: closedJobs.length },
      urgency: failedPayments.length > 0 ? 'warning' : 'default',
      headline: isMonday ? 'Since Friday at The 100 Collection' : 'Yesterday at The 100 Collection',
      subheadline: rangeLabel,
      contextBlock: isMonday
        ? 'Here is everything that came in over the weekend.'
        : 'Here is a quick rundown of yesterday\'s activity.',
      sections,
      ctaLabel: 'Open Admin Hub',
      ctaUrl: ADMIN_HUB,
      subject: `Daily briefing — ${rangeLabel}`,
      dedup_key: previewRecipient ? '' : dedupKey,
      recipientOverride: previewRecipient || config.DIGEST_RECIPIENTS || '',
      portalNotification: {
        type: 'general',
        title: `Daily briefing — ${rangeLabel}`,
        message: `${newApps.length} applications, ${newSubs.length} submissions, ${paidInRange.length} payments.`,
        link: '/AdminHub',
      },
    });

    // Save last digest HTML + log to AuditEntry
    if (res?.data?.email_html) {
      try {
        const existingCfg = (await base44.asServiceRole.entities.AppConfig.filter({ key: 'LAST_DAILY_DIGEST' }))[0];
        if (existingCfg) {
          await base44.asServiceRole.entities.AppConfig.update(existingCfg.id, { value: res.data.email_html, updated_by: 'system' });
        } else {
          await base44.asServiceRole.entities.AppConfig.create({ key: 'LAST_DAILY_DIGEST', value: res.data.email_html, updated_by: 'system' });
        }
      } catch (e) {
        console.warn('[dailyAdminDigest] could not save last digest:', e.message);
      }
    }
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: 'system', actor_role: 'system', action: 'digest_sent',
        entity_type: 'AdminDigest', details: JSON.stringify({ dedup_key: dedupKey, recipients: res?.data?.recipients, sections: sections.length }),
      });
    } catch (e) {}

    return Response.json({ ok: true, sent: !res?.data?.skipped, range: rangeLabel, sections: sections.length, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});