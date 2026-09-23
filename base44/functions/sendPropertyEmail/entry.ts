import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Sends partner-facing transactional emails via DB-backed EmailTemplate.
// Called from AdminReview / approvePropertySubmission when status changes.
// Slugs: property-approved, property-needs-revision, property-rejected,
//        property-under-review, property-edit-approved, property-edit-rejected.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { type, submissionId, newStatus, propertyId } = body;

    if (type !== "status_change" || !submissionId) {
      return Response.json({ ok: true, skipped: "invalid request" });
    }

    const subs = await base44.asServiceRole.entities.PropertySubmission.filter({ id: submissionId });
    const sub = subs[0];
    if (!sub) {
      return Response.json({ error: "submission not found" }, { status: 404 });
    }

    const partnerEmail = sub.partner_email;
    if (!partnerEmail) {
      return Response.json({ ok: true, skipped: "no partner email" });
    }

    const propertyName = sub.property_name || "your property";
    const baseUrl = "https://theonehundredcollection.com/portal/properties";
    const portalUrl = propertyId ? `${baseUrl}/${propertyId}` : baseUrl;
    const locationFull = sub.location_full || [sub.location_city, sub.location_state].filter(Boolean).join(", ");
    const listingUrl = sub.listing_url || "";
    const partnerName = sub.partner_name || "";
    const reviewerName = sub.reviewed_by || "";
    const isGenericName = /^Untitled Property/i.test(propertyName);
    const displaySubject = isGenericName && locationFull ? `${locationFull} property` : propertyName;

    // Map status to template slug
    const slugMap = {
      active: 'property-approved',
      needs_revision: 'property-needs-revision',
      rejected: 'property-rejected',
      under_review: 'property-under-review',
      edit_approved: 'property-edit-approved',
      edit_rejected: 'property-edit-rejected',
    };
    const slug = slugMap[newStatus];
    if (!slug) {
      return Response.json({ ok: true, skipped: "no template for status" });
    }

    const context = {
      partner: {
        partner_name: partnerName,
        primary_contact_email: partnerEmail,
      },
      property: {
        property_name: displaySubject,
        location: locationFull,
        location_full: locationFull,
        listing_url: listingUrl,
        first_photo: (sub.photo_urls && sub.photo_urls[0]) || '',
      },
      submission: {
        partner_facing_message: sub.partner_facing_message || '',
        revision_message: sub.partner_facing_message || '',
      },
      reviewed_by: { name: reviewerName },
      portal_url: portalUrl,
    };

    const result = await sendTemplatedEmail(base44, slug, context, { to: partnerEmail });

    return Response.json({ ok: result.ok, skipped: result.skipped, error: result.error });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});