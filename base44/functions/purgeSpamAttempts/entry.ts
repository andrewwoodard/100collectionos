import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Scheduled daily (SpamAttempt purge automation): deletes spam-attempt logs
// older than 30 days so the monitoring trail stays lean.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await base44.asServiceRole.entities.SpamAttempt.deleteMany({
      created_date: { $lt: cutoff },
    });
    return Response.json({ ok: true, cutoff, result: res });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}