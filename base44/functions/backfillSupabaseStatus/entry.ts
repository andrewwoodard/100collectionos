// Backfills all active PropertySubmissions → sets status='active', active=true in Supabase
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const submissions = await base44.asServiceRole.entities.PropertySubmission.filter({ status: 'active' });
    const results = [];

    for (const sub of submissions) {
      const sbId = sub.supabase_property_id;
      if (!sbId || sbId === 'null' || sbId === 'undefined') {
        results.push({ name: sub.property_name, skipped: true, reason: 'no supabase_property_id' });
        continue;
      }
      const { error } = await supabase
        .from('properties')
        .update({ status: 'active', active: true })
        .eq('id', sbId);
      results.push({ name: sub.property_name, supabase_id: sbId, error: error?.message || null, success: !error });
    }

    return Response.json({ total: submissions.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});