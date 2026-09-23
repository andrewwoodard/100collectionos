import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Fires a qualification decision webhook to Go High Level (GHL).
// Called non-blocking from AdminApplications approve/reject flows.
// If GHL_ENABLED is false or GHL_WEBHOOK_URL is unset, gracefully skips.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { applicationId, decision, is_test } = body;

    // Fetch GHL config from AppConfig
    const configRows = await base44.asServiceRole.entities.AppConfig.filter({
      key: { $in: ['GHL_WEBHOOK_URL', 'GHL_ENABLED'] },
    });
    const getConfig = (key) => configRows.find((c) => c.key === key)?.value || '';
    const webhookUrl = getConfig('GHL_WEBHOOK_URL');
    const enabled = getConfig('GHL_ENABLED') === 'true';

    if (!enabled) {
      console.log('[fireGhlWebhook] GHL is disabled, skipping');
      return Response.json({ ok: true, skipped: 'GHL disabled' });
    }

    if (!webhookUrl) {
      console.log('[fireGhlWebhook] No webhook URL configured, skipping');
      return Response.json({ ok: true, skipped: 'no webhook URL' });
    }

    let payload;

    if (is_test) {
      payload = {
        event: 'portal_qualification_decision',
        timestamp: new Date().toISOString(),
        decision: 'qualified',
        tag: 'qualified',
        contact: {
          first_name: 'Test',
          last_name: 'User',
          email: 'test@example.com',
          phone: '+15550000000',
        },
        application_id: 'test-app-001',
        partner_id: null,
        partner_name: 'Test Partner Co',
        is_multi_property: false,
        property_count: 1,
        property_addresses: ['https://vrbo.com/test'],
        reason: null,
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
        is_test: true,
      };
    } else {
      if (!applicationId) return Response.json({ error: 'applicationId required' }, { status: 400 });
      if (!['qualified', 'disqualified'].includes(decision)) {
        return Response.json({ error: 'decision must be "qualified" or "disqualified"' }, { status: 400 });
      }

      const application = await base44.asServiceRole.entities.PartnerApplication.get(applicationId);
      if (!application) return Response.json({ error: 'Application not found' }, { status: 404 });

      // Look up associated Partner
      let partner = null;
      try {
        const partners = await base44.asServiceRole.entities.Partner.filter({
          primary_contact_email: application.email,
        });
        partner = partners[0] || null;
      } catch (e) {
        console.log('[fireGhlWebhook] Partner lookup failed:', e.message);
      }

      const submittedProps = Array.isArray(application.submitted_properties) ? application.submitted_properties : [];
      const isMultiProperty = submittedProps.length > 1;
      const propertyCount = submittedProps.length;
      const listingUrls = submittedProps.map((p) => p.listing_url).filter(Boolean);

      const tag = decision === 'qualified'
        ? 'qualified'
        : isMultiProperty
          ? 'disqualified-multi-property'
          : 'disqualified-single-property';

      const nameParts = (application.full_name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      payload = {
        event: 'portal_qualification_decision',
        timestamp: new Date().toISOString(),
        decision,
        tag,
        contact: {
          first_name: firstName,
          last_name: lastName,
          email: application.email || '',
          phone: application.phone || '',
        },
        application_id: application.id,
        partner_id: partner?.id || null,
        partner_name: application.company_name || '',
        is_multi_property: isMultiProperty,
        property_count: propertyCount,
        property_addresses: listingUrls,
        reason: application.admin_notes || null,
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
      };
    }

    // POST to GHL with one retry on failure
    let statusCode = null;
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        statusCode = res.status;
        if (res.ok) {
          try {
            await base44.asServiceRole.entities.AuditEntry.create({
              actor_email: user.email,
              actor_role: 'admin',
              action: 'ghl_webhook_fired',
              entity_type: 'PartnerApplication',
              entity_id: payload.application_id,
              details: JSON.stringify({
                decision: payload.decision,
                tag: payload.tag,
                status_code: statusCode,
                is_test: !!is_test,
              }),
            });
          } catch (e) {
            console.warn('[fireGhlWebhook] AuditEntry failed:', e.message);
          }
          return Response.json({ ok: true, tag: payload.tag, status_code: statusCode });
        }
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        lastError = e.message;
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // All retries failed
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: user.email,
        actor_role: 'admin',
        action: 'ghl_webhook_failed',
        entity_type: 'PartnerApplication',
        entity_id: payload.application_id,
        details: JSON.stringify({
          decision: payload.decision,
          tag: payload.tag,
          error: lastError,
          is_test: !!is_test,
        }),
      });
    } catch (_) {}

    return Response.json({ ok: false, error: lastError, tag: payload.tag });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});