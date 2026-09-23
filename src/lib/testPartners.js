// Frontend mirror of base44/shared/testDenylist.ts. Keeps test/sample partners
// off public surfaces (/join logo grid, social proof). Kept in sync with the
// shared module so the public filter is self-contained on the client.

export const TEST_PARTNER_DENYLIST = [
  "Scottsville",
  "New Test Co",
  "Downtown Mall",
  "Scenic Stays",
  "Andrea Bochelli",
  "Andrew Booth Woodard",
  "Test Villa Estate",
];

// True when a partner name should be excluded from public surfaces.
export function isTestPartner(name) {
  const n = String(name || "").toLowerCase().trim();
  if (!n) return true;
  if (TEST_PARTNER_DENYLIST.some((d) => n === d.toLowerCase() || n.includes(d.toLowerCase())))
    return true;
  if (n.startsWith("test")) return true;
  if (n.includes("sample")) return true;
  return false;
}