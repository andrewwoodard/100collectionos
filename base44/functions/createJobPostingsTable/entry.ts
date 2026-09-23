import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const sql = `
      CREATE TABLE IF NOT EXISTS public.job_postings (
        id TEXT PRIMARY KEY,
        partner_id TEXT,
        partner_name TEXT,
        title TEXT NOT NULL,
        location TEXT,
        job_type TEXT DEFAULT 'full_time',
        department TEXT,
        description TEXT,
        requirements TEXT,
        compensation TEXT NOT NULL,
        application_email TEXT,
        application_url TEXT,
        status TEXT DEFAULT 'active',
        closes_at DATE,
        created_date TIMESTAMPTZ,
        updated_date TIMESTAMPTZ,
        created_by_id TEXT
      );
    `;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    // Try alternative: use the pg endpoint
    if (!res.ok) {
      // Use Supabase SQL API via management endpoint isn't available; 
      // use the direct postgres approach via supabase-js workaround
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        }
      });

      return Response.json({
        error: "Cannot create table via REST API directly. Please run this SQL in your Supabase SQL editor:",
        sql: sql.trim()
      }, { status: 400 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});