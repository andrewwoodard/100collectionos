/**
 * Canonical Funnel Configuration
 * Single source of truth for the partner onboarding funnel model.
 *
 * DB field keys on PartnerOnboarding are intentionally NOT renamed — see backlog:
 * "Rename PartnerOnboarding DB fields to canonical names — deferred from canonical funnel refactor"
 */

export const FUNNEL_STAGES = ["approved", "contracted", "content", "build", "listed"];

export const STAGE_LABELS = {
  approved: "Approved",
  contracted: "Contracted",
  content: "Content",
  build: "Build",
  listed: "Listed",
};

/**
 * Each subtask: { field, label, stage, responsibleParty }
 * field = actual DB key on PartnerOnboarding
 * label = canonical display name
 * stage = one of FUNNEL_STAGES
 * responsibleParty = "us" | "partner" | "either"
 */
export const SUBTASKS = [
  // Contracted (6)
  { field: "contract_sent",          label: "Contract Sent",                stage: "contracted", responsibleParty: "us" },
  { field: "contract_signed",        label: "Contract Signed",              stage: "contracted", responsibleParty: "partner" },
  { field: "stripe_added",           label: "Stripe Setup",                 stage: "contracted", responsibleParty: "us" },
  { field: "onboarding_fee_invoiced",label: "Fee Invoiced",                 stage: "contracted", responsibleParty: "us" },
  { field: "onboarding_fee_paid",    label: "Fee Paid",                     stage: "contracted", responsibleParty: "partner" },
  { field: "kickoff_email_sent",     label: "Kickoff Email",                stage: "contracted", responsibleParty: "us" },

  // Content (6)
  { field: "partner_folder_created", label: "Content Folder Created",       stage: "content", responsibleParty: "us" },
  { field: "intake_form_done",       label: "Intake Form Returned",         stage: "content", responsibleParty: "partner" },
  { field: "post_call_recap",        label: "Post-Call Recap Sent",         stage: "content", responsibleParty: "us" },
  { field: "writer_interview",       label: "Writer Interview Complete",    stage: "content", responsibleParty: "either" },
  { field: "writeup_completed",      label: "Write-Up Done",                stage: "content", responsibleParty: "us" },
  { field: "destination_writeup_approved", label: "Write-Up Approved",      stage: "content", responsibleParty: "partner" },

  // Build (7)
  { field: "properties_given",       label: "Properties Given",             stage: "build", responsibleParty: "partner" },
  { field: "analytics_given",        label: "Analytics Installed",          stage: "build", responsibleParty: "us" },
  { field: "gtag_given",             label: "GA Tag Added",                 stage: "build", responsibleParty: "us" },
  { field: "website_access_given",   label: "Site Access Granted",          stage: "build", responsibleParty: "partner" },
  { field: "proud_header_mockup",    label: "Header Mock-Up Approved",      stage: "build", responsibleParty: "partner" },
  { field: "proud_header_added",     label: "Header Added",                 stage: "build", responsibleParty: "partner" },
  { field: "vrm_landing_page",       label: "VRM Landing Page Created",     stage: "build", responsibleParty: "us" },

  // Listed (2)
  { field: "fully_live",             label: "Listing Fully Live",           stage: "listed", responsibleParty: "us" },
  { field: "live_email_sent",        label: "Live Announcement Email Sent", stage: "listed", responsibleParty: "us" },
];

/**
 * Static owner assignments for each funnel sub-task column.
 * Team-wide knowledge — not per-partner. Editable by Buck as needed.
 */
