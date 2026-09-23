import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();

    // Support both direct calls (with partnerId) and entity automation payloads (with event.entity_id)
    const partnerId = body.partnerId || body.event?.entity_id || body.data?.id;
    const partnerEmail = body.partnerEmail || body.data?.primary_contact_email || "";

    // Allow service-role calls from automations (no user session required)
    const user = await base44.auth.me().catch(() => null);
    const isAutomation = !user && (body.event || body.automation);
    if (!user && !isAutomation) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { partnerId: _p, partnerEmail: _e, ...rest } = body; // unused but keeps destructure clean
    if (!partnerId) return Response.json({ error: 'partnerId required' }, { status: 400 });

    const supabase = getSupabase();

    // Load partner from Base44 — use data from automation payload if available
    const partnerFromPayload = body.data?.partner_name ? body.data : null;
    const partners = partnerFromPayload ? [partnerFromPayload] : await base44.asServiceRole.entities.Partner.filter({ id: partnerId });
    const partner = partners[0];
    if (!partner) return Response.json({ error: 'Partner not found' }, { status: 404 });

    const email = partner.primary_contact_email || partnerEmail || "";

    // Check if base44_partner_id column exists
    const { error: colCheckError } = await supabase.from('partners').select('base44_partner_id').limit(1);
    const hasBase44Col = !colCheckError;

    const payload = {
      partner_name: partner.partner_name,
      company_name: partner.company_name || partner.partner_name,
      primary_contact_name: partner.primary_contact_name || "",
      primary_contact_email: email,
      market: partner.market || "",
      status: partner.status || "live",
      partner_type: partner.partner_type || "property_manager",
    };

    if (hasBase44Col) payload.base44_partner_id = partner.id;

    // Check if already exists in Supabase by base44_partner_id or email
    let existingId = null;

    if (hasBase44Col) {
      const { data: byId } = await supabase
        .from('partners')
        .select('id')
        .eq('base44_partner_id', partner.id)
        .maybeSingle();
      if (byId) existingId = byId.id;
    }

    if (!existingId && email) {
      const { data: byEmail } = await supabase
        .from('partners')
        .select('id')
        .eq('primary_contact_email', email)
        .maybeSingle();
      if (byEmail) existingId = byEmail.id;
    }

    if (!existingId) {
      // Try matching by partner_name as last resort
      const { data: byName } = await supabase
        .from('partners')
        .select('id')
        .eq('partner_name', partner.partner_name)
        .maybeSingle();
      if (byName) existingId = byName.id;
    }

    let result;
    if (existingId) {
      // Update existing row
      const { data, error } = await supabase
        .from('partners')
        .update(payload)
        .eq('id', existingId)
        .select('id')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      result = { action: 'updated', supabase_id: data.id };
    } else {
      // Insert new row
      const { data, error } = await supabase
        .from('partners')
        .insert([{ ...payload, created_at: new Date().toISOString() }])
        .select('id')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      result = { action: 'created', supabase_id: data.id };
    }

    console.log('Partner sync result:', JSON.stringify(result));
    return Response.json(result);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});