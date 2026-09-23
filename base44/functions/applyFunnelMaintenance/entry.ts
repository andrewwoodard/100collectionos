import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Maintenance for the /apply funnel event store. Invoked by two scheduled
// workflows:
//   action 'purge' — delete events older than 90 days, EXCEPT 'submitted'
//     events (kept indefinitely for historical funnel comparisons).
//   action 'dedup' — mark sessions whose email also appears in an earlier
//     session as is_returning=true so the admin view can surface
//     "Returning visitor".

const PURGE_DAYS = 90;
const BATCH = 500;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let body: any;
    try { body = await req.json(); } catch (_) { body = {}; }
    const action = body?.action || 'purge';

    if (action === 'purge') {
      const cutoff = Date.now() - PURGE_DAYS * 24 * 60 * 60 * 1000;
      // Oldest first; a daily run keeps the working set small.
      const old = await base44.asServiceRole.entities.ApplyFunnelEvent.list('created_date', 5000);
      const toDelete = (old || [])
        .filter((e: any) => {
          const t = e.created_date ? new Date(e.created_date).getTime() : 0;
          return t > 0 && t < cutoff && e.event_type !== 'submitted';
        })
        .map((e: any) => e.id);
      let deleted = 0;
      for (let i = 0; i < toDelete.length; i += BATCH) {
        const ids = toDelete.slice(i, i + BATCH);
        try {
          await base44.asServiceRole.entities.ApplyFunnelEvent.deleteMany({ id: { $in: ids } });
          deleted += ids.length;
        } catch (e) {
          console.log(`[applyFunnelMaintenance] purge batch failed: ${(e as Error).message}`);
        }
      }
      console.log(`[applyFunnelMaintenance] purged ${deleted} events older than ${PURGE_DAYS} days`);
      return Response.json({ ok: true, action: 'purge', deleted, cutoff: new Date(cutoff).toISOString() });
    }

    if (action === 'dedup') {
      const all = await base44.asServiceRole.entities.ApplyFunnelEvent.list('-created_date', 5000);
      // Group distinct session_ids by the earliest captured email, ordered by
      // each session's first event time.
      const byEmail = new Map();
      for (const e of all || []) {
        const em = (e.email || '').toLowerCase().trim();
        if (!em) continue;
        if (!byEmail.has(em)) byEmail.set(em, []);
        byEmail.get(em).push(e);
      }
      let marked = 0;
      for (const [, evs] of byEmail) {
        // Distinct sessions, ordered by earliest event.
        const sessions = new Map();
        for (const e of evs) {
          const t = e.created_date ? new Date(e.created_date).getTime() : 0;
          if (!sessions.has(e.session_id) || t < sessions.get(e.session_id)) {
            sessions.set(e.session_id, t);
          }
        }
        const ordered = [...sessions.entries()].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
        // All but the earliest session are "returning".
        for (const sid of ordered.slice(1)) {
          try {
            await base44.asServiceRole.entities.ApplyFunnelEvent.updateMany({ session_id: sid }, { $set: { is_returning: true } });
            marked++;
          } catch (e) {
            console.log(`[applyFunnelMaintenance] dedup session ${sid} failed: ${(e as Error).message}`);
          }
        }
      }
      console.log(`[applyFunnelMaintenance] marked ${marked} returning sessions`);
      return Response.json({ ok: true, action: 'dedup', marked });
    }

    return Response.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error(`[applyFunnelMaintenance] Error: ${(error as Error).message}`);
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}