import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import postgres from 'npm:postgres@3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const dbPassword = Deno.env.get('SUPABASE_DB_PASSWORD');

    // Build postgres connection from Supabase URL
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (!match) return Response.json({ error: 'Cannot parse project ref' }, { status: 500 });
    const projectRef = match[1];

    const connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

    const sql = postgres(connectionString, { max: 1, ssl: 'require' });

    const results = [];
    const alterStatements = [
      `ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_billing_email text`,
      `ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_invoice_amount numeric`,
      `ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_invoice_date timestamptz`,
      `ALTER TABLE partners ADD COLUMN IF NOT EXISTS property_credits integer`,
    ];

    for (const stmt of alterStatements) {
      try {
        await sql.unsafe(stmt);
        results.push({ stmt, status: 'ok' });
      } catch (e) {
        results.push({ stmt, status: 'error', error: e.message });
      }
    }

    await sql.end();
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});