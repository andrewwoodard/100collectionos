import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

const STRIP_FIELDS = new Set(['created_date', 'updated_date', 'created_by', 'created_by_id', 'updated_by', 'updated_by_id', 'is_sample']);

function cleanForSupabase(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && !STRIP_FIELDS.has(k)) {
      out[k] = v;
    }
  }
  if (obj.created_date) out.created_at = obj.created_date;
  return out;
}

async function migrateEntity(base44Client, supabase, entityName, tableName, results) {
  try {
    const records = await base44Client.asServiceRole.entities[entityName].list('-created_date', 2000);
    if (!records || records.length === 0) {
      results.push({ entity: entityName, table: tableName, status: 'skipped', count: 0 });
      return;
    }

    // Check existing IDs to avoid duplicates
    const { data: existing } = await supabase.from(tableName).select('id').limit(5000);
    const existingIds = new Set((existing || []).map(r => r.id));
    const toInsert = records.filter(r => r.id && !existingIds.has(r.id)).map(r => cleanForSupabase(r));

    if (toInsert.length === 0) {
      results.push({ entity: entityName, table: tableName, status: 'already_migrated', count: records.length });
      return;
    }

    // Insert in batches of 100
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase.from(tableName).insert(batch);
      if (error) {
        results.push({ entity: entityName, table: tableName, status: 'error', error: error.message, inserted });
        return;
      }
      inserted += batch.length;
    }
    results.push({ entity: entityName, table: tableName, status: 'success', count: records.length, inserted });
  } catch (err) {
    results.push({ entity: entityName, table: tableName, status: 'error', error: err.message });
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const supabase = getSupabase();
    const results = [];

    const migrations = [
      ['Partner',           'partners'],
      ['Task',              'tasks'],
      ['BillingRecord',     'billing_records'],
      ['Note',              'notes'],
      ['Document',          'documents'],
      ['MediaAsset',        'media_assets'],
      ['OnboardingItem',    'onboarding_items'],
      ['ActivityLog',       'activity_logs'],
      ['LicenseRecord',     'license_records'],
      ['AuditEntry',        'audit_entries'],
      ['PartnerProfile',    'partner_profiles'],
      ['PartnerApplication','partner_applications'],
    ];

    for (const [entityName, tableName] of migrations) {
      await migrateEntity(base44, supabase, entityName, tableName, results);
    }

    const summary = {
      total_entities: migrations.length,
      succeeded: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      already_migrated: results.filter(r => r.status === 'already_migrated').length,
      errors: results.filter(r => r.status === 'error').length,
    };

    return Response.json({ summary, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});