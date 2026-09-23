import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin notification when a partner closes / fills a job posting.
// Called from CloseJobPostingModal on confirm.
// Idempotent via dedup_key = `job_closed__${job_id}`.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      job_id, partner_name, title, location,
      closed_reason, hired_person_name, candidates_notified_count,
      filled, changed_by,
    } = body;

    if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });

    const isFilled = !!filled;
    const reasonLabel = closed_reason === 'filled' ? 'Position Filled'
      : closed_reason === 'no_hire' ? 'Did not find the right fit'
      : (closed_reason || 'Other');

    const dataRows = [
      { label: 'Partner', value: partner_name || '—' },
      { label: 'Position', value: title || '—' },
      { label: 'Location', value: location || '—' },
      { label: 'Closed Reason', value: reasonLabel },
    ];
    if (isFilled && hired_person_name) {
      dataRows.push({ label: 'Hired Person', value: hired_person_name });
    }
    if (typeof candidates_notified_count === 'number') {
      dataRows.push({ label: 'Candidates Notified', value: String(candidates_notified_count) });
    }
    if (changed_by) {
      dataRows.push({ label: 'Closed By', value: changed_by });
    }

    const jobClosedSlug = isFilled ? 'admin-job-posting-filled' : 'admin-job-posting-closed';
    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'JOB POSTING CLOSED',
      template_slug: jobClosedSlug,
      template_context: { partner: { partner_name }, job: { title, location, closed_reason: reasonLabel, hired_person_name, candidates_notified_count, job_id, changed_by, filled: isFilled } },
      urgency: isFilled ? 'success' : 'default',
      headline: isFilled
        ? `${partner_name || 'A partner'} filled ${title || 'a position'}`
        : `${partner_name || 'A partner'} closed ${title || 'a position'}`,
      subheadline: isFilled
        ? 'The listing is wrapped up and remaining candidates were notified.'
        : 'The listing has been closed and pending applicants were notified.',
      contextBlock: isFilled
        ? `${partner_name || 'The partner'} marked ${title || 'this position'} as filled${hired_person_name ? ` and noted the hire` : ''}.`
        : `${partner_name || 'The partner'} closed the listing for ${title || 'this position'}.`,
      dataRows,
      ctaLabel: 'View in Admin Hub',
      ctaUrl: `https://100c-os.base44.app/JobApplications?tab=postings&postingId=${job_id}`,
      subject: `${isFilled ? 'Position filled' : 'Position closed'} — ${title || 'job'} (${partner_name || 'partner'})`,
      dedup_key: `job_closed__${job_id}`,
      portalNotification: {
        type: 'job_posting',
        title: isFilled ? `Position filled — ${title || ''}` : `Position closed — ${title || ''}`,
        message: `${partner_name || 'A partner'} ${isFilled ? 'filled' : 'closed'} "${title || 'a position'}".`,
        partnerName: partner_name,
        link: `/JobApplications?tab=postings&postingId=${job_id}`,
      },
    });

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});