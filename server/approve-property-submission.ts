import { getNeonPool, json, newId } from "./neon-db.js";
import { requireAdmin } from "./require-session.js";

/**
 * Local approve for PropertySubmission — publish without auto-creating a license.
 * Licenses are applied separately by admins on the partner/properties screens.
 */
export async function handleApprovePropertySubmission(req: any, res: any, body: any = {}) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const submissionId = String(body?.submissionId || "").trim();
  if (!submissionId) return json(res, 400, { error: "submissionId required" });

  const pool = getNeonPool();
  const { rows } = await pool.query(
    `SELECT id, data FROM base44.property_submission
     WHERE id = $1 OR data->>'id' = $1
     LIMIT 1`,
    [submissionId]
  );
  if (!rows[0]) return json(res, 404, { error: "Submission not found" });

  const submission = {
    ...(rows[0].data && typeof rows[0].data === "object" ? rows[0].data : {}),
    id: rows[0].id,
  };

  if (submission.status === "active") {
    return json(res, 400, { error: "Submission is already published" });
  }
  if (submission.submission_type === "termination_request") {
    return json(res, 400, { error: "Termination requests cannot be approved here" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const actorEmail = String((gate as any).session?.user?.email || "").trim();

  await pool.query(
    `UPDATE base44.property_submission
     SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
         updated_date = NOW()
     WHERE id = $1`,
    [
      rows[0].id,
      JSON.stringify({
        status: "active",
        reviewed_by: actorEmail || submission.reviewed_by || null,
        approved_date: today,
        updated_date: new Date().toISOString(),
      }),
    ]
  );

  // Partner notification (dedup) — no license creation
  const dedupKey = `${rows[0].id}__approved`;
  const { rows: existingNotifs } = await pool.query(
    `SELECT id FROM base44.portal_notification WHERE data->>'dedup_key' = $1 LIMIT 1`,
    [dedupKey]
  );
  if (!existingNotifs[0] && submission.partner_email) {
    const notifId = newId();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO base44.portal_notification (id, created_date, updated_date, created_by, created_by_id, is_sample, data, imported_at)
       VALUES ($1, NOW(), NOW(), $2, NULL, false, $3::jsonb, NOW())`,
      [
        notifId,
        actorEmail || null,
        JSON.stringify({
          id: notifId,
          recipient_email: submission.partner_email,
          recipient_role: "partner",
          type: "approved",
          title: "Your Property Has Been Published! 🎉",
          message: `Congratulations! "${submission.property_name}" has been approved and published to The 100 Collection. Our licensing team will be in touch shortly.`,
          submission_id: rows[0].id,
          property_name: submission.property_name,
          is_read: false,
          dedup_key: dedupKey,
          link: `/admin/hub?tab=submissions&submissionId=${rows[0].id}`,
          created_date: now,
        }),
      ]
    );
  }

  return json(res, 200, {
    ok: true,
    property_id: submission.source_property_id || null,
  });
}
