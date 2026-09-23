// Parse a theonehundredcollection.com property URL into a human-readable
// market and property name. URL shape:
//   /destinations/{market-slug}/{property-slug}
// e.g. /destinations/park-city/abode-at-buena-vista -> "Park City" / "Abode at Buena Vista"
export function parseFeaturedPropertyUrl(url) {
  const empty = { market: "", name: "" };
  if (!url || typeof url !== "string") return empty;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const destIdx = parts.findIndex((p) => p === "destinations");
    if (destIdx === -1 || parts.length < destIdx + 3) return empty;
    const marketSlug = parts[destIdx + 1];
    const propertySlug = parts[destIdx + 2];
    return {
      market: titleCaseSlug(marketSlug),
      name: titleCaseSlug(propertySlug),
    };
  } catch {
    return empty;
  }
}

function titleCaseSlug(slug) {
  return slug
    .split("-")
    .map((w) => {
      if (!w) return "";
      const lower = w.toLowerCase();
      if (lower === "st") return "St.";
      if (lower === "30a") return "30A";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .trim();
}