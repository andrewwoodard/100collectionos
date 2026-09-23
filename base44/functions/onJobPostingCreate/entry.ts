import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Fired by entity automation: JobPosting create.
// Creates an admin notification (in-app + branded email).
// Idempotent via dedup_key; also sets admin_notified_at sent-marker.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const job = body.data;

    if (!job || !job.id) return Response.json({ ok: true, skipped: 'no job data' });

    const partnerName = job.partner_name || 'A partner';
    const jobTitle = job.title || 'Untitled position';
    const location = job.location || '—';

    const JOB_TYPE_LABELS = {
      full_time: 'Full Time', part_time: 'Part Time',
      contract: 'Contract', seasonal: 'Seasonal', internship: 'Internship',
    };
    const DEPT_LABELS = {
      operations: 'Operations', guest_services: 'Guest Services',
      housekeeping: 'Housekeeping', maintenance: 'Maintenance',
      marketing: 'Marketing', management: 'Management', other: 'Other',
    };

    const jobType = job.job_type ? (JOB_TYPE_LABELS[job.job_type] || job.job_type) : '—';
    const department = job.department ? (DEPT_LABELS[job.department] || job.department) : '—';
    const compensation = job.compensation || '—';

    const dataRows = [
      { label: 'Title', value: jobTitle },
      { label: 'Partner', value: partnerName },
      { label: 'Location', value: location },
      { label: 'Type', value: jobType },
      { label: 'Department', value: department },
      { label: 'Compensation', value: compensation },
    ];

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'NEW JOB POSTING',
      template_slug: 'admin-new-job-posting',
      template_context: { partner: { partner_name: partnerName }, job: { title: jobTitle, location, job_type: jobType, department, compensation, id: job.id } },
      urgency: 'default',
      headline: `${partnerName} posted a new job`,
      subheadline: 'A partner posted a position for review.',
      contextBlock: `${partnerName} posted "${jobTitle}" in ${location}.`,
      dataRows,
      ctaLabel: 'Review Posting',
      ctaUrl: `https://100c-os.base44.app/JobApplications?tab=postings&postingId=${job.id}`,
      subject: `New job posting — ${jobTitle} (${partnerName})`,
      dedup_key: `${job.id}__created__admin`,
      portalNotification: {
        type: 'job_posting',
        title: `New job posting — ${jobTitle}`,
        message: `${partnerName} posted "${jobTitle}" (${location}).`,
        link: `/JobApplications?tab=postings&postingId=${job.id}`,
      },
    });

    // Set admin_notified_at sent-marker (for badge count + email idempotency)
    if (!job.admin_notified_at && !res?.data?.skipped) {
      try {
        await base44.asServiceRole.entities.JobPosting.update(job.id, {
          admin_notified_at: new Date().toISOString(),
        });
      } catch (e) {
        console.log('Could not set admin_notified_at:', e.message);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});