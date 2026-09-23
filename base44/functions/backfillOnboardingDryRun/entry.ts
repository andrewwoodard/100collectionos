import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SKIP_IDS = new Set([
  '69d3dc1a26c5d031b3e4caca', // Seabreeze
  '69d3dc1a65994e77eaa6985f', // Stay With Style Scottsdale
  '69d3dc565eb95f3d4ee6ae3b', // Rent in Highlands
  '69d3dc0dc2829eb575b4def2', // Whistler Platinum
  '69d3dc111b2cea2d05245db8', // Nauset Rental
  '69d3dc04c8f4aad6b93382a8', // Saltwater Grande (inactive)
]);

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

  // Fetch all live partners (paginate to get all)
  const allPartners = [];
  let page = 0;
  const pageSize = 50;
  while (true) {
    const batch = await base44.asServiceRole.entities.Partner.filter(
      { status: 'live' }, '-created_date', pageSize, page * pageSize
    );
    allPartners.push(...batch);
    if (batch.length < pageSize) break;
    page++;
  }

  // Fetch all existing PartnerOnboarding rows
  const existing = await base44.asServiceRole.entities.PartnerOnboarding.list('-created_date', 200);
  const existingIds = new Set(existing.map(r => r.partner_id).filter(Boolean));

  // Compute backfill targets
  const toBackfill = allPartners.filter(p => {
    if (SKIP_IDS.has(p.id)) return false;          // pre-existing or inactive
    if (existingIds.has(p.id)) return false;         // already has a row
    return true;
  });

  // Also show any live partners already covered (sanity check)
  const alreadyCovered = allPartners.filter(p => !SKIP_IDS.has(p.id) && existingIds.has(p.id));

  return Response.json({
    total_live_partners: allPartners.length,
    existing_onboarding_rows: existing.length,
    already_covered_non_skip: alreadyCovered.map(p => ({ id: p.id, name: p.partner_name })),
    backfill_target_count: toBackfill.length,
    backfill_targets: toBackfill
      .sort((a, b) => (a.partner_name || '').localeCompare(b.partner_name || ''))
      .map(p => ({ id: p.id, name: p.partner_name, market: p.market })),
  });
});