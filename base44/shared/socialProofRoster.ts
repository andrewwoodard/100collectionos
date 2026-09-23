// Curated roster of real partners approved for PUBLIC social proof on /apply
// and other public marketing surfaces. The partner directory also contains a
// bulk-imported marketing-site sync (many rows with no portal users or
// contacts) that must never leak into public social proof — data alone cannot
// distinguish those rows, so this explicit roster is the source of truth.
//
// Safety rules:
// - A name is only ever rendered if a REAL Partner row exists that is on this
//   roster AND passes the test denylist. Nothing is invented or padded.
// - Adding a partner here only makes it eligible; it still must exist as a
//   live/approved professional Partner row to appear.

export const PUBLIC_PARTNER_ROSTER = [
  'coraltree residence collection',
  'akers ellis real estate & rentals',
  'sea mountain vacations',
  'southern comfort cabin rentals',
  'stay charlottesville',
  'suches vacation rentals',
  'clemson vacation rentals',
  'holiday isle properties',
  'sea scape properties',
  'blue cedar partners',
];

export function isOnPublicRoster(name) {
  const n = String(name || '').replace(/\s+/g, ' ').toLowerCase().trim();
  return PUBLIC_PARTNER_ROSTER.includes(n);
}