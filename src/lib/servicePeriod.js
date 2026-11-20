/**
 * Service period helpers for one-time invoices.
 * An invoice can be sent today but cover any period (e.g. Dec 23, 2026 → Dec 23, 2027,
 * or a custom start/end). Dates are handled as UTC noon so the calendar day never
 * shifts with the viewer's timezone.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parse(str) {
  if (!DATE_ONLY.test(String(str || ""))) return null;
  const d = new Date(`${str}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Standard end for an interval: same day one year / one month later. */
export function servicePeriodEnd(startStr, interval = "year") {
  const end = parse(startStr);
  if (!end) return null;
  if (interval === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

function fmt(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * "Dec 23, 2026 – Dec 23, 2027". Uses the custom end date when given,
 * otherwise one interval after the start. "" when the dates aren't valid.
 */
export function servicePeriodLabel(startStr, interval = "year", endStr = "") {
  const start = parse(startStr);
  if (!start) return "";
  const end = endStr ? parse(endStr) : servicePeriodEnd(startStr, interval);
  if (!end || end <= start) return "";
  return `${fmt(start)} – ${fmt(end)}`;
}

/** True when a custom end date is set and is a valid range after the start. */
export function isValidCustomPeriod(startStr, endStr) {
  const start = parse(startStr);
  const end = parse(endStr);
  return Boolean(start && end && end > start);
}

/**
 * Length of the period relative to one standard interval (1.0 = exactly a year / month).
 * Used to prorate a flat price to a custom range.
 */
export function servicePeriodFraction(startStr, endStr, interval = "year") {
  const start = parse(startStr);
  const end = parse(endStr);
  const standardEnd = servicePeriodEnd(startStr, interval);
  if (!start || !end || !standardEnd || end <= start) return 1;
  return (end - start) / (standardEnd - start);
}
