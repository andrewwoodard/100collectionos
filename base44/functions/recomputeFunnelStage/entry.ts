/**
 * recomputeFunnelStage
 *
 * Called by entity automation on PartnerOnboarding create/update.
 * Also callable directly for manual recompute or batch backfill.
 *
 * Join key: partner_id on PartnerOnboarding (FK → Partner.id).
 * Falls back to case-insensitive name match if partner_id is missing.
 *
 * Payload options:
 *   { event, data }     — entity automation format
 *   { all: true }       — recompute all (admin only)
 *   { partner_ids: [] } — batch by partner IDs
 *   { onboarding_id }   — single by PartnerOnboarding ID
 *   { partner_id }      — single by Partner ID
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FUNNEL_STAGES = ["approved", "contracted", "content", "build", "listed"];
const STAGE_ORDER = { approved: 0, contracted: 1, content: 2, build: 3, listed: 4 };

const SUBTASKS = [
  { field: "contract_sent",                stage: "contracted" },
  { field: "contract_signed",              stage: "contracted" },
  { field: "stripe_added",                 stage: "contracted" },
  { field: "onboarding_fee_invoiced",      stage: "contracted" },
  { field: "onboarding_fee_paid",          stage: "contracted" },
  { field: "kickoff_email_sent",           stage: "contracted" },
  { field: "partner_folder_created",       stage: "content" },
  { field: "intake_form_done",             stage: "content" },
  { field: "post_call_recap",              stage: "content" },
  { field: "writer_interview",             stage: "content" },
  { field: "writeup_completed",            stage: "content" },
  { field: "destination_writeup_approved", stage: "content" },
  { field: "properties_given",             stage: "build" },
  { field: "analytics_given",              stage: "build" },
  { field: "gtag_given",                   stage: "build" },
  { field: "website_access_given",         stage: "build" },
  { field: "proud_header_mockup",          stage: "build" },
  { field: "proud_header_added",           stage: "build" },
  { field: "vrm_landing_page",             stage: "build" },
  { field: "fully_live",                   stage: "listed" },
  { field: "live_email_sent",              stage: "listed" },
];

const DONE_VALUES = ["Complete", "Waived", "Yes"];

function isDone(value) {
  return DONE_VALUES.includes(value);
}

function resolveFunnelStage(row) {
  const stagesWithTasks = ["contracted", "content", "build", "listed"];
  for (const stage of stagesWithTasks) {
    const tasks = SUBTASKS.filter(t => t.stage === stage);
    const allDone = tasks.every(t => isDone(row[t.field]));
    if (!allDone) return stage;
  }
  return "listed";
}

function getStageBreakdown(row) {
  const breakdown = {};
  for (const stage of FUNNEL_STAGES) {
    const tasks = SUBTASKS.filter(t => t.stage === stage);
    const done = tasks.filter(t => isDone(row[t.field])).length;
    breakdown[stage] = { total: tasks.length, done };
  }
  return breakdown;
}

async function findPartner(base44, onboardingRow) {
  // Primary join: partner_id FK
  if (onboardingRow.partner_id) {
    const partner = await base44.asServiceRole.entities.Partner.get(onboardingRow.partner_id);
    if (partner) return partner;
  }

  // Fallback: case-insensitive, whitespace-normalized name match
  if (onboardingRow.partner_name) {
    const normalize = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const target = normalize(onboardingRow.partner_name);
    const allPartners = await base44.asServiceRole.entities.Partner.list();
    const match = allPartners.find(p => normalize(p.partner_name) === target);
    if (match) return match;
  }

  return null;
}

async function recomputeForOnboardingRow(base44, onboardingRow) {
  const partner = await findPartner(base44, onboardingRow);

  if (!partner) {
    return {
      skipped: true,
      reason: `No Partner found for onboarding row: partner_id=${onboardingRow.partner_id}, partner_name="${onboardingRow.partner_name}"`,
    };
  }

  const currentStage = partner.funnel_stage;
  const computedStage = resolveFunnelStage(onboardingRow);
  const breakdown = getStageBreakdown(onboardingRow);

  // No-regression rule
  const currentOrder = STAGE_ORDER[currentStage] ?? -1;
  const computedOrder = STAGE_ORDER[computedStage] ?? 0;

  let finalStage = computedStage;
  let isRegression = false;

  if (currentStage === "listed" && computedOrder < STAGE_ORDER["listed"]) {
    finalStage = "listed";
    isRegression = true;
  }

  const updatePayload = { funnel_stage: finalStage };
  if (isRegression) {
    updatePayload.funnel_stage_regression = true;
  } else if (partner.funnel_stage_regression && computedStage === "listed") {
    updatePayload.funnel_stage_regression = false;
  }

  await base44.asServiceRole.entities.Partner.update(partner.id, updatePayload);

  if (isRegression) {
    await base44.asServiceRole.entities.ActivityLog.create({
      action: "funnel_regression_flagged",
      entity_type: "Partner",
      entity_id: partner.id,
      entity_name: partner.partner_name,
      partner_id: partner.id,
      partner_name: partner.partner_name,
      performed_by: "system",
      details: `Regression detected: computed stage '${computedStage}' is behind current stage 'listed'. Kept as 'listed'. Ops review required.`,
    });
  }

  return {
    partner_name: partner.partner_name,
    partner_id: partner.id,
    onboarding_partner_name: onboardingRow.partner_name,
    previous_stage: currentStage,
    computed_stage: computedStage,
    final_stage: finalStage,
    regression: isRegression,
    breakdown,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Entity automation payload
    if (body.event && body.data) {
      const result = await recomputeForOnboardingRow(base44, body.data);
      return Response.json({ results: [result] });
    }

    // All direct invocations require auth
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (body.all) {
      if (user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });
      const allRows = await base44.asServiceRole.entities.PartnerOnboarding.list();
      const results = await Promise.all(allRows.map(row => recomputeForOnboardingRow(base44, row)));
      return Response.json({ results });
    }

    if (body.partner_ids) {
      const results = [];
      for (const pid of body.partner_ids) {
        const rows = await base44.asServiceRole.entities.PartnerOnboarding.filter({ partner_id: pid });
        if (rows.length > 0) {
          results.push(await recomputeForOnboardingRow(base44, rows[0]));
        } else {
          const partner = await base44.asServiceRole.entities.Partner.get(pid);
          results.push({ partner_name: partner?.partner_name, skipped: true, reason: "no FunnelTracker row" });
        }
      }
      return Response.json({ results });
    }

    if (body.onboarding_id) {
      const row = await base44.asServiceRole.entities.PartnerOnboarding.get(body.onboarding_id);
      const result = await recomputeForOnboardingRow(base44, row);
      return Response.json({ results: [result] });
    }

    if (body.partner_id) {
      const rows = await base44.asServiceRole.entities.PartnerOnboarding.filter({ partner_id: body.partner_id });
      if (rows.length === 0) {
        const partner = await base44.asServiceRole.entities.Partner.get(body.partner_id);
        return Response.json({ results: [{ partner_name: partner?.partner_name, skipped: true, reason: "no FunnelTracker row" }] });
      }
      const result = await recomputeForOnboardingRow(base44, rows[0]);
      return Response.json({ results: [result] });
    }

    return Response.json({ error: "No target specified." }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});