import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Sends candidate-facing transactional emails on job application status change.
// Called from JobApplicationsTable when an admin or partner changes a candidate's status.
// Slugs: application-under-review, interview-invitation, offer-extended, hired-welcome, application-rejected.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { applicationId, newStatus, partnerFacingMessage } = body;

    if (!applicationId || !newStatus) {
      return Response.json({ ok: true, skipped: 'invalid request' });
    }

    // Fetch the job_application row from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );
    const { data: app, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (error || !app) {
      return Response.json({ error: 'application not found' }, { status: 404 });
    }

    const candidateEmail = app.email;
    if (!candidateEmail) {
      return Response.json({ ok: true, skipped: 'no candidate email' });
    }

    const candidateName = app.name ||
      [app.first_name, app.last_name].filter(Boolean).join(' ') || 'there';
    const jobTitle = app.job_title || 'the position';
    const partnerName = app.partner_name || '';

    const slugMap = {
      under_review: 'application-under-review',
      interview: 'interview-invitation',
      offer: 'offer-extended',
      hired: 'hired-welcome',
      rejected: 'application-rejected',
    };
    const slug = slugMap[newStatus];
    if (!slug) {
      return Response.json({ ok: true, skipped: 'no template for status' });
    }

    const context = {
      candidate: {
        name: candidateName,
        email: candidateEmail,
        job_title: jobTitle,
      },
      partner: {
        partner_name: partnerName,
      },
      message: partnerFacingMessage || '',
    };

    const result = await sendTemplatedEmail(base44, slug, context, { to: candidateEmail });

    return Response.json({ ok: result.ok, skipped: result.skipped, error: result.error });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});