// One-shot surgical purge — Buck approved 2026-09-18 batch of 36 Gmail
// dot-trick spam Base44 native Users. Hardcoded list only: no scoring, no
// broader sweep.
//
// Safety: each email is checked against guardrails before delete; any failure
// skips that email (never the whole batch). Cascade cleans up the matching
// PortalAccessRequest + PortalNotification rows. Every deletion is recorded
// to AuditEntry with a full pre-delete snapshot. A one-shot gate (AppConfig
// key) prevents accidental re-fire once the batch has run.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const BATCH_MARKER = 'Gmail dot-trick spam purge — Buck approved 2026-09-18 batch of 36';
const ACTOR_ID = '69aee092656fb9813439389c';
const ACTOR_EMAIL_FALLBACK = 'buck@theonehundredcollection.com';
const CONFIG_KEY = 'spam_purge_36_completed';

// Exactly the 36 Buck approved — nothing else.
const BATCH_EMAILS = [
  'jw.ang.9.3.6.4@gmail.com',
  'cwjo.hn.s.o.n36.0@gmail.com',
  'c.h.ri.st.i.a.nl.o.ngshor.e75.0@gmail.com',
  'sdchern@aol.com',
  'm.sy.ukr.i8.8.1@gmail.com',
  'm.i.c.h.a.e.l.j.oh.n.s.on.0@gmail.com',
  're.dmo.u.nt.a.i.n.p.e.do@gmail.com',
  'kimh.o.r.ne2.2@gmail.com',
  'j.afarr.g.rav.e.s@gmail.com',
  'v.van.de.sand.e95@gmail.com',
  'eyoy.i.b.e.gov.45@gmail.com',
  'lk.arn.au.ch@gmail.com',
  't.u.vo.j.a.to7.3@gmail.com',
  'mhnat.i.v.gma@gmail.com',
  'b.be.an7.74@gmail.com',
  'f.la.me.tecl.l.c@gmail.com',
  'd.e.v.onw.o.l.te.r.0.1@gmail.com',
  'srw.n.i.e.mi@gmail.com',
  'j.acka.s.hattuck@gmail.com',
  'gary.tay.lo.rx.xx@gmail.com',
  'b.ow.o.w.ala.104@gmail.com',
  'jun.iorp.erugi.a.s.sd@gmail.com',
  's.jg.e.nco@gmail.com',
  'jo.hn.lambr.o.s@gmail.com',
  'kyle.m.abe.64@gmail.com',
  'sr.m.7.556@gmail.com',
  'jul.i.ak.zi.ck@gmail.com',
  'rob.e.r.t.pa.b.on3@gmail.com',
  'b.r.u.n.dle.333.09@gmail.com',
  'ma.r.i.o.1.23mon.t.ero@gmail.com',
  'de.bc2.0.7@gmail.com',
  'j.o.rdan.do.n.a.h.oo@gmail.com',
  'l.u.is.a.da.m.s0.4@gmail.com',
  'ax.e.lberu.me.n@gmail.com',
  'j.l.i.a.ng.7797@gmail.com',
  'q.u.ickc.o.n.s.ignme.nt8.0.2@gmail.com',
];

