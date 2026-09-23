import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { canonicalGmail } from '../../shared/spamDetection.ts';

// Bulk hard-delete of spam-signaled PartnerApplications. Runs the full
// spam-signal + preservation classification, logs each deletion to AuditEntry
// (actor = the admin who invoked it), hard-deletes the application, and
// cascades PortalNotification records that reference it.
//
// Body:
//   { dry_run?: boolean }
// dry_run=true returns the candidate + delete-preview lists without deleting.
//
// Admin-only: non-admins get 403.

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
  'mac.com', 'protonmail.com', 'proton.me', 'zoho.com', 'mail.com',
  'yandex.com', 'gmx.com',
]);

const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const KEEP_PHRASES = ['keep', 'real', 'manual review'];
// Explicitly preserved — a real applicant the admin flagged to never sweep.
const PRESERVE_IDS = new Set(['6a95e42b1563eab8cb61ff25']); // Donielle Fish

function consonantRatio(w) {
  const chars = w.toLowerCase().replace(/[^a-z]/g, '');
  if (chars.length === 0) return 0;
  let c = 0;
  for (const ch of chars) if (CONSONANTS.includes(ch)) c++;
  return c / chars.length;
}

function toWords(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function isGmailDotTrick(email) {
  const lower = String(email || '').toLowerCase().trim();
  const m = lower.match(/^([^@]+)@(gmail\.com|googlemail\.com)$/);
  if (!m) return false;
  const base = m[1].replace(/\+.*$/, '');
  return (base.match(/\./g) || []).length >= 3;
}

function isLegitProse(s) {
  const t = String(s || '').trim();
  if (t.length < 50) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  // Gibberish messages are random letters with no spaces structure; real
  // prose has vowels spread through it and few long consonant runs.
  return !/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(t);
}

function spamSignals(a, canonCounts) {
  const sigs = [];
  if (a.spam_score != null && a.spam_score >= 0.5) sigs.push('spam_score');
  if (isGmailDotTrick(a.email)) sigs.push('gmail_dot_trick');
  const nameWords = toWords(a.full_name);
  if (nameWords.some((w) => w.length >= 4 && consonantRatio(w) > 0.75)) sigs.push('name_consonant');
  const coWords = toWords(a.company_name);
  if (coWords.some((w) => w.length >= 4 && consonantRatio(w) > 0.75)) sigs.push('company_consonant');
  const notes = String(a.admin_notes || '').toLowerCase();
  if (/spam|bot/i.test(notes)) sigs.push('notes_spam_bot');
  const c = canonicalGmail(a.email);
  if (c && (canonCounts[c] || 0) >= 2) sigs.push('canonical_gmail_2plus');
  return sigs;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    // Load applications, partners, and users for classification + preservation.
    const apps = await svc.entities.PartnerApplication.list('-created_date', 500);
    const partners = await svc.entities.Partner.list('-created_date', 500);
    const users = await svc.entities.User.list();

    // Preservation sets.
    const userEmails = new Set(users.map((u) => (u.email || '').toLowerCase().trim()).filter(Boolean));
    const partnerEmailExact = new Set();
    const partnerDomains = new Set();
    for (const p of partners) {
      const e = (p.primary_contact_email || '').toLowerCase().trim();
      if (!e) continue;
      partnerEmailExact.add(e);
      const d = e.split('@')[1];
      if (d && !FREEMAIL.has(d)) partnerDomains.add(d);
    }

    // Canonical gmail repeat counts across the whole batch.
    const canonCounts = {};
    for (const a of apps) {
      const c = canonicalGmail(a.email);
      if (c) canonCounts[c] = (canonCounts[c] || 0) + 1;
    }

    const targetStatuses = new Set(['rejected', 'spam_review', 'pending']);
    const candidates = [];
    for (const a of apps) {
      if (PRESERVE_IDS.has(a.id)) continue;
      const notes = String(a.admin_notes || '').toLowerCase();
      if (KEEP_PHRASES.some((p) => notes.includes(p))) continue;
      if (!targetStatuses.has(a.status)) continue;
      const sigs = spamSignals(a, canonCounts);
      if (sigs.length === 0) continue;
      candidates.push({ app: a, signals: sigs });
    }

    const preserved = [];
    const toDelete = [];
    for (const { app, signals } of candidates) {
      const email = (app.email || '').toLowerCase().trim();
      const domain = email.split('@')[1] || '';
      if (partnerEmailExact.has(email)) { preserved.push({ id: app.id, name: app.full_name, why: 'partner_email_exact' }); continue; }
      if (domain && !FREEMAIL.has(domain) && partnerDomains.has(domain)) { preserved.push({ id: app.id, name: app.full_name, why: 'partner_domain', domain }); continue; }
      if (userEmails.has(email)) { preserved.push({ id: app.id, name: app.full_name, why: 'existing_user' }); continue; }
      if (isLegitProse(app.message)) { preserved.push({ id: app.id, name: app.full_name, why: 'legit_prose' }); continue; }
      toDelete.push({ app, signals });
    }

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        scanned: apps.length,
        candidate_count: candidates.length,
        preserved_count: preserved.length,
        delete_count: toDelete.length,
        preserved_preview: preserved.slice(0, 25),
        delete_preview: toDelete.map(({ app, signals }) => ({
          id: app.id,
          full_name: app.full_name,
          company_name: app.company_name,
          email: app.email,
          status: app.status,
          spam_score: app.spam_score,
          created_date: app.created_date,
          signals,
        })),
      });
    }

    // Real run — audit + delete + cascade notifications.
    let deleted = 0;
    let notificationsCascaded = 0;
    const errors = [];
    for (const { app, signals } of toDelete) {
      const snapshot = {
        id: app.id,
        full_name: app.full_name,
        company_name: app.company_name,
        email: app.email,
        phone: app.phone,
        status: app.status,
        spam_score: app.spam_score,
        applicant_type: app.applicant_type,
        created_date: app.created_date,
        message: app.message,
        admin_notes: app.admin_notes,
        signals,
      };
      try {
        await svc.entities.AuditEntry.create({
          actor_email: user.email,
          actor_role: 'admin',
          action: 'spam_hard_delete',
          entity_type: 'PartnerApplication',
          entity_id: app.id,
          target_name: app.full_name,
          details: `Hard-deleted spam application. Signals: ${signals.join(', ')}. Actor user id: ${user.id}. Snapshot: ${JSON.stringify(snapshot)}`,
        });
      } catch (e) {
        console.log('AuditEntry create failed:', e.message);
      }
      try {
        // Cascade: delete in-app notifications referencing this application.
        const notifs = await svc.entities.PortalNotification.filter({ submission_id: app.id });
        for (const n of notifs) {
          try { await svc.entities.PortalNotification.delete(n.id); notificationsCascaded++; } catch (_) {}
        }
      } catch (e) {
        console.log('PortalNotification cascade failed:', e.message);
      }
      try {
        await svc.entities.PartnerApplication.delete(app.id);
        deleted++;
      } catch (e) {
        errors.push({ id: app.id, error: e.message });
      }
    }

    return Response.json({
      ok: true,
      dry_run: false,
      scanned: apps.length,
      candidate_count: candidates.length,
      preserved_count: preserved.length,
      deleted,
      notifications_cascaded: notificationsCascaded,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}