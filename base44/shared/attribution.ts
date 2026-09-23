// UTM tagging for outbound email CTA links.
// Appends utm_source=email + utm_medium + utm_campaign, preserving any query
// params already on the URL (so manually-tagged links are not clobbered).

export function withUtm(url: string, medium?: string, campaign?: string): string {
  if (!url) return url;
  try {
    const u = new URL(url, "https://100c-os.base44.app");
    if (!u.searchParams.get("utm_source")) u.searchParams.set("utm_source", "email");
    if (!u.searchParams.get("utm_medium")) u.searchParams.set("utm_medium", medium || "email");
    if (!u.searchParams.get("utm_campaign")) u.searchParams.set("utm_campaign", campaign || medium || "email");
    return u.toString();
  } catch (_) {
    return url;
  }
}