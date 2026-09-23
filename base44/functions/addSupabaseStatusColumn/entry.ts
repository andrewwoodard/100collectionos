import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Use Supabase REST API to run raw SQL via the rpc endpoint
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';`
      }),
    });

    // If exec_sql RPC doesn't exist, try the pg extension approach
    if (!res.ok) {
      const err = await res.text();
      console.log('exec_sql failed:', err, '- trying pg_query');

      const res2 = await fetch(`${supabaseUrl}/rest/v1/rpc/pg_query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          query: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';`
        }),
      });

      const result2 = await res2.text();
      console.log('pg_query result:', result2);
      return Response.json({ message: 'Attempted via pg_query', result: result2 });
    }

    const result = await res.text();
    console.log('exec_sql result:', result);
    return Response.json({ message: 'Column added successfully', result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});