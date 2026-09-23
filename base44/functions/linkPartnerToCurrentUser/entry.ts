import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the Sea Mountain Vacations partner
    const partners = await base44.entities.Partner.filter({ partner_name: 'Sea Mountain Vacations' });
    
    if (partners.length === 0) {
      return Response.json({ error: 'Partner not found' }, { status: 404 });
    }

    const partner = partners[0];

    // Update the partner with the current user's ID
    await base44.entities.Partner.update(partner.id, {
      portal_user_id: user.id,
      portal_user_ids: [user.id],
    });

    return Response.json({
      success: true,
      message: `Updated Sea Mountain Vacations partner (${partner.id}) with user ID: ${user.id} (${user.email})`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});