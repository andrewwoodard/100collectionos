import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = await (async () => {
      const { createClient } = await import('npm:@supabase/supabase-js@2');
      return createClient(supabaseUrl, serviceRoleKey);
    })();

    // Fetch all partner_profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('partner_profiles')
      .select('*');

    if (profilesError) {
      return Response.json({ error: `Failed to fetch partner_profiles: ${profilesError.message}` }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return Response.json({ synced: 0, message: 'No partner profiles found' });
    }

    let synced = 0;

    // For each profile, check if they have properties
    for (const profile of profiles) {
      const partnerEmail = profile.partner_email;

      // Check if this profile's partner has any active properties
      const { data: properties } = await supabase
        .from('properties')
        .select('id')
        .eq('base44_partner_email', partnerEmail)
        .limit(1);

      // If they have properties, ensure they're in the partners table
      if (properties && properties.length > 0) {
        // Check if partner already exists
        const { data: existing } = await supabase
          .from('partners')
          .select('id')
          .eq('primary_contact_email', partnerEmail)
          .maybeSingle();

        if (!existing) {
          // Create partner record from profile
          const { error: insertError } = await supabase
            .from('partners')
            .insert({
              partner_name: profile.partner_name || profile.display_name || 'Unknown',
              company_name: profile.company_name || '',
              primary_contact_name: profile.display_name || '',
              primary_contact_email: partnerEmail,
              market: profile.market || '',
              status: 'live',
              partner_type: 'property_manager'
            });

          if (!insertError) {
            synced++;
          }
        }
      }
    }

    return Response.json({ synced, total_profiles: profiles.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});