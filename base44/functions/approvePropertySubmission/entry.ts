/**
 * approvePropertySubmission
 *
 * Publishes a single pending PropertySubmission: marks it active, creates the
 * Property record (if not already linked), creates a LicenseRecord, notifies the
 * partner, syncs to Supabase, and writes an audit entry. Mirrors the publish
 * branch of AdminReview.changeStatus("active") so the Admin Applications page
 * can approve property submissions with the same effect as the review screen.
 *
 * Payload: { submissionId: string }
 * Admin only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildPropertyData, buildPropertyEditPatch } from "../../shared/propertyMapping.ts";

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
    } catch (_) { /* invalid id → treat as not found */ }
    if (!submission) return Response.json({ error: 'Submission not found' }, { status: 404 });
    if (submission.status === 'active') return Response.json({ error: 'Submission is already published' }, { status: 400 });
    if (submission.submission_type === 'termination_request') return Response.json({ error: 'Termination requests cannot be approved here' }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);

    // 1. Mark submission active
    await base44.asServiceRole.entities.PropertySubmission.update(submissionId, {
      status: 'active',
      reviewed_by: user.email,
      approved_date: today,
    });

    // 2. Partner notification (dedup)
    const dedupKey = `${submissionId}__approved`;
    const existing = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
    let shouldSendEmail = false;
    if (!existing || existing.length === 0) {
      shouldSendEmail = true;
      await base44.asServiceRole.entities.PortalNotification.create({
        recipient_email: submission.partner_email,
        recipient_role: 'partner',
        type: 'approved',
        title: 'Your Property Has Been Published! 🎉',
        message: `Congratulations! "${submission.property_name}" has been approved and published to The 100 Collection. Our licensing team will be in touch shortly.`,
        submission_id: submissionId,
        property_name: submission.property_name,
        is_read: false,
        dedup_key: dedupKey,
        link: `/admin/hub?tab=submissions&submissionId=${submissionId}`,
      });
    }

    // 3. Sync status to Supabase (non-fatal)
    if (submission.supabase_property_id) {
      base44.functions.invoke('syncPropertyToSupabase', {
        action: 'update',
        id: submission.supabase_property_id,
        data: { ...submission, status: 'active' },
      }).catch(e => console.warn('[approvePropertySubmission] Supabase status sync failed (non-fatal):', e?.message));
    }

    // 3b. For EDIT submissions, apply the approved field + imagery changes to
    // the existing Property (portal source of truth), then push the updated
    // imagery to Supabase (propertiesbase44 — the public site table).
    if (submission.submission_type === 'edit' && submission.source_property_id) {
      try {
        const patch = buildPropertyEditPatch(submission);
        await base44.asServiceRole.entities.Property.update(submission.source_property_id, patch);
        base44.functions.invoke('syncPropertyToSupabase', { action: 'sync_property', id: submission.source_property_id })
          .catch(e => console.warn('[approvePropertySubmission] post-edit Supabase imagery sync failed (non-fatal):', e?.message));
      } catch (e) {
        console.warn('[approvePropertySubmission] Property edit apply failed (non-fatal):', e?.message);
      }
    }

    // 4. Create Property record if not already linked
    let propertyId = submission.source_property_id || null;
    if (!propertyId) {
      try {
        const propertyData = buildPropertyData({ ...submission, reviewed_by: user.email, approved_date: today });
        const newProperty = await base44.asServiceRole.entities.Property.create(propertyData);
        propertyId = newProperty.id;
        await base44.asServiceRole.entities.PropertySubmission.update(submissionId, { source_property_id: propertyId });
        try {
          const syncRes = await base44.functions.invoke('syncPropertyToSupabase', { action: 'sync_property', id: newProperty.id });
          const sbId = syncRes?.data?.property?.id || syncRes?.property?.id;
          if (sbId && String(sbId) !== 'null' && String(sbId) !== 'undefined') {
            await base44.asServiceRole.entities.PropertySubmission.update(submissionId, { supabase_property_id: String(sbId) });
          }
        } catch (e) {
          console.warn('[approvePropertySubmission] Supabase sync for new Property failed (non-fatal):', e?.message);
        }
      } catch (e) {
        console.warn('[approvePropertySubmission] Property creation failed (non-fatal):', e?.message);
      }
    }

    // 5. Create LicenseRecord
    const BASE_FEE = 495.00;
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');
    const licenseNumber = `100C-${year}-${rand}`;

    let discountPercent = 0;
    let discountLabel = null;
    if (submission.partner_id) {
      try {
        const partners = await base44.asServiceRole.entities.Partner.filter({ id: submission.partner_id });
        const p = partners?.[0];
        if (p) { discountPercent = p.discount_percent || 0; discountLabel = p.discount_label || null; }
      } catch (_) {}
    }
    const annualFee = Math.round(BASE_FEE * (1 - discountPercent / 100) * 100) / 100;
    const isDeal = !!(discountLabel && discountLabel !== 'No Discount');
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      await base44.asServiceRole.entities.LicenseRecord.create({
        submission_id: submissionId,
        partner_id: submission.partner_id,
        partner_name: submission.partner_name,
        property_name: submission.property_name,
        property_id: propertyId,
        license_number: licenseNumber,
        license_status: 'active',
        payment_status: 'invoiced',
        base_fee: BASE_FEE,
        discount_applied_percent: discountPercent,
        discount_applied_label: discountLabel,
        annual_fee: annualFee,
        is_deal: isDeal,
        deal_notes: isDeal ? discountLabel : null,
        license_start_date: today,
        license_end_date: endDate,
        invoice_date: today,
      });
    } catch (e) {
      console.warn('[approvePropertySubmission] LicenseRecord creation failed (non-fatal):', e?.message);
    }

    // 6. Sync partner to Supabase (non-fatal)
    if (submission.partner_id) {
      try {
        const partners = await base44.asServiceRole.entities.Partner.filter({ id: submission.partner_id });
        const partner = partners?.[0];
        if (partner) {
          base44.functions.invoke('syncPartnerToSupabase', {
            partnerId: partner.id,
            partnerEmail: partner.primary_contact_email || submission.partner_email || '',
          }).catch(e => console.warn('[approvePropertySubmission] Supabase partner sync failed (non-fatal):', e?.message));
        }
      } catch (_) {}
    }

    // 7. Send partner email after property creation
    if (shouldSendEmail) {
      base44.functions.invoke('sendPropertyEmail', {
        type: 'status_change', submissionId, newStatus: 'active', propertyId,
      }).catch(e => console.warn('[approvePropertySubmission] Email send failed (non-fatal):', e?.message));
    }

    // 8. Audit entry
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: user.email,
        actor_role: 'admin',
        action: 'Status changed to active',
        entity_type: 'PropertySubmission',
        entity_id: submissionId,
        property_name: submission.property_name,
        partner_name: submission.partner_name,
      });
    } catch (_) {}

    return Response.json({ ok: true, property_id: propertyId, license_number: licenseNumber });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}