import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// One-time backfill: for every Partner that has portal_user_id set but
// portal_user_ids is empty/missing, populate portal_user_ids = [portal_user_id].
// Idempotent — only writes if portal_user_ids is empty or missing.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const partners = await base44.asServiceRole.entities.Partner.list('-created_date', 1000);
    let updated = 0;
    let skipped = 0;

    for (const p of partners) {
      const hasIds = Array.isArray(p.portal_user_ids) && p.portal_user_ids.length > 0;
      if (hasIds) { skipped++; continue; }
      if (!p.portal_user_id) { skipped++; continue; }

      await base44.asServiceRole.entities.Partner.update(p.id, {
        portal_user_ids: [p.portal_user_id],
      });
      updated++;
    }

    return Response.json({ ok: true, updated, skipped, total: partners.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});