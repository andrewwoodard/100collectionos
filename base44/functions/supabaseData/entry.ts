import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

// Generic CRUD handler for simple tables (field names match Supabase columns 1:1)
async function handleTable(supabase, tableName, action, id, data, filters, limit, search, searchFields) {
  if (action === 'list') {
    let q = supabase.from(tableName).select('*').order('created_at', { ascending: false }).limit(limit || 500);
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null) q = q.eq(k, v);
      }
    }
    if (search && searchFields?.length) {
      q = q.or(searchFields.map(f => `${f}.ilike.%${search}%`).join(','));
    }
    const { data: rows, error } = await q;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ items: rows.map(r => normalize(r)) });
  }
  if (action === 'get') {
    const { data: row, error } = await supabase.from(tableName).select('*').eq('id', id).single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ item: normalize(row) });
  }
  if (action === 'create') {
    const { data: row, error } = await supabase.from(tableName).insert([cleanData(data)]).select('*').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ item: normalize(row) });
  }
  if (action === 'update') {
    const { data: row, error } = await supabase.from(tableName).update(cleanData(data)).eq('id', id).select('*').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ item: normalize(row) });
  }
  if (action === 'delete') {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  }
  if (action === 'bulk_create') {
    const rows = (data || []).map(d => cleanData(d));
    const { data: inserted, error } = await supabase.from(tableName).insert(rows).select('*');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ items: inserted.map(r => normalize(r)), count: inserted.length });
  }
  return Response.json({ error: 'Unknown action' }, { status: 400 });
}

// Normalize Supabase row to app shape (created_at → created_date)
function normalize(row) {
  if (!row) return null;
  const out = { ...row };
  if (out.created_at && !out.created_date) out.created_date = out.created_at;
  return out;
}

// Strip undefined/null values and disallow id override on create
function cleanData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v !== undefined && k !== 'created_date' && k !== 'created_at' && k !== 'updated_date') {
      out[k] = v;
    }
  }
  return out;
}

const TABLE_SEARCH_FIELDS = {
  partners: ['partner_name', 'company_name', 'market', 'primary_contact_name', 'primary_contact_email', 'stripe_billing_email'],
  tasks: ['title', 'description', 'partner_name', 'property_name'],
  billing_records: ['partner_name', 'invoice_number'],
  notes: ['title', 'body', 'partner_name'],
  documents: ['title', 'partner_name', 'property_name'],
  media_assets: ['asset_name', 'partner_name', 'property_name'],
  onboarding_items: ['checklist_item', 'partner_name', 'property_name'],
  activity_logs: ['action', 'partner_name', 'property_name', 'performed_by'],
  audit_entries: ['action', 'partner_name', 'actor_email'],
  license_records: ['partner_name', 'property_name', 'license_number'],
  partner_profiles: ['partner_name', 'display_name', 'company_name'],
  partner_applications: ['full_name', 'email', 'company_name'],
  job_applications: ['name', 'email', 'phone', 'job_title', 'partner_name', 'job_location', 'first_name', 'last_name'],
  properties: ['property_name', 'partner_name', 'market', 'address'],
  vrms: ['name', 'partner_name', 'market', 'destination'],
};

const VALID_TABLES = new Set(Object.keys(TABLE_SEARCH_FIELDS));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { table, action, id, data, filters, search, limit } = body;

    if (!VALID_TABLES.has(table)) {
      return Response.json({ error: `Invalid table: ${table}` }, { status: 400 });
    }

    const supabase = getSupabase();
    return handleTable(supabase, table, action, id, data, filters, limit, search, TABLE_SEARCH_FIELDS[table]);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});