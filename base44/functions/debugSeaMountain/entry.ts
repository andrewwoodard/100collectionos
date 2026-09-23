import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Search for Sea Mountain partner
    const allPartners = await base44.entities.Partner.list();
    const seaMountain = allPartners.find(p => p.partner_name?.toLowerCase().includes('sea') || p.company_name?.toLowerCase().includes('sea'));
    
    // Get all licenses for Sea Mountain
    const allLicenses = await base44.entities.LicenseRecord.list();
    const seaMountainLicenses = allLicenses.filter(l => l.partner_name?.toLowerCase().includes('sea'));

    return Response.json({
      seaMountainPartner: seaMountain ? {
        id: seaMountain.id,
        partner_name: seaMountain.partner_name,
        company_name: seaMountain.company_name,
        primary_contact_email: seaMountain.primary_contact_email,
        portal_user_id: seaMountain.portal_user_id
      } : null,
      seaMountainLicenses: seaMountainLicenses.map(l => ({ 
        id: l.id, 
        property: l.property_name, 
        partner: l.partner_name, 
        status: l.license_status 
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});