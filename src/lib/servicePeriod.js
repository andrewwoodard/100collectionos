/**
 * Service period helpers for one-time invoices.
 * An invoice can be sent today but cover a period starting on a chosen date
 * (e.g. Dec 23, 2026 → Dec 23, 2027). Dates are handled as UTC noon so the
 * calendar day never shifts with the viewer's timezone.
 */

export function servicePeriodEnd(startStr, interval = "year") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startStr || ""))) return null;
  const end = new Date(`${startStr}T12:00:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  if (interval === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

function fmt(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Dec 23, 2026 – Dec 23, 2027", or "" when no valid start date. */
export function servicePeriodLabel(startStr, interval = "year") {
  const end = servicePeriodEnd(startStr, interval);
  if (!end) return "";
  return `${fmt(new Date(`${startStr}T12:00:00Z`))} – ${fmt(end)}`;
}
