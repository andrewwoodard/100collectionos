/**
 * Dual-write JobPosting to classic Supabase (theonehundredcollection.com/careers)
 * and the Neon supabase.job_postings jsonb mirror.
 */
import { getNeonPool, newId } from "./neon-db.js";
import { hasRemoteSupabase, supabaseRest } from "./supabase-remote.js";

function jobToRemoteRow(job: Record<string, any>) {
  if (!job?.id) return null;
  return {
    id: String(job.id),
    partner_id: job.partner_id || null,
    partner_name: job.partner_name || null,
    title: job.title || "Untitled",
    location: job.location || null,
    job_type: job.job_type || "full_time",
    department: job.department || null,
    description: job.description || null,
    requirements: job.requirements || null,
    compensation: job.compensation || null,
    application_email: job.application_email || null,
    application_url: job.application_url || null,
    status: job.status || "draft",
    closes_at: job.closes_at || null,
    created_date: job.created_date || new Date().toISOString(),
    updated_date: job.updated_date || new Date().toISOString(),
    created_by_id: job.created_by_id || null,
  };
}

async function mirrorNeonSupabaseJob(job: Record<string, any>) {
  const pool = getNeonPool();
  const id = String(job.id);
  const data = { ...job, id };
  await pool.query(
    `INSERT INTO supabase.job_postings (id, data, imported_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, imported_at = now()`,
    [id, JSON.stringify(data)]
  );
}

export async function syncJobPostingToSupabase(job: Record<string, any> | null | undefined) {
  if (!job?.id) return { skipped: true as const, reason: "no job" };
  const row = jobToRemoteRow(job);
  if (!row) return { skipped: true as const, reason: "no job" };

  try {
    await mirrorNeonSupabaseJob(job);
  } catch (error: any) {
    console.warn("[syncJobPosting] neon mirror failed:", error?.message || error);
  }

  if (!hasRemoteSupabase()) {
    return { skipped: true as const, reason: "Supabase credentials missing", id: row.id };
  }

  // Public careers site should only list active roles. Draft/closed are removed.
  if (row.status !== "active") {
    try {
      await supabaseRest(`job_postings?id=eq.${encodeURIComponent(row.id)}`, { method: "DELETE" });
      return { skipped: false as const, action: "unpublished" as const, id: row.id, status: row.status };
    } catch (error: any) {
      console.warn("[syncJobPosting] remote unpublish failed:", error?.message || error);
      return { skipped: true as const, reason: error?.message || "unpublish failed", id: row.id };
    }
  }

  try {
    await supabaseRest("job_postings?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    return { skipped: false as const, action: "upserted" as const, id: row.id, status: row.status };
  } catch (error: any) {
    console.warn("[syncJobPosting] remote upsert failed:", error?.message || error);
    return { skipped: true as const, reason: error?.message || "upsert failed", id: row.id };
  }
}

export async function deleteJobPostingFromSupabase(jobId: string) {
  const id = String(jobId || "");
  if (!id) return { skipped: true as const, reason: "no id" };

  try {
    const pool = getNeonPool();
    await pool.query(`DELETE FROM supabase.job_postings WHERE id = $1`, [id]);
  } catch (error: any) {
    console.warn("[syncJobPosting] neon delete failed:", error?.message || error);
  }

  if (!hasRemoteSupabase()) {
    return { skipped: true as const, reason: "Supabase credentials missing", id };
  }

  try {
    await supabaseRest(`job_postings?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return { skipped: false as const, action: "deleted" as const, id };
  } catch (error: any) {
    console.warn("[syncJobPosting] remote delete failed:", error?.message || error);
    return { skipped: true as const, reason: error?.message || "delete failed", id };
  }
}

/** Create admin inbox item + mark admin_notified_at (badge) for a new partner posting. */
export async function notifyAdminsNewJobPosting(job: Record<string, any>) {
  if (!job?.id) return { skipped: true as const };

  const pool = getNeonPool();
  const partnerName = job.partner_name || "A partner";
  const jobTitle = job.title || "Untitled position";
  const location = job.location || "—";
  const dedupKey = `${job.id}__created__admin`;

  const { rows: existing } = await pool.query(
    `SELECT id FROM base44.portal_notification WHERE data->>'dedup_key' = $1 LIMIT 1`,
    [dedupKey]
  );

  if (!existing[0]) {
    const notifId = newId();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO base44.portal_notification (id, created_date, updated_date, created_by, created_by_id, is_sample, data, imported_at)
       VALUES ($1, NOW(), NOW(), NULL, NULL, false, $2::jsonb, NOW())`,
      [
        notifId,
        JSON.stringify({
          id: notifId,
          recipient_role: "admin",
          type: "job_posting",
          title: `New job posting — ${jobTitle}`,
          message: `${partnerName} posted "${jobTitle}" (${location}) for review.`,
          link: `/JobApplications?tab=postings&postingId=${job.id}`,
          is_read: false,
          dedup_key: dedupKey,
          job_posting_id: job.id,
          partner_name: partnerName,
          created_date: now,
        }),
      ]
    );
  }

  if (!job.admin_notified_at) {
    const notifiedAt = new Date().toISOString();
    await pool.query(
      `UPDATE base44.job_posting
       SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_date = now()
       WHERE id = $1`,
      [job.id, JSON.stringify({ admin_notified_at: notifiedAt, updated_date: notifiedAt })]
    );
    job.admin_notified_at = notifiedAt;
  }

  return { ok: true as const };
}
