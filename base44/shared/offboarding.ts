// Shared offboarding logic used by manageOffboarding (admin approve / force terminate)
// and processScheduledOffboardings (daily automation).
//
// executeTermination does the heavy lifting:
// - Updates Property to terminated/inactive
// - Cancels all active LicenseRecords
// - Triggers Supabase depublish via syncPropertyToSupabase
// - Fires admin notification (refund/proration alert)
// - Fires partner courtesy email
// - Creates audit entry

export async function executeTermination(base44, propertyId, options = {}) {
  const {
    approvedBy = 'system',
    reason = '',
    partnerEmail = '',
    isScheduled = false,
    adminMessage = '',
  } = options;

  const property = await base44.asServiceRole.entities.Property.get(propertyId);
  if (!property) throw new Error('Property not found: ' + propertyId);
  console.log('[executeTermination] START', { propertyId, name: property.property_name, partner: property.partner_name });

  const now = new Date().toISOString();
  const actorRole = approvedBy && approvedBy !== 'system' ? 'admin' : 'system';

  // 1. Update Property
  await base44.asServiceRole.entities.Property.update(propertyId, {
    offboarding_status: 'terminated',
    status: 'inactive',
    offboarding_reason: reason || property.offboarding_reason || '',
    offboarding_approved_by: approvedBy,
    offboarding_approved_at: now,
  });
  console.log('[executeTermination] Step 1 done: Property marked terminated/inactive');

  // 2. Cancel LicenseRecords
  const licenses = await base44.asServiceRole.entities.LicenseRecord.filter({ property_id: propertyId });
  const cancelledLicenses = [];
  for (const lic of licenses) {
    if (lic.license_status !== 'cancelled' && lic.license_status !== 'expired') {
      await base44.asServiceRole.entities.LicenseRecord.update(lic.id, {
        license_status: 'cancelled',
        notes: (lic.notes || '') + `\nAuto-cancelled due to property termination on ${now}.`,
      });
      cancelledLicenses.push(lic);
    }
  }
  console.log('[executeTermination] Step 2 done: cancelled', cancelledLicenses.length, 'license(s)');

  // 3. Depublish on Supabase (syncPropertyToSupabase reads offboarding_status and depublishes)
  try {
    await base44.functions.invoke('syncPropertyToSupabase', { action: 'sync_property', id: propertyId });
    console.log('[executeTermination] Step 3 done: Supabase depublish sync complete');
  } catch (e) {
    console.warn('[executeTermination] Step 3 FAILED (Supabase sync non-fatal):', e?.message);
  }

  // 4. Admin notification (refund alert)
  const licenseAlert = cancelledLicenses.length > 0
    ? `License${cancelledLicenses.length > 1 ? 's' : ''} ${cancelledLicenses.map(l => l.license_number || l.id).join(', ')} auto-cancelled. Review for refund/proration.`
    : 'No active licenses found to cancel.';

  try {
    await base44.functions.invoke('sendAdminNotification', {
      eventType: isScheduled ? 'property_auto_terminated' : 'property_terminated',
      urgency: 'alert',
      headline: `Property terminated: ${property.property_name}`,
      subheadline: `Partner: ${property.partner_name || 'Unknown'}`,
      contextBlock: reason || (isScheduled ? 'Scheduled termination processed automatically.' : 'Terminated by admin.'),
      callout: licenseAlert,
      ctaLabel: 'View Property',
      ctaUrl: `https://100c-os.base44.app/PropertyDetail?id=${propertyId}`,
      portalNotification: {
        type: 'general',
        title: `Property terminated: ${property.property_name}`,
        message: `${property.partner_name || 'Unknown'} - ${licenseAlert}`,
        propertyName: property.property_name,
        partnerName: property.partner_name,
      },
    });
  } catch (e) {
    console.warn('Admin notification failed (non-fatal):', e?.message);
  }

  // 5. Partner courtesy email
  const email = partnerEmail || await lookupPartnerEmail(base44, property.partner_id);
  if (email) {
    try {
      const portalUrl = 'https://the100collection.com/portal/properties';
      const subject = `${property.property_name} has been offboarded from The 100 Collection`;
      const messageBlock = adminMessage
        ? `<blockquote style="margin:0 0 16px;padding:16px 20px;background:#FAFAF8;border-left:3px solid #C9A96E;border-radius:8px;font-size:14px;line-height:1.6;color:#0D1B2A;white-space:pre-wrap;">${adminMessage}</blockquote>`
        : '';
      const content = `
        <h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Your Property Has Been Offboarded</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#0D1B2A;font-weight:500;">${property.property_name}</p>
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Your property <strong>${property.property_name}</strong> has been offboarded from The 100 Collection${isScheduled ? ' as scheduled' : ''}. Thank you for your partnership${property.partner_name ? ' with ' + property.partner_name : ''}.</p>
        ${messageBlock}
        <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">If you have any questions about this transition or your licensing, please reach out to our team.</p>
        <a href="${portalUrl}" style="display:inline-block;background:#0D1B2A;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">View Your Portal &rarr;</a>
        <p style="margin:16px 0 0;color:#64748B;font-size:14px;line-height:1.6;">The 100 Collection team</p>
      `;
      const text = `Your property ${property.property_name} has been offboarded from The 100 Collection${isScheduled ? ' as scheduled' : ''}. Thank you for your partnership. If you have any questions, please reach out to our team.\n\n${portalUrl}`;
      await base44.functions.invoke('sendResendEmail', { to: email, subject, content, text });
    } catch (e) {
      console.warn('Partner email failed (non-fatal):', e?.message);
    }
  }

  // 6. Audit entry
  try {
    await base44.asServiceRole.entities.AuditEntry.create({
      actor_email: approvedBy,
      actor_role: actorRole,
      action: isScheduled ? 'scheduled_termination_processed' : 'property_terminated',
      entity_type: 'Property',
      entity_id: propertyId,
      target_name: property.property_name,
      partner_name: property.partner_name,
      details: reason || (isScheduled ? 'Scheduled termination processed automatically' : 'Terminated by admin'),
    });
  } catch (e) {
    console.warn('[executeTermination] Step 6 FAILED (audit entry non-fatal):', e?.message);
  }

  console.log('[executeTermination] COMPLETE', { propertyId, cancelledLicenses: cancelledLicenses.length });
  return { property, cancelledLicenses };
}

export async function lookupPartnerEmail(base44, partnerId) {
  if (!partnerId) return '';
  try {
    const partners = await base44.asServiceRole.entities.Partner.filter({ id: partnerId });
    return partners[0]?.primary_contact_email || '';
  } catch {
    return '';
  }
}