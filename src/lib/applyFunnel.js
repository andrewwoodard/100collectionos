// Client-side helpers for the /apply funnel tracker.
// Pure utilities (session id, validation, field detection, event shaping)
// plus a fire-and-forget flush. The stateful batching lives in the
// useApplyFunnelTracker hook.

import { getAttributionSnapshot } from "@/lib/attribution";

const FUNNEL_SESSION_KEY = "100c_funnel_session_id";

// App's own backend function endpoint. Used by navigator.sendBeacon during
// page unload (the Base44 SDK invoke is async and won't complete during
// beforeunload). For all other flushes the hook uses base44.functions.invoke.
export const FUNNEL_ENDPOINT = "https://100c-os.base44.app/functions/logFunnelEvent";

export function getOrCreateSessionId() {
  if (typeof window === "undefined") return null;
  try {
    let id = sessionStorage.getItem(FUNNEL_SESSION_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || "f-" + Date.now() + "-" + Math.random().toString(36).slice(2));
      sessionStorage.setItem(FUNNEL_SESSION_KEY, id);
    }
    return id;
  } catch (_) {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(v) {
  return EMAIL_RE.test(String(v || "").trim());
}
export function isValidName(v) {
  const s = String(v || "").trim();
  return s.length >= 2 && /[aeiouy]/i.test(s);
}
export function isValidCompany(v) {
  return String(v || "").trim().length > 0;
}

// Identify a form field from its input element without requiring name attrs.
// Checks input type, then the closest sibling label text, then placeholder.
const LABEL_FIELD_MAP = [
  { re: /full name|your name|^name/i, field: "full_name" },
  { re: /email/i, field: "email" },
  { re: /company name|company/i, field: "company_name" },
  { re: /phone/i, field: "phone" },
  { re: /website/i, field: "website" },
  { re: /location|market/i, field: "property_locations" },
  { re: /how .*hear/i, field: "how_heard" },
  { re: /propert.*count|number of prop/i, field: "property_count" },
  { re: /listing/i, field: "listing_url" },
  { re: /message|anything else|notes/i, field: "message" },
  { re: /role/i, field: "role" },
];

export function detectField(input) {
  if (!input) return "unknown";
  if (input.type === "email") return "email";
  const wrap = input.closest("div");
  const label = wrap?.querySelector("label");
  const labelText = label?.textContent || "";
  if (labelText) {
    for (const m of LABEL_FIELD_MAP) if (m.re.test(labelText)) return m.field;
  }
  const ph = input.placeholder || "";
  if (ph) {
    for (const m of LABEL_FIELD_MAP) if (m.re.test(ph)) return m.field;
  }
  if (input.type === "tel") return "phone";
  if (input.type === "url") return "website";
  if (input.tagName === "TEXTAREA") return "message";
  if (input.tagName === "SELECT") return "select";
  return "field";
}

export function buildEvent({ session_id, event_type, event_data, applicant_type, page_path }) {
  const attribution = getAttributionSnapshot();
  return {
    session_id,
    event_type,
    event_data: event_data || {},
    applicant_type: applicant_type ?? null,
    page_path,
    attribution_source_label: attribution?.source_label || "Unknown (pre-tracking)",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    created_at_client: new Date().toISOString(),
  };
}

// Fire-and-forget via sendBeacon (used during page unload). Returns true if
// the browser queued the send.
export function beaconFlush(events) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon || !events.length) return false;
  try {
    const blob = new Blob([JSON.stringify({ events })], { type: "application/json" });
    return navigator.sendBeacon(FUNNEL_ENDPOINT, blob);
  } catch (_) {
    return false;
  }
}