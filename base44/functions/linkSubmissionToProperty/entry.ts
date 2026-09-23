/**
 * linkSubmissionToProperty
 *
 * Ensures a submitted property exists in the Properties entity AND is tied to
 * the correct Partner. Unlike approvePropertySubmission, this does NOT publish
 * the submission, create a license, or notify the partner — it's a lightweight
 * inventory-linking action for admins.
 *
 * - If the submission already has a source_property_id, ensures that Property's
 *   partner_id / partner_name are set (re-links if missing).
 * - Otherwise creates a new Property record (draft status) from the submission
 *   data and stamps source_property_id back on the submission.
 * - Resolves the partner from submission.partner_id, or by matching
 *   partner_email against Partner.primary_contact_email as a fallback.
 *
 * Payload: { submissionId: string }
 * Admin only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildPropertyData } from "../../shared/propertyMapping.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { submissionId } = body;
    if (!submissionId) return Response.json({ error: 'submissionId required' }, { status: 400 });

    let submission = null;
    try {
      const submissions = await base44.asServiceRole.entities.PropertySubmission.filter({ id: submissionId });
      submission = submissions?.[0] || null;
    } catch (_) { /* invalid id → not found */ }
    if (!submission) return Response.json({ error: 'Submission not found' }, { status: 404 });

    // Resolve the Partner. Prefer the submission's partner_id; fall back to an
    // email match so orphaned homeowner submissions can still be linked.
    let partnerId = submission.partner_id || null;
    let partnerName = submission.partner_name || null;
    if (!partnerId && submission.partner_email) {
      try {
        const matches = await base44.asServiceRole.entities.Partner.filter({ primary_contact_email: submission.partner_email });
        if (matches?.[0]) {
          partnerId = matches[0].id;
          partnerName = matches[0].partner_name || partnerName;
        }
      } catch (_) {}
    }

    // CASE 1: submission already linked to a Property — just ensure the link.
    if (submission.source_property_id) {
      const propertyId = submission.source_property_id;
      try {
        const existing = await base44.asServiceRole.entities.Property.filter({ id: propertyId });
        const prop = existing?.[0];
        if (prop) {
          const patch = {};
          if (partnerId && prop.partner_id !== partnerId) patch.partner_id = partnerId;
          if (partnerName && prop.partner_name !== partnerName) patch.partner_name = partnerName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.Property.update(propertyId, patch);
          }
          return Response.json({ ok: true, property_id: propertyId, created: false, partner_id: partnerId });
        }
      } catch (e) {
        // fall through to create if the linked Property can't be read
        console.warn('[linkSubmissionToProperty] Linked Property lookup failed, will recreate:', e?.message);
      }
    }

    // CASE 2: create a new Property record (draft — not published).
    const propertyData = buildPropertyData({ ...submission, reviewed_by: user.email }, { source: "link" });
    // Override to draft so it lands in inventory without going live.
    propertyData.status = 'draft';
    propertyData.onboarding_status = 'in_progress';
    propertyData.photography_status = submission.photo_urls?.length ? 'completed' : 'not_started';
    propertyData.portal_visible = false;
    propertyData.partner_id = partnerId;
    propertyData.partner_name = partnerName;

    const newProperty = await base44.asServiceRole.entities.Property.create(propertyData);
    const propertyId = newProperty.id;

    // Stamp the link back on the submission.
    await base44.asServiceRole.entities.PropertySubmission.update(submissionId, { source_property_id: propertyId });

    // Audit entry (non-fatal)
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: user.email,
        actor_role: 'admin',
        action: 'Linked submission to Property',
        entity_type: 'PropertySubmission',
        entity_id: submissionId,
        property_name: submission.property_name,
        partner_name: partnerName,
        details: `Created Property ${propertyId} (draft) and tied to partner ${partnerName || '—'}.`,
      });
    } catch (_) {}

    return Response.json({ ok: true, property_id: propertyId, created: true, partner_id: partnerId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}