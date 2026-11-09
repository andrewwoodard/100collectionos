const htmlRes = await fetch("https://the100collection.com/destinations/finger-lakes");
console.log("page", htmlRes.status);
const html = await htmlRes.text();
console.log("blob in html", html.includes("wlanvgc30ci6hwzc"));
console.log("Down on the Bluff", html.includes("Down on the Bluff"));

const imgRes = await fetch(
  "https://wlanvgc30ci6hwzc.public.blob.vercel-storage.com/properties/1793728951244-4d8ebac6.jpg",
  { method: "HEAD" }
);
console.log(
  "blob image",
  imgRes.status,
  imgRes.headers.get("content-type"),
  "cors",
  imgRes.headers.get("access-control-allow-origin")
);

// Simulate property-map filter
const api = await (
  await fetch(
    "https://the100collection.com/api/base44-sync/destination-properties?slug=finger-lakes"
  )
).json();

function normalizeComparableName(value) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function listingUrlsMatch(a, b) {
  const na = (a || "").replace(/\/+$/, "").toLowerCase();
  const nb = (b || "").replace(/\/+$/, "").toLowerCase();
  return Boolean(na && nb && na === nb);
}

function supabaseListingUrlMatchesPropertyLink(row, propertyLink) {
  const link = propertyLink?.trim();
  if (!link) return false;
  for (const raw of [row.vrm_url, row.url]) {
    const t = raw?.trim();
    if (!t) continue;
    if (t === link || listingUrlsMatch(t, link)) return true;
  }
  return false;
}

const showcaseItem = {
  name: "Down on the Bluff",
  propertyLink:
    "https://www.lingerhospitality.com/vacation-rental-search/down-on-the-bluff",
  slug: { current: "down-on-the-bluff" },
};

const match = api.rows.some(
  (sp) =>
    sp.active !== false &&
    supabaseListingUrlMatchesPropertyLink(sp, showcaseItem.propertyLink) &&
    normalizeComparableName(sp.name ?? "") ===
      normalizeComparableName(showcaseItem.name)
);
console.log("would pass property-map filter?", match);
console.log(
  "matching row",
  api.rows
    .filter((sp) => normalizeComparableName(sp.name) === "down on the bluff")
    .map((r) => ({ name: r.name, vrm: r.vrm_url, url: r.url, active: r.active }))
);