const ADMIN_ALLOWLIST = [
  'buck@theonehundredcollection.com',
  'buck@seamountainvacations.com',
  'andrew@bluecedarpartners.com',
  'andrew@the100collection.com',
  'paige@theonehundredcollection.com',
  'brittany@theonehundredcollection.com',
  'meghan@theonehundredcollection.com',
  'hello@theonehundredcollection.com',
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const force = body?.force === true;

    const svc = base44.asServiceRole;

    // One-shot gate — refuse to re-run once completed (unless force=true).
    let alreadyRun = null;
    try {
      const cfg = await svc.entities.AppConfig.filter({ key: CONFIG_KEY });
      alreadyRun = cfg && cfg[0] ? cfg[0] : null;
    } catch (_) { /* non-fatal */ }
    if (alreadyRun && !force) {
      return Response.json({
        ok: false,
        blocked: true,
        message: 'Purge already completed — one-shot gate active. Pass force:true to override (admin only).',
        completed_at: alreadyRun.value,
      });
    }

    // Resolve the actor (Buck). Service-role fallback when invoked without a user.
    let actorEmail = ACTOR_EMAIL_FALLBACK;
    try {
      const me = await base44.auth.me();
      if (me && me.id) {
        actorEmail = me.email || ACTOR_EMAIL_FALLBACK;
        if (me.role !== 'admin') {
          return Response.json({ error: 'Admin access required' }, { status: 403 });
        }
      }
    } catch (_) { /* no user — assume system-initiated */ }

    // Load all supporting records once.
    const [users, invitations, partners, applications, accessRequests, notifications] = await Promise.all([
      svc.entities.User.list('-created_date', 500),
      svc.entities.PartnerInvitation.list('-created_date', 500),
      svc.entities.Partner.list('-created_date', 500),
      svc.entities.PartnerApplication.list('-created_date', 500),
      svc.entities.PortalAccessRequest.list('-created_date', 500),
      svc.entities.PortalNotification.list('-created_date', 500),
    ]);

    const partnerEmails = new Set(
      partners.map((p) => (p.primary_contact_email || '').toLowerCase().trim()).filter(Boolean)
    );
    const acceptedInvitationEmails = new Set(
      invitations.filter((i) => i.status === 'accepted' && i.email).map((i) => i.email.toLowerCase().trim())
    );

    const summary = {
      deleted: 0,
      skipped: [],
      cascade_access_requests: 0,
      cascade_notifications: 0,
      audit_entries_created: 0,
    };

    for (const email of BATCH_EMAILS) {
      const emailLc = email.toLowerCase();
      const user = users.find((u) => (u.email || '').toLowerCase().trim() === emailLc);

      // Guardrails — skip (not fail) on any violation.
      if (ADMIN_ALLOWLIST.includes(emailLc)) {
        summary.skipped.push({ email, reason: 'admin allowlist' });
        continue;
      }
      if (!user) {
        summary.skipped.push({ email, reason: 'user not found (already gone)' });
        continue;
      }
      if (user.role && user.role !== 'user') {
        summary.skipped.push({ email, reason: `role: ${user.role}` });
        continue;
      }
      if (user.is_verified) {
        summary.skipped.push({ email, reason: 'is_verified true' });
        continue;
      }
      if (acceptedInvitationEmails.has(emailLc)) {
        summary.skipped.push({ email, reason: 'accepted PartnerInvitation' });
        continue;
      }
      if (partnerEmails.has(emailLc)) {
        summary.skipped.push({ email, reason: 'Partner contact email' });
        continue;
      }
      const substantiveApp = applications.find(
        (a) => (a.email || '').toLowerCase().trim() === emailLc && ((a.message || '').trim().length > 50)
      );
      if (substantiveApp) {
        summary.skipped.push({ email, reason: 'substantive PartnerApplication (message > 50 chars)' });
        continue;
      }

      if (dryRun) {
        summary.deleted++;
        continue;
      }

      // Audit log with full pre-delete snapshot (before the delete so the trail
      // exists even if the delete itself fails).
      try {
        await svc.entities.AuditEntry.create({
          actor_email: actorEmail,
          actor_role: 'admin',
          action: 'spam_user_purged',
          entity_type: 'BaseUser',
          entity_id: user.id,
          target_name: user.email,
          details: `${BATCH_MARKER} | actor_id=${ACTOR_ID}`,
          old_value: JSON.stringify({
            id: user.id, email: user.email, full_name: user.full_name,
            role: user.role, is_verified: user.is_verified, created_date: user.created_date,
          }),
        });
        summary.audit_entries_created++;
      } catch (e) {
        summary.skipped.push({ email, reason: `audit create failed: ${e.message}` });
        continue;
      }

      // Cascade: PortalAccessRequest by email.
      const orphanReqs = accessRequests.filter(
        (r) => (r.email || '').toLowerCase().trim() === emailLc
      );
      for (const r of orphanReqs) {
        try { await svc.entities.PortalAccessRequest.delete(r.id); summary.cascade_access_requests++; }
        catch (_) { /* non-fatal */ }
      }

      // Cascade: PortalNotification by recipient_email.
      const notifs = notifications.filter(
        (n) => (n.recipient_email || '').toLowerCase().trim() === emailLc
      );
      for (const n of notifs) {
        try { await svc.entities.PortalNotification.delete(n.id); summary.cascade_notifications++; }
        catch (_) { /* non-fatal */ }
      }

      // Delete the user.
      try {
        await svc.entities.User.delete(user.id);
        summary.deleted++;
      } catch (e) {
        summary.skipped.push({ email, reason: `user delete failed: ${e.message}` });
      }
    }

    // Arm the one-shot gate on real execution only.
    if (!dryRun) {
      try {
        await svc.entities.AppConfig.create({
          key: CONFIG_KEY,
          value: new Date().toISOString(),
          updated_by: actorEmail,
        });
      } catch (_) { /* non-fatal — gate is best-effort */ }
    }

    const result = {
      ok: true,
      dry_run: dryRun,
      batch_size: BATCH_EMAILS.length,
      actor_email: actorEmail,
      ...summary,
    };

    console.log('[purgeBuckApprovedSpam36] SUMMARY:', JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}