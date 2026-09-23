import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Sends courtesy "position filled" or "position closed" emails to all pending applicants
// for a given job posting, then marks their job_application status as "rejected".
// Called from the partner portal when a partner closes a job posting.
// Slugs: position-filled-courtesy, position-closed-courtesy.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { jobPostingId, mode, customMessage, hiredFromApplicationId } = body;

    if (!jobPostingId || !mode) {
      return Response.json({ error: 'jobPostingId and mode are required' }, { status: 400 });
    }

    // Fetch the JobPosting from Base44
    let job;
    try {
      const jobs = await base44.asServiceRole.entities.JobPosting.filter({ id: jobPostingId });
      job = jobs?.[0];
    } catch (e) {
      return Response.json({ error: 'Job posting not found' }, { status: 404 });
    }
    if (!job) {
      return Response.json({ error: 'Job posting not found' }, { status: 404 });
    }

    const jobTitle = job.title || 'the position';
    const partnerName = job.partner_name || '';

    // Query Supabase for pending/under_review/interview applicants for this posting
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    let query = supabase
      .from('job_applications')
      .select('*')
      .eq('job_title', job.title)
      .eq('partner_name', partnerName)
      .in('status', ['pending', 'under_review', 'interview']);

    // Exclude the hired applicant if specified
    if (hiredFromApplicationId) {
      query = query.neq('id', hiredFromApplicationId);
    }

    const { data: applicants, error } = await query;

    if (error) {
      console.warn('[position-filled] Query error:', error.message);
      if (error.message.includes('status')) {
        const { data: fallback, error: fbErr } = await supabase
          .from('job_applications')
          .select('*')
          .eq('job_title', job.title)
          .eq('partner_name', partnerName);
        if (fbErr) {
          return Response.json({ notifiedCount: 0, error: fbErr.message });
        }
        const list = hiredFromApplicationId
          ? (fallback || []).filter(a => String(a.id) !== String(hiredFromApplicationId))
          : (fallback || []);
        return await processApplicants(base44, list, mode, jobTitle, partnerName, customMessage);
      }
      return Response.json({ notifiedCount: 0, error: error.message });
    }

    return await processApplicants(base44, applicants || [], mode, jobTitle, partnerName, customMessage);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function processApplicants(base44, applicants, mode, jobTitle, partnerName, customMessage) {
  const isFilled = mode === 'filled';
  const slug = isFilled ? 'position-filled-courtesy' : 'position-closed-courtesy';

  let notified = 0;
  let failed = 0;

  for (const app of applicants) {
    const candidateEmail = app.email;
    if (!candidateEmail) continue;

    const candidateName = app.name ||
      [app.first_name, app.last_name].filter(Boolean).join(' ') || 'there';

    const context = {
      candidate: {
        name: candidateName,
        email: candidateEmail,
        job_title: jobTitle,
      },
      partner: {
        partner_name: partnerName,
      },
      message: customMessage || '',
    };

    try {
      const result = await sendTemplatedEmail(base44, slug, context, { to: candidateEmail });
      if (result.ok || result.skipped) {
        notified++;
      } else {
        failed++;
      }
    } catch (e) {
      console.warn(`[position-filled] Email failed for ${candidateEmail}:`, e?.message);
      failed++;
    }

    // Update applicant status to rejected
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL'),
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      );
      await supabase
        .from('job_applications')
        .update({
          status: 'rejected',
          admin_notes: 'Position closed by partner',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', app.id);
    } catch (e) {
      console.warn(`[position-filled] Status update failed for ${app.id}:`, e?.message);
    }
  }

  return Response.json({ notifiedCount: notified, failedCount: failed });
}