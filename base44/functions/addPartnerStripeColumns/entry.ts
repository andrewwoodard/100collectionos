import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const results = [];

    const columns = [
      { name: 'stripe_billing_email', type: 'text' },
      { name: 'last_invoice_amount', type: 'numeric' },
      { name: 'last_invoice_date', type: 'timestamptz' },
      { name: 'property_credits', type: 'integer' },
    ];

    for (const col of columns) {
      // Try inserting a dummy row to check if column exists, then update it
      // Instead, just try updating with the field — if it errors, column doesn't exist
      const { error } = await supabase
        .from('partners')
        .update({ [col.name]: null })
        .eq('id', '00000000-0000-0000-0000-000000000000'); // no-op update

      if (error && error.message.includes('does not exist')) {
        results.push({ column: col.name, status: 'missing - needs manual Supabase migration', error: error.message });
      } else {
        results.push({ column: col.name, status: 'exists' });
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});