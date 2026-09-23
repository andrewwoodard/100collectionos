import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Creates a tagged PartnerApplication "stub" the moment a visitor completes
// signup via /signup?redirect=vrm|homeowner, so admins see the lead in the
// dashboard immediately — before the applicant fills out the full form. The
// full /apply form submission later enriches this same record (see
// submitPartnerApplication's signup-stub merge) instead of creating a
// duplicate, so each signup produces a single tagged application.

const SEGMENT_MAP = {
  vrm: {
    applicant_type: 'property_manager',
    experiment_segment: 'property_manager',
    source: 'signup_vrm',
    source_label: 'Signup — VRM',
  },
  homeowner: {
    applicant_type: 'property_owner',
    experiment_segment: 'homeowner',
    source: 'signup_homeowner',
    source_label: 'Signup — Homeowner',
  },
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const segment = String(body?.segment || '').trim();
    const map = SEGMENT_MAP[segment];
    if (!map) return Response.json({ error: 'Invalid segment' }, { status: 400 });

    const email = String(user.email).trim().toLowerCase();

    // Idempotency: never create a second signup stub for the same email.
    try {
      const existing = await svc.entities.PartnerApplication.filter({ email });
      const stub = existing.find((a) => a.source === 'signup_vrm' || a.source === 'signup_homeowner');
      if (stub) return Response.json({ ok: true, id: stub.id, existed: true });
    } catch (e) {
      console.log('signup stub lookup failed:', e.message);
    }

    const created = await svc.entities.PartnerApplication.create({
      full_name: user.full_name || '',
      email,
      applicant_type: map.applicant_type,
      experiment_segment: map.experiment_segment,
      source: map.source,
      source_label: map.source_label,
      status: 'pending',
    });

    // The PartnerApplication afterCreate automation notifies admins by email.
    return Response.json({ ok: true, id: created.id, existed: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}