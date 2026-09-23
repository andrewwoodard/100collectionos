import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { executeTermination, lookupPartnerEmail } from '../../shared/offboarding.ts';

// Resolves a raw property id to the authoritative Base44 Property id.
// The portal URL may carry a Supabase numeric id (e.g. /portal/properties/1021)
// when the Base44 mirror row's supabase_property_id is missing or stale, so the
// frontend lookup falls back to the Supabase row id. Passing that straight to
// Property.update() throws a 500. This helper prevents that recurrence.
async function resolvePropertyId(base44, rawId) {
  if (!rawId) return null;
  try {
    const p = await base44.asServiceRole.entities.Property.get(rawId);
    if (p) return p.id;
  } catch {}
  try {
    const matches = await base44.asServiceRole.entities.Property.filter({ supabase_property_id: String(rawId) });
    if (matches && matches[0]) return matches[0].id;
  } catch {}
  return null;
}

// Manages all property offboarding actions.
// Partner self-serve: take_offline, bring_online, schedule, cancel_scheduled, request_termination
// Admin only: approve_termination, reject_termination, force_terminate

export default async function(req) {
  let body = null;
  let user = null;
  try {
    const base44 = createClientFromRequest(req);
    user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    body = await req.json();
    const { action } = body;

    // Admin-only actions
    const adminActions = ['approve_termination', 'reject_termination', 'force_terminate'];
    if (adminActions.includes(action) && user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    switch (action) {

      // ─── Partner self-serve: take offline temporarily ───
      case 'take_offline': {
        const { propertyId, reason } = body;
        if (!propertyId) return Response.json({ error: 'propertyId required' }, { status: 400 });
        const resolvedId = await resolvePropertyId(base44, propertyId);
        if (!resolvedId) {
          console.warn('[manageOffboarding] take_offline FAILED: property not resolvable', { propertyId, actor: user.email });
          return Response.json({ error: `Property not found (id=${propertyId}). It may not be synced yet. Refresh the page or contact support.` }, { status: 400 });
        }
        console.log('[manageOffboarding] take_offline START', { propertyId, resolvedId, actor: user.email, ts: new Date().toISOString() });
        const now = new Date().toISOString();

        await base44.asServiceRole.entities.Property.update(resolvedId, {
          offboarding_status: 'temporary_offline',
          offboarding_reason: reason || '',
          offboarding_initiated_by: user.email,
          offboarding_initiated_at: now,
          offboarding_approved_by: null,
          offboarding_approved_at: null,
          termination_date: null,
        });

        // Depublish on Supabase (non-fatal — Base44 is the source of truth)
        try { await base44.functions.invoke('syncPropertyToSupabase', { action: 'sync_property', id: resolvedId }); }
        catch (e) { console.warn('[manageOffboarding] take_offline Supabase sync failed (non-fatal):', e?.message); }

        const prop = await base44.asServiceRole.entities.Property.get(resolvedId);

        // Admin notification
        try {
          await base44.functions.invoke('sendAdminNotification', {
            eventType: 'property_taken_offline',
            urgency: 'warning',
            headline: `Property taken offline: ${prop.property_name}`,
            subheadline: `Partner: ${prop.partner_name || 'Unknown'}`,
            contextBlock: reason || 'No reason provided.',
            ctaLabel: 'View Property',
            ctaUrl: `https://100c-os.base44.app/PropertyDetail?id=${resolvedId}`,
            portalNotification: {
              type: 'general',
              title: `Property taken offline: ${prop.property_name}`,
              message: `${prop.partner_name || 'Unknown'} took this property offline temporarily.`,
              propertyName: prop.property_name,
              partnerName: prop.partner_name,
            },
          });
        } catch {}

        await base44.asServiceRole.entities.AuditEntry.create({
          actor_email: user.email, actor_role: 'partner', action: 'property_taken_offline',
          entity_type: 'Property', entity_id: resolvedId, target_name: prop.property_name,
          partner_name: prop.partner_name, details: reason || 'Taken offline temporarily',
        }).catch(() => {});

        console.log('[manageOffboarding] take_offline OK', { resolvedId, actor: user.email });
        return Response.json({ ok: true, offboarding_status: 'temporary_offline' });
      }

      // ─── Partner self-serve: bring back online ───
      case 'bring_online': {
        const { propertyId } = body;
        if (!propertyId) return Response.json({ error: 'propertyId required' }, { status: 400 });
        const resolvedId = await resolvePropertyId(base44, propertyId);
        if (!resolvedId) {
          console.warn('[manageOffboarding] bring_online FAILED: property not resolvable', { propertyId, actor: user.email });
          return Response.json({ error: `Property not found (id=${propertyId}). It may not be synced yet. Refresh the page or contact support.` }, { status: 400 });
        }
        console.log('[manageOffboarding] bring_online START', { propertyId, resolvedId, actor: user.email, ts: new Date().toISOString() });

        await base44.asServiceRole.entities.Property.update(resolvedId, {
          offboarding_status: null,
          offboarding_reason: null,
          offboarding_initiated_by: null,
          offboarding_initiated_at: null,
          termination_date: null,
        });

        // Republish on Supabase (non-fatal)
        try { await base44.functions.invoke('syncPropertyToSupabase', { action: 'sync_property', id: resolvedId }); }
        catch (e) { console.warn('[manageOffboarding] bring_online Supabase sync failed (non-fatal):', e?.message); }

        const prop = await base44.asServiceRole.entities.Property.get(resolvedId);

        try {
          await base44.functions.invoke('sendAdminNotification', {
            eventType: 'property_brought_online',
            urgency: 'default',
            headline: `Property back online: ${prop.property_name}`,
            subheadline: `Partner: ${prop.partner_name || 'Unknown'}`,
            ctaLabel: 'View Property',
            ctaUrl: `https://100c-os.base44.app/PropertyDetail?id=${resolvedId}`,
            portalNotification: {
              type: 'general',
              title: `Property back online: ${prop.property_name}`,
              message: `${prop.partner_name || 'Unknown'} brought this property back online.`,
              propertyName: prop.property_name,
              partnerName: prop.partner_name,
            },
          });
        } catch {}

        await base44.asServiceRole.entities.AuditEntry.create({
          actor_email: user.email, actor_role: 'partner', action: 'property_brought_online',
          entity_type: 'Property', entity_id: resolvedId, target_name: prop.property_name,
          partner_name: prop.partner_name, details: 'Brought back online from temporary offline',
        }).catch(() => {});

        console.log('[manageOffboarding] bring_online OK', { resolvedId, actor: user.email });
        return Response.json({ ok: true, offboarding_status: null });
      }

      // ─── Partner self-serve: schedule offboarding ───
      case 'schedule': {
        const { propertyId, terminationDate, reason } = body;
        if (!propertyId || !terminationDate) return Response.json({ error: 'propertyId and terminationDate required' }, { status: 400 });
        if (!reason || !reason.trim()) return Response.json({ error: 'reason required' }, { status: 400 });

        const today = new Date().toISOString().slice(0, 10);
        if (terminationDate <= today) return Response.json({ error: 'termination_date must be in the future' }, { status: 400 });

        const resolvedId = await resolvePropertyId(base44, propertyId);
        if (!resolvedId) {
          console.warn('[manageOffboarding] schedule FAILED: property not resolvable', { propertyId, actor: user.email });
          return Response.json({ error: `Property not found (id=${propertyId}). It may not be synced yet. Refresh the page or contact support.` }, { status: 400 });
        }
        console.log('[manageOffboarding] schedule START', { propertyId, resolvedId, terminationDate, actor: user.email, ts: new Date().toISOString() });
        const now = new Date().toISOString();
        await base44.asServiceRole.entities.Property.update(resolvedId, {
          offboarding_status: 'scheduled',
          termination_date: terminationDate,
          offboarding_reason: reason,
          offboarding_initiated_by: user.email,
          offboarding_initiated_at: now,
          offboarding_approved_by: null,
          offboarding_approved_at: null,
        });

        const prop = await base44.asServiceRole.entities.Property.get(resolvedId);

        try {
          await base44.functions.invoke('sendAdminNotification', {
            eventType: 'property_scheduled_offboard',
            urgency: 'warning',
            headline: `Offboarding scheduled: ${prop.property_name}`,
            subheadline: `Partner: ${prop.partner_name || 'Unknown'} | Target date: ${terminationDate}`,
            contextBlock: reason,
            ctaLabel: 'View Property',
            ctaUrl: `https://100c-os.base44.app/PropertyDetail?id=${resolvedId}`,
            portalNotification: {
              type: 'general',
              title: `Offboarding scheduled: ${prop.property_name}`,
              message: `${prop.partner_name || 'Unknown'} scheduled this property to offboard on ${terminationDate}.`,
              propertyName: prop.property_name,
              partnerName: prop.partner_name,
            },
          });
        } catch {}

        await base44.asServiceRole.entities.AuditEntry.create({
          actor_email: user.email, actor_role: 'partner', action: 'property_scheduled_offboard',
          entity_type: 'Property', entity_id: resolvedId, target_name: prop.property_name,
          partner_name: prop.partner_name, details: `Scheduled to offboard on ${terminationDate}. Reason: ${reason}`,
        }).catch(() => {});

        console.log('[manageOffboarding] schedule OK', { resolvedId, terminationDate, actor: user.email });
        return Response.json({ ok: true, offboarding_status: 'scheduled', termination_date: terminationDate });
      }

      // ─── Partner self-serve: cancel scheduled offboarding ───
      case 'cancel_scheduled': {
        const { propertyId } = body;
        if (!propertyId) return Response.json({ error: 'propertyId required' }, { status: 400 });
        const resolvedId = await resolvePropertyId(base44, propertyId);
        if (!resolvedId) {
          console.warn('[manageOffboarding] cancel_scheduled FAILED: property not resolvable', { propertyId, actor: user.email });
          return Response.json({ error: `Property not found (id=${propertyId}). It may not be synced yet. Refresh the page or contact support.` }, { status: 400 });
        }
        console.log('[manageOffboarding] cancel_scheduled START', { propertyId, resolvedId, actor: user.email, ts: new Date().toISOString() });

        await base44.asServiceRole.entities.Property.update(resolvedId, {
          offboarding_status: null,
          termination_date: null,
          offboarding_reason: null,
          offboarding_initiated_by: null,
          offboarding_initiated_at: null,
        });

        const prop = await base44.asServiceRole.entities.Property.get(resolvedId);

        try {
          await base44.functions.invoke('sendAdminNotification', {
            eventType: 'scheduled_offboard_cancelled',
            urgency: 'default',
            headline: `Scheduled offboarding cancelled: ${prop.property_name}`,
            subheadline: `Partner: ${prop.partner_name || 'Unknown'}`,
            ctaLabel: 'View Property',
            ctaUrl: `https://100c-os.base44.app/PropertyDetail?id=${resolvedId}`,
            portalNotification: {
              type: 'general',
              title: `Scheduled offboarding cancelled: ${prop.property_name}`,
              message: `${prop.partner_name || 'Unknown'} cancelled the scheduled offboarding.`,
              propertyName: prop.property_name,
              partnerName: prop.partner_name,
            },
          });
        } catch {}

        await base44.asServiceRole.entities.AuditEntry.create({
          actor_email: user.email, actor_role: user.role === 'admin' ? 'admin' : 'partner',
          action: 'scheduled_offboard_cancelled',
          entity_type: 'Property', entity_id: resolvedId, target_name: prop.property_name,
          partner_name: prop.partner_name, details: 'Scheduled offboarding cancelled',
        }).catch(() => {});

        console.log('[manageOffboarding] cancel_scheduled OK', { resolvedId, actor: user.email });
        return Response.json({ ok: true, offboarding_status: null });
      }

      // ─── Partner initiates: request termination (requires admin approval) ───
      case 'request_termination': {
        const { propertyId, reason, partnerId, partnerName, partnerEmail, propertyName, listingUrl, supabasePropertyId } = body;
        if (!propertyId || !reason?.trim()) return Response.json({ error: 'propertyId and reason required' }, { status: 400 });

        // Resolve to the Base44 id so the later approve_termination → executeTermination
        // doesn't choke on a Supabase numeric id stored in source_property_id.
        const resolvedId = await resolvePropertyId(base44, propertyId) || propertyId;
        console.log('[manageOffboarding] request_termination START', { propertyId, resolvedId, actor: user.email, ts: new Date().toISOString() });

        const submission = await base44.asServiceRole.entities.PropertySubmission.create({
          partner_id: partnerId || '',
          partner_name: partnerName || '',
          partner_email: partnerEmail || user.email,
          property_name: propertyName || '',
          listing_url: listingUrl || '',
          submission_type: 'termination_request',
          source_property_id: resolvedId,
          supabase_property_id: supabasePropertyId || '',
          offboarding_reason: reason,
          notes_to_team: reason,
          status: 'submitted',
          submitted_date: new Date().toISOString(),
          source: 'portal_offboarding',
        });

        try {
          await base44.functions.invoke('sendAdminNotification', {
            eventType: 'termination_request_submitted',
          template_slug: 'admin-offboard-termination-request',
          template_context: { partner: { partner_name: partnerName }, property: { property_name: propertyName, id: resolvedId }, submission: { id: submission.id, reason } },
            urgency: 'alert',
            headline: `Termination request: ${propertyName || 'Property'}`,
            subheadline: `Partner: ${partnerName || 'Unknown'}`,
            contextBlock: reason,
            callout: 'This requires admin approval. The license will be auto-cancelled on approval.',
            ctaLabel: 'Review in Admin Hub',
            ctaUrl: 'https://100c-os.base44.app/admin/hub?tab=offboarding',
            portalNotification: {
              type: 'general',
              title: `Termination request: ${propertyName || 'Property'}`,
              message: `${partnerName || 'Unknown'} requested to permanently terminate this property.`,
              submissionId: submission.id,
              propertyName: propertyName,
              partnerName: partnerName,
              link: '/admin/hub?tab=offboarding',
            },
          });
        } catch {}

        await base44.asServiceRole.entities.AuditEntry.create({
          actor_email: user.email, actor_role: 'partner', action: 'termination_requested',
          entity_type: 'Property', entity_id: resolvedId, target_name: propertyName,
          partner_name: partnerName, details: `Termination requested. Reason: ${reason}`,
        }).catch(() => {});

        console.log('[manageOffboarding] request_termination OK', { resolvedId, submissionId: submission.id, actor: user.email });
        return Response.json({ ok: true, submissionId: submission.id, status: 'submitted' });
      }

      // ─── Admin: approve termination request ───
      case 'approve_termination': {
        const { submissionId, adminMessage } = body;
        if (!submissionId) return Response.json({ error: 'submissionId required' }, { status: 400 });

        const subs = await base44.asServiceRole.entities.PropertySubmission.filter({ id: submissionId });
        const sub = subs[0];
        if (!sub) return Response.json({ error: 'Submission not found' }, { status: 404 });
        if (sub.submission_type !== 'termination_request') return Response.json({ error: 'Not a termination request' }, { status: 400 });

        const now = new Date().toISOString();
        await base44.asServiceRole.entities.PropertySubmission.update(submissionId, {
          status: 'approved',
          reviewed_by: user.email,
          approved_date: now,
          partner_facing_message: adminMessage || '',
        });

        const propertyId = sub.source_property_id;
        if (!propertyId) return Response.json({ error: 'No source_property_id on submission' }, { status: 400 });

        console.log('[manageOffboarding.approve_termination] starting for submission', submissionId, 'property', propertyId);
        const result = await executeTermination(base44, propertyId, {
          approvedBy: user.email,
          reason: sub.offboarding_reason || sub.notes_to_team || '',
          partnerEmail: sub.partner_email,
          adminMessage: adminMessage || '',
        });
        console.log('[manageOffboarding.approve_termination] complete:', { terminated: true, cancelledLicenses: result.cancelledLicenses.length });

        return Response.json({ ok: true, terminated: true, cancelledLicenses: result.cancelledLicenses.length });
      }

      // ─── Admin: reject termination request ───
      case 'reject_termination': {
        const { submissionId, adminMessage } = body;
        if (!submissionId) return Response.json({ error: 'submissionId required' }, { status: 400 });

        const subs = await base44.asServiceRole.entities.PropertySubmission.filter({ id: submissionId });
        const sub = subs[0];
        if (!sub) return Response.json({ error: 'Submission not found' }, { status: 404 });

        const now = new Date().toISOString();
        await base44.asServiceRole.entities.PropertySubmission.update(submissionId, {
          status: 'rejected',
          reviewed_by: user.email,
          rejected_date: now,
          partner_facing_message: adminMessage || '',
        });

        // Partner email
        if (sub.partner_email) {
          try {
            const portalUrl = 'https://the100collection.com/portal/properties';
            const subject = `Update on your termination request for ${sub.property_name}`;
            const messageBlock = adminMessage
              ? `<blockquote style="margin:0 0 16px;padding:16px 20px;background:#FAFAF8;border-left:3px solid #C9A96E;border-radius:8px;font-size:14px;line-height:1.6;color:#0D1B2A;white-space:pre-wrap;">${adminMessage}</blockquote>`
              : '';
            const content = `
              <h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Update on Your Request</h2>
              <p style="margin:0 0 16px;font-size:15px;color:#0D1B2A;font-weight:500;">${sub.property_name}</p>
              <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Your request to terminate <strong>${sub.property_name}</strong> was not approved at this time. Your property remains active in The 100 Collection.</p>
              ${messageBlock}
              <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">If you have questions or would like to discuss this further, please reach out to our team.</p>
              <a href="${portalUrl}" style="display:inline-block;background:#0D1B2A;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">View Your Portal &rarr;</a>
              <p style="margin:16px 0 0;color:#64748B;font-size:14px;line-height:1.6;">The 100 Collection team</p>
            `;
            const text = `Your request to terminate ${sub.property_name} was not approved at this time. Your property remains active in The 100 Collection.\n\n${adminMessage || ''}\n\n${portalUrl}`;
            await base44.functions.invoke('sendResendEmail', { to: sub.partner_email, subject, content, text });
          } catch (e) {
            console.warn('Partner rejection email failed (non-fatal):', e?.message);
          }
        }

        await base44.asServiceRole.entities.AuditEntry.create({
          actor_email: user.email, actor_role: 'admin', action: 'termination_rejected',
          entity_type: 'PropertySubmission', entity_id: submissionId, target_name: sub.property_name,
          partner_name: sub.partner_name, details: adminMessage || 'Termination request rejected',
        }).catch(() => {});

        return Response.json({ ok: true, rejected: true });
      }

      // ─── Admin: force terminate (no submission needed) ───
      case 'force_terminate': {
        const { propertyId, reason } = body;
        if (!propertyId) return Response.json({ error: 'propertyId required' }, { status: 400 });

        const prop = await base44.asServiceRole.entities.Property.get(propertyId);
        if (!prop) return Response.json({ error: 'Property not found' }, { status: 404 });

        const partnerEmail = await lookupPartnerEmail(base44, prop.partner_id);
        const result = await executeTermination(base44, propertyId, {
          approvedBy: user.email,
          reason: reason || 'Force terminated by admin',
          partnerEmail,
        });

        return Response.json({ ok: true, terminated: true, cancelledLicenses: result.cancelledLicenses.length });
      }

      default:
        return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (error) {
    console.error('[manageOffboarding] UNHANDLED ERROR', {
      action: body?.action,
      propertyId: body?.propertyId,
      actor: user?.email,
      error: error?.message,
      stack: error?.stack,
    });
    return Response.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}