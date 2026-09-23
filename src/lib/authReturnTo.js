// Shared by the auth pages (Login, Register, and any page that resumes a flow
// after sign-in, e.g. the MCP OAuth consent page). Keep the redirect
// validation in one place — it is security-sensitive and easy to drift.

// Resolve ?returnTo= to a safe same-origin path, else "/".
//
// The same-origin check alone is not enough: a value like /.//evil.com or
// /\evil.com parses same-origin but normalizes to a protocol-relative
// //evil.com when assigned to location.href — an open redirect. So require the
// resolved path to be exactly one leading slash (no "//" prefix, no backslash).
export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    // Strip app-bootstrap params: app-params.js persists these from the URL into
    // localStorage before the SDK initializes, so a crafted returnTo could
    // otherwise poison the freshly issued session — repointing the app at an
    // attacker's backend (app_base_url/app_id/functions_version) or overwriting
    // the token. Normal app-flow params (e.g. the OAuth consent ctx) are kept.
    // The full app-params.js bootstrap set (src/lib/app-params.js) — any of
    // these in a crafted returnTo would be persisted at next load.
    for (const p of ["access_token", "clear_access_token", "app_id", "app_base_url", "functions_version", "from_url"]) {
      url.searchParams.delete(p);
    }
    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}

// Maps the ?redirect= param on the signup page to a post-signup destination.
// vrm -> the property-manager application form (/apply/property-manager);
// homeowner -> the homeowner application form (/apply/homeowner). Falls back
// to safeReturnTo() (the ?returnTo= path or "/") when no redirect param is
// present, preserving the existing post-login resume (e.g. MCP OAuth consent).
export function signupDestination() {
  const raw = new URLSearchParams(window.location.search).get("redirect");
  if (raw === "vrm") return "/apply/property-manager";
  if (raw === "homeowner") return "/apply/homeowner";
  return safeReturnTo();
}

// Returns the signup segment ("vrm" | "homeowner") when the signup page was
// opened with a ?redirect= param, else null. Used to tag the auto-created
// PartnerApplication stub.
export function signupSegment() {
  const raw = new URLSearchParams(window.location.search).get("redirect");
  if (raw === "vrm") return "vrm";
  if (raw === "homeowner") return "homeowner";
  return null;
}