import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Idempotent: adds status pipeline columns to job_applications and backfills existing rows.
// Run once from admin dashboard. If the Supabase RPC endpoint is unavailable, returns the SQL
// for manual execution in the Supabase SQL editor.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const headers = {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    };

    const sql = `
      ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
      ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS admin_notes TEXT;
      ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS partner_facing_message TEXT;
      ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
      ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      UPDATE job_applications SET status = 'pending' WHERE status IS NULL;
    `;

    // Try the query RPC endpoint
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      return Response.json({
        error: 'Cannot run DDL via REST API. Please run this SQL in your Supabase SQL editor:',
        sql: sql.trim(),
      }, { status: 400 });
    }

    const result = await res.text();
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});