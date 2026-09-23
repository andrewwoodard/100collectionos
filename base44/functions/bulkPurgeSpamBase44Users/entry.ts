// One-shot + nightly cleanup of spam Base44 native App Users.
//
// Base44's native signup (Google/email) creates User records BEFORE our
// cold-signup intercept can run, so bots that hit the sign-in flow directly
// accumulate as "Never joined" users in the App Users panel. This function
// scores every native User with computeUserSpamScore, preserves every
// legitimate user via a layered safety net, and deletes the rest.
//
// Safety (a user is NEVER deleted if ANY preserve rule matches):
//   - role is anything other than the default 'user'
//   - is_verified === true (they actually engaged / signed in)
//   - email is on the admin allowlist
//   - email matches an active Partner's primary_contact_email
//   - email domain matches an active Partner's contact-email domain
//   - has an accepted PartnerInvitation for their email
//   - has a PortalAccessRequest that converted to an application
//   - has a reviewed PartnerApplication (approved/rejected/invited/interview)
//
// Every deletion is logged to AuditEntry (action: spam_user_purged) with a
// full pre-delete snapshot, and orphaned non-terminal PortalAccessRequest
// records for the same email are cleaned up too.
//
// Called from the admin /admin/base44-users page (user token → admin-gated)
// and from the nightly cron workflow (no user → service role).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { computeUserSpamScore } from '../../shared/spamDetection.ts';

const ADMIN_ALLOWLIST = [
  'buck@theonehundredcollection.com',
  'buck@seamountainvacations.com',
  'andrew@bluecedarpartners.com',
  'andrew@the100collection.com',
  'paige@the100collection.com',
  'brittany@theonehundredcollection.com',
];

const REVIEWED_APP_STATUSES = ['approved', 'rejected', 'invited', 'interview_invited'];
const DELETABLE_ACCESS_STATUSES = ['auto_routed', 'pending', 'spam_review'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const execute = body?.execute === true;
    const maxDelete = Math.min(Number(body?.max_delete) || 200, 500);

    // Auth: when a user token is present (admin page) require admin. When
    // absent (nightly cron) run as service role — consistent with the other
    // scheduled maintenance functions in this app.
    let actorEmail = 'system';
    let actorRole = 'system';
    try {
      const me = await base44.auth.me();
      if (me && me.id) {
        actorEmail = me.email || 'admin';
        actorRole = 'admin';
        if (me.role !== 'admin') {
          return Response.json({ error: 'Admin access required' }, { status: 403 });
        }
      }
    } catch (_) { /* no user — cron invocation */ }

    const svc = base44.asServiceRole;

    // Build preserve sets in parallel.
    const [partners, invitations, accessRequests, applications] = await Promise.all([
      svc.entities.Partner.list('-created_date', 500),
      svc.entities.PartnerInvitation.list('-created_date', 500),
      svc.entities.PortalAccessRequest.list('-created_date', 500),
      svc.entities.PartnerApplication.list('-created_date', 500),
    ]);

    const partnerEmails = new Set();
    const partnerDomains = new Set();
    for (const p of partners) {
      const pe = (p.primary_contact_email || '').toLowerCase().trim();
      if (pe) {
        partnerEmails.add(pe);
        const d = pe.split('@')[1];
        if (d) partnerDomains.add(d);
      }
    }
    const acceptedInvitationEmails = new Set(
      invitations.filter((i) => i.status === 'accepted' && i.email)
        .map((i) => i.email.toLowerCase().trim())
    );
    const convertedAccessEmails = new Set(
      accessRequests.filter((r) => r.status === 'converted_to_application' && r.email)
        .map((r) => r.email.toLowerCase().trim())
    );
    const reviewedAppEmails = new Set(
      applications.filter((a) => REVIEWED_APP_STATUSES.includes(a.status) && a.email)
        .map((a) => a.email.toLowerCase().trim())
    );

    const users = await svc.entities.User.list('-created_date', 500);

    const classified = users.map((u) => {
      const { score, reasons } = computeUserSpamScore({ email: u.email, full_name: u.full_name });
      const emailLc = (u.email || '').toLowerCase().trim();
      const domain = emailLc.split('@')[1] || '';
      let preserve = null;
      if (u.role && u.role !== 'user') preserve = `role: ${u.role}`;
      else if (u.is_verified) preserve = 'verified';
      else if (ADMIN_ALLOWLIST.includes(emailLc)) preserve = 'admin allowlist';
      else if (partnerEmails.has(emailLc)) preserve = 'active partner contact';
      else if (domain && partnerDomains.has(domain)) preserve = 'partner domain';
      else if (acceptedInvitationEmails.has(emailLc)) preserve = 'accepted invitation';
      else if (convertedAccessEmails.has(emailLc)) preserve = 'converted access request';
      else if (reviewedAppEmails.has(emailLc)) preserve = 'reviewed application';
      return {
        id: u.id, email: u.email, full_name: u.full_name, role: u.role,
        verified: u.is_verified, created_date: u.created_date,
        score, reasons, preserve,
      };
    });

    const candidates = classified.filter((c) => c.score >= 0.7 && !c.preserve);
    const preservedCount = classified.filter((c) => c.preserve).length;

    if (!execute) {
      return Response.json({
        total: users.length,
        flagged: candidates.length,
        preserved: preservedCount,
        deleted: 0,
        users: classified,
      });
    }

    const toDelete = candidates.slice(0, maxDelete);
    let deleted = 0;
    const deletedIds = [];
    const errors = [];

    for (const c of toDelete) {
      try {
        await svc.entities.AuditEntry.create({
          actor_email: actorEmail,
          actor_role: actorRole,
          action: 'spam_user_purged',
          entity_type: 'BaseUser',
          entity_id: c.id,
          target_name: c.email,
          details: JSON.stringify({
            email: c.email, full_name: c.full_name, role: c.role,
            score: c.score, reasons: c.reasons, created_date: c.created_date,
          }),
        });
        await svc.entities.User.delete(c.id);
        deleted++;
        deletedIds.push(c.id);

        // Clean up orphaned, non-terminal PortalAccessRequest records.
        const orphanReqs = accessRequests.filter(
          (r) => r.email && r.email.toLowerCase().trim() === (c.email || '').toLowerCase().trim()
            && DELETABLE_ACCESS_STATUSES.includes(r.status)
        );
        for (const r of orphanReqs) {
          try { await svc.entities.PortalAccessRequest.delete(r.id); } catch (_) { /* non-fatal */ }
        }
      } catch (e) {
        errors.push({ id: c.id, email: c.email, error: e.message });
      }
    }

    return Response.json({
      total: users.length,
      flagged: candidates.length,
      preserved: preservedCount,
      deleted,
      deletedIds,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}