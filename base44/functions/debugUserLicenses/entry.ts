import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all partners
    const allPartners = await base44.entities.Partner.list();
    
    // Find partners by email
    const partnersByEmail = await base44.entities.Partner.filter({ primary_contact_email: user.email });
    
    // Get all licenses
    const allLicenses = await base44.entities.LicenseRecord.list();
    
    // Get licenses for user's partners
    const userPartnerNames = partnersByEmail.map(p => p.partner_name);
    const userLicenses = allLicenses.filter(l => userPartnerNames.includes(l.partner_name));

    return Response.json({
      user: { id: user.id, email: user.email, full_name: user.full_name },
      allPartnersCount: allPartners.length,
      partnersByEmail: partnersByEmail.map(p => ({ id: p.id, name: p.partner_name, email: p.primary_contact_email })),
      userPartnerNames,
      allLicensesCount: allLicenses.length,
      userLicensesCount: userLicenses.length,
      userLicenses: userLicenses.map(l => ({ id: l.id, property: l.property_name, partner: l.partner_name, status: l.license_status }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});