export const COLUMN_OWNERS = {
  contract_sent:                "Buck",
  contract_signed:              "Buck",
  stripe_added:                 "Mindy",
  onboarding_fee_invoiced:      "Mindy",
  onboarding_fee_paid:          "Mindy",
  kickoff_email_sent:           "Andrew",
  partner_folder_created:       "Andrew",
  intake_form_done:             "Brittany",
  post_call_recap:              "Brittany",
  writer_interview:             "Brittany",
  writeup_completed:            "Brittany",
  destination_writeup_approved: "Travis",
  properties_given:             "Andrew",
  analytics_given:              "Andrew",
  gtag_given:                   "Andrew",
  website_access_given:         "Andrew",
  proud_header_mockup:          "Andrew",
  proud_header_added:           "Andrew",
  vrm_landing_page:             "Andrew",
  fully_live:                   "Andrew",
  live_email_sent:              "Buck",
};

/** Total canonical subtask count */
export const TOTAL_SUBTASKS = SUBTASKS.length; // 21

/** Subtasks grouped by stage */
export const SUBTASKS_BY_STAGE = FUNNEL_STAGES.reduce((acc, stage) => {
  acc[stage] = SUBTASKS.filter(t => t.stage === stage);
  return acc;
}, {});

/** Values that count as "done" for stage advancement */
const DONE_VALUES = ["Complete", "Waived", "Yes"];

/**
 * Returns true if a subtask value counts as done.
 */
export function isDone(value) {
  return DONE_VALUES.includes(value);
}

/**
 * Resolves the canonical funnel_stage from a PartnerOnboarding row.
 * Does NOT enforce no-regression — caller must do that comparison.
 *
 * Rule: partner is in stage N if all subtasks in stages 1..N-1 are done
 * AND at least one subtask in stage N is not done.
 * When all subtasks across all stages are done → "listed".
 *
 * @param {object} row - PartnerOnboarding record
 * @returns {string} one of FUNNEL_STAGES
 */
export function resolveFunnelStage(row) {
  if (!row) return "approved";

  const stagesWithTasks = ["contracted", "content", "build", "listed"];

  for (const stage of stagesWithTasks) {
    const tasks = SUBTASKS_BY_STAGE[stage];
    const allDone = tasks.every(t => isDone(row[t.field]));
    if (!allDone) return stage;
  }

  // All 21 subtasks are done
  return "listed";
}

/**
 * Returns per-stage breakdown: { stage -> { total, done } }
 */
export function getStageBreakdown(row) {
  const breakdown = {};
  for (const stage of FUNNEL_STAGES) {
    const tasks = SUBTASKS_BY_STAGE[stage] || [];
    const done = tasks.filter(t => isDone(row?.[t.field])).length;
    breakdown[stage] = { total: tasks.length, done };
  }
  return breakdown;
}

/**
 * Returns overall progress: (complete + waived) / 21
 */
export function getOverallProgress(row) {
  if (!row) return 0;
  const doneCount = SUBTASKS.filter(t => isDone(row[t.field])).length;
  return Math.round((doneCount / TOTAL_SUBTASKS) * 100);
}

/**
 * Partner-friendly labels for sub-tasks (used in Portal Overview card)
 */
export const PARTNER_FRIENDLY_LABELS = {
  contract_sent:               "Review your contract",
  contract_signed:             "Sign your contract",
  stripe_added:                "Complete billing setup",
  onboarding_fee_invoiced:     "Onboarding fee invoice sent",
  onboarding_fee_paid:         "Pay your onboarding fee",
  kickoff_email_sent:          "Kickoff email on its way",
  partner_folder_created:      "Your content folder is being set up",
  intake_form_done:            "Complete the intake form",
  post_call_recap:             "Post-call recap being prepared",
  writer_interview:            "Schedule your writer interview",
  writeup_completed:           "Your write-up is in progress",
  destination_writeup_approved:"Review and approve your write-up",
  properties_given:            "Share your property details",
  analytics_given:             "Analytics being installed",
  gtag_given:                  "GA tag being added",
  website_access_given:        "Grant access to your website",
  proud_header_mockup:         "Approve your header mock-up",
  proud_header_added:          "Header is being added",
  vrm_landing_page:            "Landing page being created",
  fully_live:                  "Your listing is going live",
  live_email_sent:             "Launch announcement going out",
};