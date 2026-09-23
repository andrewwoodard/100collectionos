import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import pkg from 'npm:pg@8.13.3';
const { Client } = pkg;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const dbPassword = Deno.env.get('SUPABASE_DB_PASSWORD');
    const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

    // Try direct host (non-pooler) port 5432
    const client = new Client({
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: dbPassword,
      ssl: false,
    });
    await client.connect();

    const statements = [
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS partner_id TEXT`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS address TEXT`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started'`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS photography_status TEXT DEFAULT 'not_started'`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS internal_notes TEXT`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS launch_date TEXT`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS portal_visible BOOLEAN DEFAULT false`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS sleeps INTEGER`,
    ];

    const results = [];
    for (const sql of statements) {
      const res = await client.query(sql);
      results.push({ sql: sql.substring(0, 60), command: res.command });
    }

    await client.end();
    return Response.json({ success: true, results });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});