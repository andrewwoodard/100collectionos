import React from "react";

// Auto-transform snake_case / lowercase → Title Case
function toTitleCase(str) {
  if (!str) return "";
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

const VARIANT_STYLES = {
  success: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    border: "border-emerald-200",
  },
  info: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    border: "border-blue-200",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    border: "border-amber-200",
  },
  error: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
    border: "border-red-200",
  },
  neutral: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
    border: "border-slate-200",
  },
  brand: {
    bg: "bg-[#C9A96E]/10",
    text: "text-[#8B6A2E]",
    dot: "bg-[#C9A96E]",
    border: "border-[#C9A96E]/30",
  },
};

// Semantic mapping: value → variant
const VALUE_TO_VARIANT = {
  // success
  signed: "success",
  paid: "success",
  approved: "success",
  active: "success",
  live: "success",
  live_non_renewed: "warning",
  listed: "success",
  complete: "success",
  yes: "success",
  published: "success",
  // info
  sent: "info",
  under_review: "info",
  contracted: "info",
  in_progress: "info",
  submitted: "info",
  vetting: "info",
  invoiced: "info",
  invited: "info",
  onboarding: "info",
  // warning
  pending: "warning",
  draft: "warning",
  needs_revision: "warning",
  partner_reviewing: "warning",
  waiting: "warning",
  interview_invited: "warning",
  not_started: "warning",
  // error
  rejected: "error",
  overdue: "error",
  cancelled: "error",
  expired: "error",
  inactive: "error",
  failed: "error",
  no: "error",
  blocked: "error",
  void: "error",
  paused: "error",
  // neutral
  archived: "neutral",
  unattributed: "neutral",
  internal: "neutral",
  other: "neutral",
  miscellaneous: "neutral",
  none: "neutral",
  not_setup: "neutral",
  lead: "neutral",
};

/**
 * StatusPill — single canonical status pill component.
 *
 * Props:
 *   variant:  'success' | 'info' | 'warning' | 'error' | 'neutral' | 'brand'
 *             If omitted, auto-derived from `value` using VALUE_TO_VARIANT map.
 *   label:    Display label (auto Title-Cased).
 *   value:    Raw status string (used for auto-variant if `variant` not set).
 *   icon:     Optional ReactNode leading icon (overrides dot).
 *   dot:      Show leading dot (default true when no icon).
 *   size:     'sm' (default) | 'md'
 */
export default function StatusPill({ variant, label, value, icon, dot = true, size = "sm" }) {
  // Derive variant from value if not explicitly set
  const resolvedVariant = variant || VALUE_TO_VARIANT[(value || label || "").toLowerCase().replace(/ /g, "_")] || "neutral";
  const styles = VARIANT_STYLES[resolvedVariant] || VARIANT_STYLES.neutral;

  const displayLabel = toTitleCase(label || value || "");

  const sizeClasses = size === "md"
    ? "text-[13px] px-[10px] py-[4px] gap-1.5"
    : "text-[12px] px-[8px] py-[2px] gap-1";

  return (
    <span className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${styles.bg} ${styles.text} ${styles.border} ${sizeClasses}`}>
      {icon ? (
        <span className="flex-shrink-0 w-3 h-3">{icon}</span>
      ) : dot ? (
        <span className={`flex-shrink-0 rounded-full ${styles.dot} ${size === "md" ? "w-1.5 h-1.5" : "w-1 h-1"}`} />
      ) : null}
      {displayLabel}
    </span>
  );
}

/**
 * Convenience: derive variant + label from a raw status string.
 * Use: <StatusPill value="needs_revision" />
 */
export { VALUE_TO_VARIANT, toTitleCase };