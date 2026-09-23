import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import postgres from 'npm:postgres@3.4.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const dbPassword = Deno.env.get('SUPABASE_DB_PASSWORD');
    const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

    const sql = postgres({
      host: `aws-0-us-east-1.pooler.supabase.com`,
      port: 5432,
      database: 'postgres',
      username: `postgres.${projectRef}`,
      password: dbPassword,
      ssl: 'require',
      max: 1,
    });

    await sql`ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_billing_email TEXT`;
    await sql.end();

    return Response.json({ success: true, message: 'stripe_billing_email column added (or already existed)' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});