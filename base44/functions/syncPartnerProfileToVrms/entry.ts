import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
}

// Normalize a partner name into the slug used by the vrms table
function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Map a Base44 PartnerProfile + Partner into the vrms row payload
function buildVrmsPayload(profile, partner) {
  const partnerName = partner?.partner_name || profile.partner_name || profile.company_name || '';
  const email = profile.reservation_email || partner?.primary_contact_email || profile.partner_email || '';
  const phone = profile.reservation_phone || profile.personal_phone || partner?.primary_contact_phone || '';
  const bio = profile.about_bio || profile.company_bio || '';

  // Owner favorites — stored as a single JSON blob on the vrms row
  const favorites_json = {
    restaurants: profile.favorite_restaurants || null,
    breweries: profile.favorite_breweries || null,
    bakery: profile.favorite_bakery || null,
    shops: profile.favorite_shops || null,
    things_to_do: profile.favorite_things_to_do || null,
  };

  return {
    favorites_json,
    name: partnerName,
    partner_name: partnerName,
    title: partnerName,
    slug: slugify(partnerName),
    doyen_name: profile.display_name || '',
    doyen_title: profile.title || '',
    doyen_short_description: profile.company_bio || bio.slice(0, 160),
    doyen_text: bio,
    doyen_image_url: profile.profile_photo_url || null,
    logo_image_url: profile.company_logo_url || null,
    main_image_url: profile.profile_photo_url || profile.company_logo_url || null,
    vrm_email: email,
    email,
    vrm_phone: phone,
    phone,
    website: profile.website_url || null,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Entity automation payload (event.entity_id) or direct call (profileId / partnerEmail)
    const profileId = body.profileId || body.event?.entity_id || body.data?.id;
    const partnerEmail = body.partnerEmail || body.data?.partner_email || '';

    // Allow service-role calls from automations (no user session required)
    const user = await base44.auth.me().catch(() => null);
    const isAutomation = !user && (body.event || body.automation);
    if (!user && !isAutomation) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!profileId && !partnerEmail) return Response.json({ error: 'profileId or partnerEmail required' }, { status: 400 });

    // Load the PartnerProfile — use automation payload data if present
    let profile = body.data?.partner_email ? body.data : null;
    if (!profile && profileId) {
      const profiles = await base44.asServiceRole.entities.PartnerProfile.filter({ id: profileId });
      profile = profiles[0];
    }
    if (!profile && partnerEmail) {
      const profiles = await base44.asServiceRole.entities.PartnerProfile.filter({ partner_email: partnerEmail });
      profile = profiles[0];
    }
    if (!profile) return Response.json({ error: 'PartnerProfile not found' }, { status: 404 });

    // Resolve the Partner group this profile belongs to
    let partner = null;
    if (profile.partner_id) {
      const byId = await base44.asServiceRole.entities.Partner.filter({ id: profile.partner_id });
      partner = byId[0];
    }
    if (!partner && profile.partner_email) {
      const byEmail = await base44.asServiceRole.entities.Partner.filter({ primary_contact_email: profile.partner_email });
      partner = byEmail[0];
    }
    if (!partner) return Response.json({ error: 'Partner not found for profile' }, { status: 404 });

    const supabase = getSupabase();
    const payload = buildVrmsPayload(profile, partner);

    // Find the existing vrms row by partner_name (fallback to slug)
    let existingId = null;
    const { data: byName } = await supabase
      .from('vrms')
      .select('id')
      .eq('partner_name', partner.partner_name)
      .maybeSingle();
    if (byName) existingId = byName.id;

    if (!existingId) {
      const { data: bySlug } = await supabase
        .from('vrms')
        .select('id')
        .eq('slug', payload.slug)
        .maybeSingle();
      if (bySlug) existingId = bySlug.id;
    }

    let result;
    if (existingId) {
      const { data, error } = await supabase
        .from('vrms')
        .update(payload)
        .eq('id', existingId)
        .select('id')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      result = { action: 'updated', vrms_id: data.id };
    } else {
      const { data, error } = await supabase
        .from('vrms')
        .insert([{ ...payload, onboarded: false, is_onboarded: false, showproperties: true, source: 'base44' }])
        .select('id')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      result = { action: 'created', vrms_id: data.id };
    }

    console.log('VRMS profile sync result:', JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});