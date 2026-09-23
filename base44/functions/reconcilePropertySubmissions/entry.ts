/**
 * reconcilePropertySubmissions
 *
 * Safety net: finds PropertySubmission records that have been approved into a
 * post-review state (approved / licensed / billed / active) but don't have a
 * corresponding Property record, and creates or links one.
 *
 * Trigger paths:
 *   - Manual invocation from admin UI (Admin Hub → Submission Queue)
 *   - Scheduled automation every 30 minutes
 *
 * Returns:
 *   { success, orphaned_found, created, relinked_to_existing, errors, details }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildPropertyData } from "../../shared/propertyMapping.ts";

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

const POST_REVIEW_STATUSES = ["approved", "licensed", "billed", "active"];

function normalizeName(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Auth: require admin for manual invocations; allow scheduled runs (no user context)
    const isAuthed = await base44.auth.isAuthenticated();
    if (isAuthed) {
      const user = await base44.auth.me();
      if (user && user.role !== "admin") {
        return Response.json({ error: "Admin only" }, { status: 403 });
      }
    }

    // 1. Fetch all post-review submissions
    const allSubmissions = await base44.asServiceRole.entities.PropertySubmission.list("-created_date", 2000);
    const candidates = allSubmissions.filter(s => POST_REVIEW_STATUSES.includes(s.status));

    // Pre-load all Properties for efficient matching
    const allProperties = await base44.asServiceRole.entities.Property.list("-created_date", 5000);
    const propertyIdSet = new Set(allProperties.map(p => p.id));
    const propertyMap = new Map();
    for (const p of allProperties) {
      const key = `${p.partner_id || ""}|${normalizeName(p.property_name)}`;
      if (!propertyMap.has(key)) propertyMap.set(key, p);
    }

    const details = [];
    const errors = [];
    let created = 0;
    let relinked = 0;
    let orphanedFound = 0;

    for (const s of candidates) {
      // Skip if already properly linked to an existing Property
      if (s.source_property_id && propertyIdSet.has(s.source_property_id)) continue;

      // Orphaned: source_property_id is null OR referenced Property doesn't exist
      orphanedFound++;

      try {
        // Look for existing Property matching property_name AND partner_id
        let existingProperty = null;
        if (s.partner_id) {
          const key = `${s.partner_id}|${normalizeName(s.property_name)}`;
          existingProperty = propertyMap.get(key) || null;
        }

        if (existingProperty) {
          // Link submission to existing Property — no new Property created
          await base44.asServiceRole.entities.PropertySubmission.update(s.id, {
            source_property_id: existingProperty.id,
          });
          relinked++;
          details.push({ submission_id: s.id, action: "relinked", property_id: existingProperty.id });
        } else {
          // Create new Property from submission data
          const propertyData = buildPropertyData(s, { source: "reconciliation" });
          const newProperty = await base44.asServiceRole.entities.Property.create(propertyData);
          await base44.asServiceRole.entities.PropertySubmission.update(s.id, {
            source_property_id: newProperty.id,
          });
          created++;
          details.push({ submission_id: s.id, action: "created", property_id: newProperty.id });
        }
      } catch (err) {
        errors.push({ submission_id: s.id, error: err.message });
      }
    }

    // 2. Detect orphaned active Properties (status=active, no Supabase link) for admin triage.
    //    We DO NOT auto-sync them — admins decide case-by-case via the Orphaned Properties
    //    Report in Admin Hub to avoid accidentally publishing historical/offline inventory.
    const orphanProperties = allProperties.filter(p =>
      p.status === "active" &&
      (!p.supabase_property_id || p.supabase_property_id === "null" || p.supabase_property_id === "undefined")
    );
    for (const p of orphanProperties) {
      console.log(`[reconcilePropertySubmissions] ORPHAN: "${p.property_name}" (${p.id}) partner=${p.partner_name || "—"} created=${p.created_date}`);
    }
    if (orphanProperties.length > 0) {
      try {
        const dedupKey = "orphan_properties_report";
        const existing = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
        if (!existing || existing.length === 0) {
          await base44.asServiceRole.entities.PortalNotification.create({
            recipient_email: "buck@theonehundredcollection.com",
            recipient_role: "admin",
            type: "general",
            title: `${orphanProperties.length} orphaned properties need Supabase sync review`,
            message: `${orphanProperties.length} active Base44 Properties have no Supabase link. Review them in Admin Hub → Orphaned Properties and sync case-by-case.`,
            is_read: false,
            dedup_key: dedupKey,
            link: "/admin/hub?tab=orphans",
          });
        }
      } catch (e) {
        console.warn("[reconcilePropertySubmissions] failed to create orphan alert notification:", e?.message);
      }
    }

    // 3. Detect orphaned Partners — Base44 Partner records with no matching row
    //    in the Supabase partners table. Same safety pattern as orphan Properties:
    //    log + notify, but DO NOT auto-sync. Admins triage case-by-case via the
    //    Orphaned Partners section in Admin Hub → Orphaned Properties tab.
    let orphanPartnersDetected = 0;
    try {
      const supabase = getSupabase();
      const { data: supabasePartners } = await supabase
        .from('partners')
        .select('id, partner_name, primary_contact_email, base44_partner_id');

      const supaByB44Id = new Set();
      const supaEmails = new Set();
      const supaNames = new Set();
      for (const sp of (supabasePartners || [])) {
        if (sp.base44_partner_id) supaByB44Id.add(sp.base44_partner_id);
        if (sp.primary_contact_email) supaEmails.add(sp.primary_contact_email.toLowerCase());
        if (sp.partner_name) supaNames.add(normalizeName(sp.partner_name));
      }

      const orphanPartnerRecords = (allPartners as any[]).filter(p =>
        !supaByB44Id.has(p.id) &&
        !(p.primary_contact_email && supaEmails.has(p.primary_contact_email.toLowerCase())) &&
        !(p.partner_name && supaNames.has(normalizeName(p.partner_name)))
      );
      orphanPartnersDetected = orphanPartnerRecords.length;
      for (const p of orphanPartnerRecords) {
        console.log(`[reconcilePropertySubmissions] ORPHAN PARTNER: "${p.partner_name}" (${p.id}) email=${p.primary_contact_email || "—"} created=${p.created_date}`);
      }
      if (orphanPartnersDetected > 0) {
        try {
          const dedupKey = "orphan_partners_report";
          const existing = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
          if (!existing || existing.length === 0) {
            await base44.asServiceRole.entities.PortalNotification.create({
              recipient_email: "buck@theonehundredcollection.com",
              recipient_role: "admin",
              type: "general",
              title: `${orphanPartnersDetected} partner${orphanPartnersDetected === 1 ? "" : "s"} need Supabase sync review`,
              message: `${orphanPartnersDetected} Base44 Partner record${orphanPartnersDetected === 1 ? " has" : "s have"} no matching Supabase partner. Review in Admin Hub → Orphaned Properties → Orphaned Partners and sync case-by-case.`,
              is_read: false,
              dedup_key: dedupKey,
              link: "/admin/hub?tab=orphans",
            });
          }
        } catch (e) {
          console.warn("[reconcilePropertySubmissions] failed to create orphan partner alert notification:", e?.message);
        }
      }
    } catch (e) {
      console.warn("[reconcilePropertySubmissions] orphan partner detection failed:", e?.message);
    }

    const summary = {
      success: true,
      orphaned_found: orphanedFound,
      created,
      relinked_to_existing: relinked,
      orphans_detected: orphanProperties.length,
      orphan_partners_detected: orphanPartnersDetected,
      errors,
      details,
    };

    console.log("[reconcilePropertySubmissions]", JSON.stringify(summary));

    return Response.json(summary);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});