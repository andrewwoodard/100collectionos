import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { isTestPartner } from '../../shared/testDenylist.ts';

// Public, read-only partner list for the "Trusted by partners" logo grid on
// /join. Returns real partner managers / hospitality groups only, sorted by
// total property portfolio size (desc) then name (asc) so the marquee
// partners (Sea Mountain, Akers Ellis, CoralTree, Holiday Isle, ...) appear
// first. CoralTree is status 'approved' (operating but not yet 'live'), so
// 'approved' is included alongside 'live' / 'live_non_renewed'. Test and
// sample partners are excluded. Names are normalized (non-breaking spaces
// collapsed) so the property-count join matches across data sources.

const ACTIVE_STATUSES = ['live', 'live_non_renewed', 'approved'];
const GRID_TYPES = ['property_manager', 'hospitality_group'];

const norm = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const cleanName = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const [partners, properties] = await Promise.all([
      base44.asServiceRole.entities.Partner.list('-created_date', 500),
      base44.asServiceRole.entities.Property.list('-created_date', 1000),
    ]);

    // Total property portfolio per partner (any status), keyed by normalized
    // partner_name — the denormalized join key shared by both entities.
    const counts = new Map();
    for (const p of properties || []) {
      const key = norm(p.partner_name);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const ranked = (partners || [])
      .filter((p) =>
        ACTIVE_STATUSES.includes(p.status) &&
        GRID_TYPES.includes(p.partner_type) &&
        p.is_sample !== true &&
        !isTestPartner(p.partner_name)
      )
      .map((p) => ({
        partner_name: cleanName(p.partner_name),
        logo_url: p.logo_url || null,
        count: counts.get(norm(p.partner_name)) || 0,
      }))
      .sort((a, b) => (b.count - a.count) || a.partner_name.localeCompare(b.partner_name))
      .slice(0, 18)
      .map(({ partner_name, logo_url }) => ({ partner_name, logo_url }));

    return Response.json({ partners: ranked });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}