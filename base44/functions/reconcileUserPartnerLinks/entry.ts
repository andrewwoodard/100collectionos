import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Reconcile User ↔ Partner linkage by email match.
//
// Closes the gap where a partner signs up directly (instead of via an invitation
// link) and ends up stranded on /portal/pending because their User was never
// added to the Partner's portal_user_ids. When a Partner exists whose
// primary_contact_email matches the user's email, the user is linked to that
// Partner and promoted to role='partner', partner_role='owner'.
//
// Idempotent: skips users already present in portal_user_ids.
//
// Modes:
//   { mode: 'me' }        — reconcile the authenticated user (called from the portal client)
//   { user_id, email }    — reconcile a specific user (called from the app_user_auth workflow)
//   { mode: 'all' }       — iterate all non-admin users (admin-only safety net)

async function reconcileUser(base44, user) {
  if (!user || !user.email) return { linked: false, reason: 'no email' };
  if (user.role === 'admin') return { linked: false, reason: 'admin skipped' };

  const email = String(user.email).trim().toLowerCase();

  let partners = [];
  try {
    partners = await base44.asServiceRole.entities.Partner.filter({ primary_contact_email: user.email });
  } catch (_) { partners = []; }
  // Case-insensitive fallback (emails are not case-sensitive)
  if (!partners || partners.length === 0) {
    try {
      const all = await base44.asServiceRole.entities.Partner.list('-created_date', 1000);
      partners = (all || []).filter(p => p.primary_contact_email && String(p.primary_contact_email).trim().toLowerCase() === email);
    } catch (_) { partners = []; }
  }
  if (!partners || partners.length === 0) return { linked: false, reason: 'no matching partner' };

  let linkedAny = false;
  for (const partner of partners) {
    const ids = Array.isArray(partner.portal_user_ids) && partner.portal_user_ids.length > 0
      ? [...partner.portal_user_ids]
      : (partner.portal_user_id ? [partner.portal_user_id] : []);
    if (ids.includes(user.id)) { linkedAny = true; continue; }
    ids.push(user.id);
    const patch = { portal_user_ids: ids };
    if (!partner.portal_user_id) patch.portal_user_id = user.id;
    try {
      await base44.asServiceRole.entities.Partner.update(partner.id, patch);
      linkedAny = true;
    } catch (e) {
      console.warn('[reconcileUserPartnerLinks] Partner update failed:', partner.id, e?.message);
    }
  }

  // Promote the User to partner role + owner sub-role if not already set.
  if (linkedAny) {
    const patch = {};
    if (user.role !== 'partner' && user.role !== 'admin') patch.role = 'partner';
    if (!user.partner_role) patch.partner_role = 'owner';
    if (Object.keys(patch).length > 0) {
      try {
        await base44.asServiceRole.entities.User.update(user.id, patch);
      } catch (e) {
        console.warn('[reconcileUserPartnerLinks] User role promotion failed:', user.id, e?.message);
      }
    }
  }

  return { linked: linkedAny, partner_count: partners.length };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // mode: 'me' — authenticated user (portal client)
    if (body.mode === 'me') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const result = await reconcileUser(base44, user);
      return Response.json({ ok: true, mode: 'me', ...result });
    }

    // specific user by id+email (app_user_auth workflow) — service-role, no user auth required
    if (body.user_id && body.email) {
      let user = null;
      try { user = await base44.asServiceRole.entities.User.get(body.user_id); } catch (_) {}
      if (!user) user = { id: body.user_id, email: body.email };
      const result = await reconcileUser(base44, user);
      return Response.json({ ok: true, mode: 'user', ...result });
    }

    // mode: 'all' — admin-only bulk safety net
    if (body.mode === 'all') {
      const caller = await base44.auth.me();
      if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (caller.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      const users = await base44.asServiceRole.entities.User.list('-created_date', 500);
      const results = [];
      let linkedCount = 0;
      for (const u of users) {
        const r = await reconcileUser(base44, u);
        results.push({ id: u.id, email: u.email, ...r });
        if (r.linked) linkedCount++;
      }
      return Response.json({ ok: true, mode: 'all', total: users.length, linked: linkedCount, results });
    }

    return Response.json({ error: 'Provide mode:"me", mode:"all", or {user_id, email}.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}