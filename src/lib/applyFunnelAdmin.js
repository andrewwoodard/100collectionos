// Pure helpers that turn a flat list of ApplyFunnelEvent records into the
// funnel chart, attribution breakdown, and abandoned-session table data
// shown on /admin/apply-funnel. Kept separate from the page so the
// computations are testable and the page stays lean.

const CAPTURED_TYPES = ["email_captured", "name_captured", "company_captured"];

function withinRange(createdDate, rangeDays) {
  if (!rangeDays || rangeDays === "all") return true;
  const t = createdDate ? new Date(createdDate).getTime() : 0;
  return t > 0 && Date.now() - t < rangeDays * 24 * 60 * 60 * 1000;
}

export function filterEvents(events, { rangeDays = 30, pathFilter = "all" }) {
  return events.filter((e) => {
    if (!withinRange(e.created_date, rangeDays)) return false;
    if (pathFilter !== "all" && e.applicant_type !== pathFilter) return false;
    return true;
  });
}

function distinctSessions(events, predicate) {
  const set = new Set();
  for (const e of events) if (predicate(e)) set.add(e.session_id);
  return set.size;
}

export function computeFunnel(events) {
  const total = distinctSessions(events, () => true);
  const stages = [
    {
      label: "Landing page views",
      count: distinctSessions(events, (e) => e.event_type === "page_view"),
    },
    {
      label: "Chose a path",
      count: distinctSessions(events, (e) => e.event_type === "path_selected"),
    },
    {
      label: "Started filling form",
      count: distinctSessions(events, (e) => e.event_type === "field_touched"),
    },
    {
      label: "Captured email",
      count: distinctSessions(events, (e) => e.event_type === "email_captured" || !!e.email),
    },
    {
      label: "Submitted",
      count: distinctSessions(events, (e) => e.event_type === "submitted"),
    },
  ];
  const base = stages[0].count || 1;
  return {
    stages: stages.map((s, i) => ({
      ...s,
      pct: total ? Math.round((s.count / base) * 100) : 0,
      stepPct: i === 0 ? 100 : (stages[i - 1].count ? Math.round((s.count / stages[i - 1].count) * 100) : 0),
    })),
    total,
  };
}

export function computeAttribution(events) {
  const bySource = new Map();
  for (const e of events) {
    const src = e.attribution_source_label || "Unknown";
    if (!bySource.has(src)) bySource.set(src, { source: src, sessions: new Set(), completed: new Set() });
    const bucket = bySource.get(src);
    bucket.sessions.add(e.session_id);
    if (e.event_type === "submitted") bucket.completed.add(e.session_id);
  }
  return [...bySource.values()]
    .map((b) => ({
      source: b.source,
      total: b.sessions.size,
      completed: b.completed.size,
      completionRate: b.sessions.size ? Math.round((b.completed.size / b.sessions.size) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// Aggregate events per session into a single row for the abandoned table.
export function computeSessions(events) {
  const bySession = new Map();
  for (const e of events) {
    if (!bySession.has(e.session_id)) {
      bySession.set(e.session_id, {
        session_id: e.session_id,
        email: null,
        full_name: null,
        company_name: null,
        applicant_type: null,
        submitted: false,
        last_event_type: null,
        last_event_at: null,
        fields_touched: new Set(),
        spam_score: 0,
        ignored: false,
        is_returning: false,
      });
    }
    const s = bySession.get(e.session_id);
    if (e.email) s.email = e.email;
    if (e.full_name) s.full_name = e.full_name;
    if (e.company_name) s.company_name = e.company_name;
    if (e.applicant_type) s.applicant_type = e.applicant_type;
    if (e.event_type === "submitted") s.submitted = true;
    if (e.event_type === "field_touched" && e.event_data?.field_name) s.fields_touched.add(e.event_data.field_name);
    if (e.event_type === "path_selected" && e.event_data?.path_slug) s.fields_touched.add("path:" + e.event_data.path_slug);
    if (e.event_data?.field && CAPTURED_TYPES.includes(e.event_type)) s.fields_touched.add(e.event_data.field);
    s.spam_score = Math.max(s.spam_score, e.spam_score || 0);
    if (e.ignored) s.ignored = true;
    if (e.is_returning) s.is_returning = true;
    const t = e.created_date ? new Date(e.created_date).getTime() : 0;
    if (t > 0 && (!s.last_event_at || t > s.last_event_at)) {
      s.last_event_at = t;
      s.last_event_type = e.event_type;
    }
  }
  return [...bySession.values()].map((s) => ({
    ...s,
    fields_touched: Array.from(s.fields_touched),
  }));
}

export function abandonedRows(sessions, { tab = "all_active", showSpam = false }) {
  // Default view: non-spam, non-ignored sessions that did NOT submit.
  let rows = sessions.filter((s) => !s.submitted);
  if (!showSpam) rows = rows.filter((s) => s.spam_score < 0.5);
  rows = rows.filter((s) => !s.ignored);
  switch (tab) {
    case "email_captured":
      rows = rows.filter((s) => !!s.email);
      break;
    case "just_page_views":
      rows = rows.filter((s) => s.fields_touched.length === 0 && !s.applicant_type);
      break;
    case "started_form":
      rows = rows.filter((s) => s.applicant_type || s.fields_touched.some((f) => !f.startsWith("path:")));
      break;
    case "spam":
      // The Spam tab ignores the showSpam toggle and shows only spam-tagged.
      rows = sessions.filter((s) => !s.submitted && s.spam_score >= 0.5 && !s.ignored);
      break;
    case "all_active":
    default:
      break;
  }
  // Most recent activity first.
  return rows.sort((a, b) => (b.last_event_at || 0) - (a.last_event_at || 0));
}

export function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function applicantLabel(t) {
  return t === "property_manager" ? "Manager" : t === "homeowner" ? "Homeowner" : t === "existing_partner" ? "Existing partner" : "—";
}