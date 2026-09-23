// Attribution capture + inference for cold signups and applications.
// First/last/session touches are written to storage by useAttributionCapture;
// this module reads them back, infers a human-readable source label, and
// formats a multi-touch tooltip for the admin queue.

const FIRST_TOUCH_KEY = "100c_first_touch";
const LAST_TOUCH_KEY = "100c_last_touch";
const SESSION_TOUCH_KEY = "100c_session_touch";

const OWN_DOMAINS = ["theonehundredcollection.com", "100c-os.base44.app"];
const SEARCH_ENGINES = [
  { host: "google.", label: "Google" },
  { host: "bing.com", label: "Bing" },
  { host: "yahoo.com", label: "Yahoo" },
  { host: "duckduckgo.com", label: "DuckDuckGo" },
  { host: "baidu.com", label: "Baidu" },
];
const SOCIAL_DOMAINS = [
  { host: "instagram.com", label: "Instagram" },
  { host: "facebook.com", label: "Facebook" },
  { host: "linkedin.com", label: "LinkedIn" },
  { host: "twitter.com", label: "Twitter/X" },
  { host: "x.com", label: "Twitter/X" },
  { host: "tiktok.com", label: "TikTok" },
  { host: "youtube.com", label: "YouTube" },
  { host: "pinterest.com", label: "Pinterest" },
];
const EMAIL_REFERRER_SIGNALS = [
  "mail.google.com", "gmail.com", "outlook.", "outlook.live.com",
  "mail.yahoo.com", "webmail", "google.com/url",
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
}

function parseUtms(search) {
  const params = new URLSearchParams(search || "");
  return {
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || "",
    utm_term: params.get("utm_term") || "",
    src: params.get("src") || "",
  };
}

// Snapshot the current page's referrer + UTM params + landing path.
export function captureTouch() {
  const referrer =
    typeof document !== "undefined" && document.referrer ? document.referrer : "";
  const utms = parseUtms(typeof window !== "undefined" ? window.location.search : "");
  return {
    referrer,
    utm_source: utms.utm_source,
    utm_medium: utms.utm_medium,
    utm_campaign: utms.utm_campaign,
    utm_content: utms.utm_content,
    utm_term: utms.utm_term,
    src: utms.src,
    landing_path: typeof window !== "undefined" ? window.location.pathname : "",
    captured_at: new Date().toISOString(),
  };
}

// Infer a human-readable source label from a single touch.
export function inferSourceLabel(touch) {
  if (!touch) return "Unknown (pre-tracking)";
  const refHost = hostnameOf(touch.referrer);
  const utmSource = (touch.utm_source || touch.src || "").toLowerCase();
  const utmMedium = (touch.utm_medium || "").toLowerCase();
  const utmCampaign = touch.utm_campaign || "";

  if (utmSource === "email" || utmMedium === "email") {
    return utmCampaign ? `Email — ${utmCampaign}` : "Email click";
  }
  if (utmSource === "ad" || utmMedium === "cpc" || utmMedium === "paid") {
    return utmCampaign ? `Paid ad — ${utmCampaign}` : "Paid ad";
  }
  if (refHost && EMAIL_REFERRER_SIGNALS.some((s) => refHost.includes(s))) {
    return "Email click";
  }
  if (refHost && OWN_DOMAINS.some((d) => refHost.includes(d))) {
    return `Public website — ${refHost}`;
  }
  const se = SEARCH_ENGINES.find((s) => refHost.includes(s.host));
  if (se) return `Organic search — ${se.label}`;
  const so = SOCIAL_DOMAINS.find((s) => refHost.includes(s.host));
  if (so) return `Social — ${so.label}`;
  if (!refHost) return "Direct or bookmark";
  return `Referrer: ${refHost}`;
}

// Returns { first_touch, last_touch, session_touch, source_label }.
// source_label is inferred from the most recent touch available.
export function getAttributionSnapshot() {
  let firstTouch = null;
  let lastTouch = null;
  let sessionTouch = null;
  try {
    firstTouch = JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || "null");
  } catch (_) {}
  try {
    lastTouch = JSON.parse(localStorage.getItem(LAST_TOUCH_KEY) || "null");
  } catch (_) {}
  try {
    sessionTouch = JSON.parse(sessionStorage.getItem(SESSION_TOUCH_KEY) || "null");
  } catch (_) {}
  const basis = sessionTouch || lastTouch || firstTouch;
  return {
    first_touch: firstTouch,
    last_touch: lastTouch,
    session_touch: sessionTouch,
    source_label: inferSourceLabel(basis),
  };
}

// Tailwind tone class for a source label (used by admin queue pills).
export function sourceToneClass(label) {
  if (!label || label.startsWith("Unknown")) {
    return "bg-slate-50 border-slate-200 text-slate-500";
  }
  const l = label.toLowerCase();
  if (l.startsWith("email") || l.startsWith("paid ad")) {
    return "bg-amber-50 border-amber-200 text-amber-700";
  }
  if (l.startsWith("public website")) {
    return "bg-[#0D1B2A]/8 border-[#0D1B2A]/15 text-[#0D1B2A]";
  }
  if (l.startsWith("organic")) {
    return "bg-slate-100 border-slate-200 text-slate-600";
  }
  if (l.startsWith("social")) {
    return "bg-blue-50 border-blue-200 text-blue-700";
  }
  return "bg-slate-50 border-slate-200 text-slate-600";
}

// Format the full snapshot as a multi-line string for a native tooltip.
export function formatAttributionTooltip(snapshot) {
  if (!snapshot) return "";
  const lines = [];
  const fmt = (touch, label) => {
    if (!touch) return;
    lines.push(`${label}:`);
    lines.push(`  source: ${inferSourceLabel(touch)}`);
    if (touch.referrer) lines.push(`  referrer: ${touch.referrer}`);
    if (touch.utm_source) lines.push(`  utm_source: ${touch.utm_source}`);
    if (touch.utm_medium) lines.push(`  utm_medium: ${touch.utm_medium}`);
    if (touch.utm_campaign) lines.push(`  utm_campaign: ${touch.utm_campaign}`);
    if (touch.landing_path) lines.push(`  landing: ${touch.landing_path}`);
    if (touch.captured_at) {
      lines.push(`  when: ${new Date(touch.captured_at).toLocaleString()}`);
    }
  };
  fmt(snapshot.first_touch, "First touch");
  fmt(snapshot.last_touch, "Last touch");
  return lines.join("\n");
}