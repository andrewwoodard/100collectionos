import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SKIP_IDS = new Set([
  '69d3dc1a26c5d031b3e4caca',
  '69d3dc1a65994e77eaa6985f',
  '69d3dc565eb95f3d4ee6ae3b',
  '69d3dc0dc2829eb575b4def2',
  '69d3dc111b2cea2d05245db8',
  '69d3dc04c8f4aad6b93382a8',
]);

const WAIVED = {
  contract_sent: 'Waived', contract_signed: 'Waived', stripe_added: 'Waived',
  onboarding_fee_invoiced: 'Waived', onboarding_fee_paid: 'Waived',
  kickoff_email_sent: 'Waived', partner_folder_created: 'Waived',
  intake_form_done: 'Waived', post_call_recap: 'Waived',
  writer_interview: 'Waived', writeup_completed: 'Waived',
  destination_writeup_approved: 'Waived', properties_given: 'Waived',
  analytics_given: 'Waived', gtag_given: 'Waived', website_access_given: 'Waived',
  fully_live: 'Waived', live_email_sent: 'Waived',
  proud_header_mockup: 'Waived', proud_header_added: 'Waived',
  vrm_landing_page: 'Waived', landing_page_added: 'Waived',
  social_media_announced: 'Waived', in_category: 'Waived',
  licensing_fees_invoiced: 'Waived',
};

async function runInBatches(items, fn, size) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  // 1. Fetch all live partners (paginated)
  const allLive = [];
  let pg = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.Partner.filter({ status: 'live' }, '-created_date', 50, pg * 50);
    allLive.push(...batch);
    if (batch.length < 50) break;
    pg++;
  }

  // 2. Fetch ALL PartnerOnboarding rows to find which partner_ids are already covered
  const existingRows = await base44.asServiceRole.entities.PartnerOnboarding.list('-created_date', 200);
  const coveredIds = new Set(existingRows.map(r => r.partner_id).filter(Boolean));

  // 3. Find still-missing (idempotent — skips already-created rows from prior partial run)
  const toCreate = allLive.filter(p => !SKIP_IDS.has(p.id) && !coveredIds.has(p.id));

  // 4. Create missing rows in parallel batches of 8
  const created = [];
  const failed = [];
  await runInBatches(toCreate, async (partner) => {
    const row = { ...WAIVED, partner_id: partner.id, partner_name: partner.partner_name };
    const newRow = await base44.asServiceRole.entities.PartnerOnboarding.create(row);
    if (newRow && newRow.id) {
      created.push(partner.id);
    } else {
      failed.push({ id: partner.id, name: partner.partner_name });
    }
  }, 8);

  // 5. recomputeFunnelStage for all 68 backfill targets in batches of 8
  const allTargets = allLive.filter(p => !SKIP_IDS.has(p.id));
  const funnelErrors = [];
  await runInBatches(allTargets, async (partner) => {
    const res = await base44.asServiceRole.functions.invoke('recomputeFunnelStage', { partner_id: partner.id });
    if (res && res.error) {
      funnelErrors.push({ id: partner.id, name: partner.partner_name, err: res.error });
    }
  }, 8);

  // 6. Verify 5 pre-existing partners not changed
  const preCheck = await Promise.all([
    { id: '69d3dc1a26c5d031b3e4caca', name: 'Seabreeze',                 expected: 'listed' },
    { id: '69d3dc1a65994e77eaa6985f', name: 'Stay With Style Scottsdale', expected: 'build' },
    { id: '69d3dc565eb95f3d4ee6ae3b', name: 'Rent in Highlands',          expected: 'build' },
    { id: '69d3dc0dc2829eb575b4def2', name: 'Whistler Platinum',          expected: 'build' },
    { id: '69d3dc111b2cea2d05245db8', name: 'Nauset Rental',              expected: 'contracted' },
  ].map(async ({ id, name, expected }) => {
    const p = await base44.asServiceRole.entities.Partner.get(id);
    return { name, expected, actual: p?.funnel_stage, ok: p?.funnel_stage === expected };
  }));

  // 7. Saltwater Grande check
  const swRows = await base44.asServiceRole.entities.PartnerOnboarding.filter({ partner_id: '69d3dc04c8f4aad6b93382a8' });

  // 8. Final counts
  const finalRows = await base44.asServiceRole.entities.PartnerOnboarding.list('-created_date', 200);

  const allPartnersAll = [];
  let pg2 = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.Partner.list('-created_date', 50, pg2 * 50);
    allPartnersAll.push(...batch);
    if (batch.length < 50) break;
    pg2++;
  }
  const listedCount = allPartnersAll.filter(p => p.funnel_stage === 'listed').length;

  return Response.json({
    rows_created_this_run: created.length,
    rows_failed: failed.length,
    funnel_compute_errors: funnelErrors.length,
    total_onboarding_rows_now: finalRows.length,
    partners_with_funnel_stage_listed: listedCount,
    pre_existing_five_check: preCheck,
    saltwater_grande_onboarding_rows: swRows.length,
    failures: failed,
    funnel_errors: funnelErrors,
  });
});