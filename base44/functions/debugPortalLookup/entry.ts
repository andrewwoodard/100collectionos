import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Search by portal_user_id
    const partnersByUserId = await base44.entities.Partner.filter({ portal_user_id: user.id });
    
    // Also try searching by email as fallback
    const partnersByEmail = await base44.entities.Partner.filter({ primary_contact_email: user.email });
    
    // Get all licenses
    const allLicenses = await base44.entities.LicenseRecord.list();
    
    // Get licenses for partners found by user ID
    const licensesFromUserId = partnersByUserId.length > 0 
      ? allLicenses.filter(l => partnersByUserId.some(p => p.partner_name === l.partner_name))
      : [];

    return Response.json({
      user: { id: user.id, email: user.email },
      partnersByUserId: partnersByUserId.map(p => ({ id: p.id, name: p.partner_name, portal_user_id: p.portal_user_id })),
      partnersByEmail: partnersByEmail.map(p => ({ id: p.id, name: p.partner_name })),
      licensesFound: licensesFromUserId.map(l => ({ property: l.property_name, partner: l.partner_name })),
      totalLicensesFound: licensesFromUserId.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});