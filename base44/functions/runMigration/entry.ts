import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Use Supabase's /rest/v1/rpc approach won't work for DDL.
    // Instead use the Supabase SQL API available via the dashboard's REST endpoint.
    // This hits the PostgREST SQL execution endpoint.
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_billing_email TEXT;` }),
    });

    if (!response.ok) {
      // Try via Supabase Management API
      const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
      const mgmtResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/sql`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_billing_email TEXT;` }),
      });

      const mgmtResult = await mgmtResponse.text();
      return Response.json({ 
        rpc_status: response.status,
        mgmt_status: mgmtResponse.status,
        mgmt_result: mgmtResult,
        note: 'Please run this SQL manually in Supabase SQL Editor if both methods fail',
        sql: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_billing_email TEXT;`
      });
    }

    const result = await response.json();
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ 
      error: error.message,
      sql: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_billing_email TEXT;`
    }, { status: 500 });
  }
});