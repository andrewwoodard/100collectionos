// Test/sample partner names that must never appear in public-facing social
// proof, partner strips, or featured-property sections. Applied everywhere
// partner data is rendered publicly (/apply pages and any marketing surface
// pulling from the same source).

export const TEST_PARTNER_DENYLIST = [
  'Scottsville',
  'New Test Co',
  'Downtown Mall',
  'Scenic Stays',
  'Andrea Bochelli',
  'Andrew Booth Woodard',
  'Test Villa Estate',
];

// True when a partner name should be excluded from public surfaces:
// exact/partial denylist match, names starting with "test", or containing
// "sample" (all case-insensitive).
export function isTestPartner(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return true;
  if (TEST_PARTNER_DENYLIST.some((d) => d.toLowerCase() === n || n.includes(d.toLowerCase()))) return true;
  if (n.startsWith('test')) return true;
  if (n.includes('sample')) return true;
  return false;
}