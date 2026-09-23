import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { license_id, new_property_id, reason } = await req.json();

    if (!license_id || !new_property_id) {
      return Response.json({ error: 'license_id and new_property_id are required' }, { status: 400 });
    }

    // Fetch the existing license
    const license = await base44.asServiceRole.entities.LicenseRecord.get(license_id);
    if (!license) {
      return Response.json({ error: 'License not found' }, { status: 404 });
    }

    if (license.license_status !== 'active') {
      return Response.json({ error: 'Only active licenses can be transferred' }, { status: 400 });
    }

    // Fetch the new property
    const newProperty = await base44.asServiceRole.entities.Property.get(new_property_id);
    if (!newProperty) {
      return Response.json({ error: 'New property not found' }, { status: 404 });
    }

    // Build transfer history entry
    const transferEntry = {
      transferred_at: new Date().toISOString(),
      transferred_by: user.email,
      from_property_name: license.property_name,
      from_property_id: license.property_id || null,
      from_submission_id: license.submission_id,
      to_property_name: newProperty.property_name,
      to_property_id: new_property_id,
      reason: reason || ''
    };

    const existingHistory = license.transfer_history || [];

    // Find matching submission for new property (if any)
    const submissions = await base44.asServiceRole.entities.PropertySubmission.filter({ partner_id: newProperty.partner_id });
    const matchingSubmission = submissions.find(s => s.property_name === newProperty.property_name);

    // Update the license record
    await base44.asServiceRole.entities.LicenseRecord.update(license_id, {
      property_name: newProperty.property_name,
      property_id: new_property_id,
      submission_id: matchingSubmission?.id || license.submission_id,
      transfer_history: [...existingHistory, transferEntry]
    });

    // Log audit entry
    await base44.asServiceRole.entities.AuditEntry.create({
      actor_email: user.email,
      actor_role: user.role,
      action: 'license_transferred',
      entity_type: 'LicenseRecord',
      entity_id: license_id,
      property_name: newProperty.property_name,
      partner_name: license.partner_name,
      details: `License transferred from "${transferEntry.from_property_name}" to "${newProperty.property_name}"`,
      old_value: transferEntry.from_property_name,
      new_value: newProperty.property_name
    });

    return Response.json({ success: true, transfer: transferEntry });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});