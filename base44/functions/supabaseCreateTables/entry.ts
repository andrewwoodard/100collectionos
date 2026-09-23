import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const tables = {

      partners: `
        CREATE TABLE IF NOT EXISTS partners (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          partner_name TEXT NOT NULL,
          company_name TEXT,
          primary_contact_name TEXT,
          primary_contact_email TEXT,
          primary_contact_phone TEXT,
          market TEXT,
          region TEXT,
          partner_type TEXT,
          status TEXT DEFAULT 'lead',
          onboarding_stage TEXT DEFAULT 'approved',
          contract_status TEXT DEFAULT 'none',
          billing_status TEXT DEFAULT 'not_setup',
          assigned_internal_owner TEXT,
          start_date TEXT,
          go_live_date TEXT,
          renewal_date TEXT,
          notes TEXT,
          tags TEXT[],
          portal_user_id TEXT,
          stripe_billing_email TEXT,
          last_invoice_amount NUMERIC,
          last_invoice_date TIMESTAMPTZ,
          property_credits INTEGER
        );`,

      partner_profiles: `
        CREATE TABLE IF NOT EXISTS partner_profiles (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          partner_email TEXT NOT NULL,
          partner_id TEXT,
          partner_name TEXT,
          display_name TEXT,
          title TEXT,
          company_name TEXT,
          profile_photo_url TEXT,
          company_logo_url TEXT,
          about_bio TEXT,
          favorite_restaurants TEXT,
          favorite_breweries TEXT,
          favorite_bakery TEXT,
          favorite_shops TEXT,
          favorite_things_to_do TEXT,
          market TEXT,
          website_url TEXT,
          profile_status TEXT DEFAULT 'draft'
        );`,

      partner_applications: `
        CREATE TABLE IF NOT EXISTS partner_applications (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          company_name TEXT,
          phone TEXT,
          website TEXT,
          property_count TEXT,
          property_locations TEXT,
          how_heard TEXT,
          message TEXT,
          status TEXT DEFAULT 'pending'
        );`,

      documents: `
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          title TEXT NOT NULL,
          file_url TEXT,
          doc_type TEXT,
          folder_id TEXT,
          partner_id TEXT,
          partner_name TEXT,
          property_id TEXT,
          property_name TEXT,
          status TEXT DEFAULT 'draft',
          expiration_date TEXT,
          uploaded_by TEXT,
          notes TEXT,
          google_sheet_id TEXT,
          google_sheet_url TEXT,
          google_sheet_tab TEXT
        );`,

      tasks: `
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          title TEXT NOT NULL,
          description TEXT,
          partner_id TEXT,
          partner_name TEXT,
          property_id TEXT,
          property_name TEXT,
          assigned_to TEXT,
          due_date TEXT,
          priority TEXT DEFAULT 'medium',
          status TEXT DEFAULT 'not_started',
          task_type TEXT
        );`,

      notes: `
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          title TEXT NOT NULL,
          body TEXT,
          partner_id TEXT,
          partner_name TEXT,
          property_id TEXT,
          property_name TEXT,
          note_type TEXT DEFAULT 'internal'
        );`,

      media_assets: `
        CREATE TABLE IF NOT EXISTS media_assets (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          asset_name TEXT NOT NULL,
          asset_type TEXT,
          file_url TEXT,
          thumbnail_url TEXT,
          folder_id TEXT,
          partner_id TEXT,
          partner_name TEXT,
          property_id TEXT,
          property_name TEXT,
          market TEXT,
          approval_status TEXT DEFAULT 'pending',
          tags TEXT[],
          notes TEXT
        );`,

      onboarding_items: `
        CREATE TABLE IF NOT EXISTS onboarding_items (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          partner_id TEXT,
          partner_name TEXT,
          property_id TEXT,
          property_name TEXT,
          stage TEXT,
          checklist_item TEXT NOT NULL,
          owner TEXT,
          due_date TEXT,
          completed BOOLEAN DEFAULT false,
          completed_date TEXT,
          blocker_status TEXT DEFAULT 'none',
          blocker_notes TEXT
        );`,

      billing_records: `
        CREATE TABLE IF NOT EXISTS billing_records (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          partner_id TEXT NOT NULL,
          partner_name TEXT,
          invoice_number TEXT,
          billing_type TEXT,
          amount NUMERIC,
          invoice_date TEXT,
          due_date TEXT,
          paid_date TEXT,
          status TEXT DEFAULT 'draft',
          billing_contact TEXT,
          notes TEXT
        );`,

      license_records: `
        CREATE TABLE IF NOT EXISTS license_records (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          submission_id TEXT NOT NULL,
          partner_id TEXT,
          partner_name TEXT,
          property_name TEXT,
          property_id TEXT,
          license_number TEXT,
          license_status TEXT DEFAULT 'pending',
          license_start_date TEXT,
          license_end_date TEXT,
          annual_fee NUMERIC,
          is_deal BOOLEAN DEFAULT false,
          deal_notes TEXT,
          payment_status TEXT DEFAULT 'unpaid',
          invoice_date TEXT,
          paid_date TEXT,
          stripe_invoice_id TEXT,
          transfer_history JSONB DEFAULT '[]',
          notes TEXT
        );`,

      activity_logs: `
        CREATE TABLE IF NOT EXISTS activity_logs (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          entity_name TEXT,
          partner_id TEXT,
          partner_name TEXT,
          property_id TEXT,
          property_name TEXT,
          performed_by TEXT,
          details TEXT
        );`,

      audit_entries: `
        CREATE TABLE IF NOT EXISTS audit_entries (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          created_at TIMESTAMPTZ DEFAULT now(),
          actor_email TEXT NOT NULL,
          actor_role TEXT,
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          property_name TEXT,
          partner_name TEXT,
          details TEXT,
          old_value TEXT,
          new_value TEXT
        );`,
    };

    const results = [];
    for (const [tableName, sql] of Object.entries(tables)) {
      const { error: checkErr } = await supabase.from(tableName).select('id').limit(1);
      if (!checkErr) {
        results.push({ table: tableName, status: 'already_exists' });
      } else {
        results.push({ table: tableName, status: 'needs_creation', hint: checkErr.message });
      }
    }

    return Response.json({ 
      message: 'Table check complete. Use the SQL below to create missing tables in your Supabase SQL editor.',
      results,
      sql: Object.values(tables).join('\n\n')
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});