import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import pkg from 'npm:pg@8.13.3';
const { Client } = pkg;

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
}

const slugify = (s) =>
  (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.destinations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  base44_destination_id TEXT UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_exclusive BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_destinations_base44_id ON public.destinations (base44_destination_id);
CREATE INDEX IF NOT EXISTS idx_destinations_slug ON public.destinations (slug);
`;

async function ensureTable() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const dbPassword = Deno.env.get('SUPABASE_DB_PASSWORD');
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  const client = new Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: dbPassword,
    ssl: false,
  });
  await client.connect();
  try {
    await client.query(CREATE_TABLE_SQL);
  } finally {
    await client.end();
  }
}

async function upsertDestination(supabase, dest) {
  const payload = {
    base44_destination_id: dest.id,
    name: dest.name,
    slug: dest.slug || slugify(dest.name),
    is_exclusive: !!dest.is_exclusive,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('destinations')
    .select('id')
    .eq('base44_destination_id', dest.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('destinations')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: dest.id, name: dest.name, action: 'updated', supabase_id: data.id };
  }

  const { data, error } = await supabase
    .from('destinations')
    .insert([{ ...payload, created_at: new Date().toISOString() }])
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: dest.id, name: dest.name, action: 'created', supabase_id: data.id };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Support entity-automation payloads: { event: { entity_id }, data: {...} }
    const destinationId = body.destinationId || body.event?.entity_id || body.data?.id;
    const action = body.action || 'sync';

    const user = await base44.auth.me().catch(() => null);
    const isAutomation = !user && (body.event || body.automation);
    if (!user && !isAutomation) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();

    // CREATE TABLE
    if (action === 'create_table') {
      await ensureTable();
      return Response.json({ status: 'ok', message: 'destinations table created' });
    }

    // SYNC A SINGLE DESTINATION (also the entity-automation entry point)
    if (action === 'sync') {
      if (!destinationId) {
        return Response.json({ error: 'destinationId required' }, { status: 400 });
      }
      await ensureTable();
      const dest = body.data?.id ? body.data : (await base44.asServiceRole.entities.Destination.filter({ id: destinationId }))[0];
      if (!dest) return Response.json({ error: 'Destination not found' }, { status: 404 });
      const result = await upsertDestination(supabase, dest);
      return Response.json(result);
    }

    // BACKFILL ALL DESTINATIONS
    if (action === 'backfill') {
      await ensureTable();
      const all = await base44.asServiceRole.entities.Destination.list('-created_date', 500);
      const results = [];
      const errors = [];
      for (const dest of all) {
        try {
          results.push(await upsertDestination(supabase, dest));
        } catch (e) {
          errors.push({ id: dest.id, name: dest.name, error: e.message });
        }
      }
      return Response.json({ total: all.length, synced: results.length, results, errors });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}