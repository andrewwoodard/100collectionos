import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled every Monday 7am ET. Aggregates last week (Mon-Sun).
// Always sends (business rhythm), shows "Quiet week" when volume is low.
// Saves last HTML to AppConfig + logs to AuditEntry.
// Idempotent via dedup_key = `weekly_digest__${weekStartYYYY-MM-DD}`.
const ADMIN_HUB = 'https://100c-os.base44.app/AdminHub';

function fmtDate(d) { return d.toISOString().slice(0, 10); }
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

    // Last week: Monday to Sunday
    const dayOfWeek = now.getDay(); // 0 Sun .. 1 Mon
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysSinceMonday);
    thisMonday.setHours(0, 0, 0, 0);
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - 7);
    const end = new Date(thisMonday);
    end.setMilliseconds(-1);

    const rangeLabel = `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    const configRows = await base44.asServiceRole.entities.AppConfig.list();
    const config = {};
    for (const row of configRows) config[row.key] = row.value;
    const enabled = (config.WEEKLY_DIGEST_ENABLED || 'true').toLowerCase() !== 'false';
    if (!enabled) return Response.json({ ok: true, skipped: 'weekly digest disabled' });

    const dedupKey = `weekly_digest__${fmtDate(start)}`;

    const [apps, subs, partners, licenses, tasks] = await Promise.all([
      base44.asServiceRole.entities.PartnerApplication.list('-created_date', 1000),
      base44.asServiceRole.entities.PropertySubmission.list('-created_date', 1000),
      base44.asServiceRole.entities.Partner.list('-created_date', 1000),
      base44.asServiceRole.entities.LicenseRecord.list('-created_date', 1000),
      base44.asServiceRole.entities.Task.list('-created_date', 500).catch(() => []),
    ]);

    const newApps = apps.filter(a => inRange(a.created_date, start, end));
    const newSubs = subs.filter(s => inRange(s.created_date, start, end) && s.status === 'submitted');
    const newPartners = partners.filter(p => inRange(p.created_date, start, end) && p.status === 'live');
    const paidInRange = licenses.filter(l => inRange(l.paid_date, start, end));
    const totalCollected = paidInRange.reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);
    const totalInvoiced = licenses.filter(l => inRange(l.invoice_date, start, end))
      .reduce((s, l) => s + (typeof l.annual_fee === 'number' ? l.annual_fee : 0), 0);
    const failedPayments = licenses.filter(l => l.payment_status === 'overdue');
    const upcomingRenewals = licenses.filter(l => {
      if (!l.license_end_date) return false;
      const d = new Date(l.license_end_date);
      const in30 = new Date(now.getTime() + 30 * 86400000);
      return d > now && d <= in30 && l.license_status === 'active';
    });

    const pendingApps = apps.filter(a => a.status === 'pending');
    const pendingSubs = subs.filter(s => s.status === 'submitted' || s.status === 'under_review');
    const overdueTasks = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now);
    const expiredNotPaused = licenses.filter(l => l.license_status === 'expired');
    const waitingLong = apps.filter(a => a.status === 'pending' && a.created_date && (now.getTime() - new Date(a.created_date).getTime()) > 7 * 86400000);

    // Top movers: partners by properties added (via submissions)
    const byPartner = {};
    newSubs.forEach(s => { byPartner[s.partner_name] = (byPartner[s.partner_name] || 0) + 1; });
    const topMovers = Object.entries(byPartner).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Pick a hero image: a property that had activity last week
    let digestHeroImage = '';
    try {
      const activePartnerIds = [...new Set(newSubs.map(s => s.partner_id).filter(Boolean))];
      let candidateProps = [];
      for (const pid of activePartnerIds.slice(0, 5)) {
        const pProps = await base44.asServiceRole.entities.Property.filter({ partner_id: pid }, '-created_date', 5);
        candidateProps = candidateProps.concat(pProps || []);
        if (candidateProps.length >= 10) break;
      }
      const withPhotos = candidateProps.find(p => p.photo_urls && p.photo_urls.length > 0);
      if (withPhotos) digestHeroImage = withPhotos.photo_urls[0];
    } catch (_) {}

    const isQuiet = newApps.length === 0 && newSubs.length === 0 && newPartners.length === 0 && paidInRange.length === 0;

    const sections = [];

    sections.push({
      title: 'Growth metrics',
      dataRows: [
        { label: 'New partners activated', value: String(newPartners.length) },
        { label: 'New property submissions', value: String(newSubs.length) },
        { label: 'New applications', value: String(newApps.length) },
      ],
    });

    sections.push({
      title: 'Revenue',
      dataRows: [
        { label: 'Total invoiced', value: '$' + totalInvoiced.toLocaleString('en-US') },
        { label: 'Total collected', value: '$' + totalCollected.toLocaleString('en-US') },
        { label: 'Failed / overdue payments', value: String(failedPayments.length) },
        { label: 'Upcoming renewals (30 days)', value: String(upcomingRenewals.length) },
      ],
    });

    sections.push({
      title: 'Pipeline health',
      dataRows: [
        { label: 'Applications pending review', value: String(pendingApps.length) },
        { label: 'Submissions pending review', value: String(pendingSubs.length) },
      ],
    });

    sections.push({
      title: 'Top movers this week',
      dataRows: topMovers.length
        ? topMovers.map(([name, count]) => ({ label: name || 'Partner', value: `${count} submission${count === 1 ? '' : 's'}` }))
        : [{ label: 'No new submissions', value: '—' }],
    });

    const attentionRows = [];
    if (overdueTasks.length) attentionRows.push({ label: 'Overdue tasks', value: String(overdueTasks.length) });
    if (failedPayments.length) attentionRows.push({ label: 'Failed payments unresolved', value: String(failedPayments.length) });
    if (expiredNotPaused.length) attentionRows.push({ label: 'Expired licenses not paused', value: String(expiredNotPaused.length) });
    if (waitingLong.length) attentionRows.push({ label: 'Applications waiting more than 7 days', value: String(waitingLong.length) });
    sections.push({
      title: 'Attention needed',
      dataRows: attentionRows.length ? attentionRows : [{ label: 'All clear', value: 'Nothing needs immediate attention' }],
    });

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'WEEKLY DIGEST',
      template_slug: 'weekly-digest',
      template_context: { range_label: rangeLabel, new_partners: newPartners.length, new_subs: newSubs.length, new_apps: newApps.length, total_collected: totalCollected, total_invoiced: totalInvoiced, failed_payments: failedPayments.length, upcoming_renewals: upcomingRenewals.length, is_quiet: isQuiet },
      urgency: isQuiet ? 'default' : (failedPayments.length > 0 ? 'warning' : 'success'),
      headline: isQuiet ? 'A quiet week at The 100 Collection' : 'Last week at The 100 Collection',
      subheadline: rangeLabel,
      contextBlock: isQuiet
        ? 'It was a slower week. A good moment to catch up on pipeline and outreach.'
        : 'Here is the weekly rhythm across partners, properties, and revenue.',
      heroImage: digestHeroImage,
      sections,
      ctaLabel: 'Open Admin Hub',
      ctaUrl: ADMIN_HUB,
      subject: `Weekly digest — ${rangeLabel}`,
      dedup_key: previewRecipient ? '' : dedupKey,
      recipientOverride: previewRecipient || config.DIGEST_RECIPIENTS || '',
      portalNotification: {
        type: 'general',
        title: `Weekly digest — ${rangeLabel}`,
        message: `${newPartners.length} new partners, ${newSubs.length} submissions, $${totalCollected.toLocaleString('en-US')} collected.`,
        link: '/AdminHub',
      },
    });

    if (res?.data?.email_html) {
      try {
        const existingCfg = (await base44.asServiceRole.entities.AppConfig.filter({ key: 'LAST_WEEKLY_DIGEST' }))[0];
        if (existingCfg) await base44.asServiceRole.entities.AppConfig.update(existingCfg.id, { value: res.data.email_html, updated_by: 'system' });
        else await base44.asServiceRole.entities.AppConfig.create({ key: 'LAST_WEEKLY_DIGEST', value: res.data.email_html, updated_by: 'system' });
      } catch (e) { console.warn('[weeklyAdminDigest] save failed:', e.message); }
    }
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: 'system', actor_role: 'system', action: 'digest_sent',
        entity_type: 'AdminDigest', details: JSON.stringify({ dedup_key: dedupKey, recipients: res?.data?.recipients, sections: sections.length }),
      });
    } catch (e) {}

    return Response.json({ ok: true, sent: !res?.data?.skipped, range: rangeLabel, quiet: isQuiet, sections: sections.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});