import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import pg from 'npm:pg@8.13.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const dbPassword = Deno.env.get('SUPABASE_DB_PASSWORD');
    const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
    const poolerUser = `postgres.${projectRef}`;

    const regions = [
      'us-east-1', 'us-west-1', 'us-west-2', 'us-east-2',
      'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-north-1',
      'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
      'ap-south-1', 'ca-central-1', 'sa-east-1',
    ];

    const sql = `ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS sort_order integer;`;
    const results = [];

    for (const region of regions) {
      const host = `aws-0-${region}.pooler.supabase.com`;
      try {
        // Resolve IPv4
        const records = await Deno.resolveDns(host, 'A');
        if (!records.length) {
          results.push({ region, status: 'no_dns' });
          continue;
        }
        const ip = records[0];

        const pool = new pg.Pool({
          host: ip,
          port: 6543,
          user: poolerUser,
          password: dbPassword,
          database: 'postgres',
          ssl: false,
          connectionTimeoutMillis: 8000,
        });

        try {
          const client = await pool.connect();
          try {
            await client.query(sql);
            return Response.json({ success: true, region, host, ip, message: 'sort_order column added' });
          } finally {
            client.release();
            await pool.end();
          }
        } catch (e) {
          results.push({ region, status: 'db_error', error: e.message });
          await pool.end().catch(() => {});
        }
      } catch (e) {
        results.push({ region, status: 'error', error: e.message });
      }
    }

    return Response.json({ error: 'All regions failed', results, projectRef, poolerUser }, { status: 500 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});