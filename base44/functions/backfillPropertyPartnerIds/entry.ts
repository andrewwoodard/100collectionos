import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const offset = body.offset || 0;
    const limit = 60; // process 60 per run to stay under rate limit

    // Fetch all partners (small dataset)
    const allPartners = await base44.asServiceRole.entities.Partner.list('-created_date', 500);
    await sleep(400);

    const partnerByName = {};
    for (const p of allPartners) {
      if (p.partner_name) partnerByName[p.partner_name.trim()] = p.id;
    }

    // Fetch one page of properties at offset
    const props = await base44.asServiceRole.entities.Property.list('-created_date', limit, offset);
    await sleep(400);

    const toUpdate = (props || []).filter(p => !p.partner_id && p.partner_name);
    const alreadySet = (props || []).length - toUpdate.length;

    let updated = 0;
    const unmatched = [];

    for (const prop of toUpdate) {
      const partnerId = partnerByName[prop.partner_name?.trim()];
      if (!partnerId) {
        unmatched.push(prop.partner_name);
        continue;
      }
      await base44.asServiceRole.entities.Property.update(prop.id, { partner_id: partnerId });
      updated++;
      await sleep(350);
    }

    const nextOffset = offset + (props?.length || 0);
    const hasMore = (props?.length || 0) >= limit;

    return Response.json({
      updated,
      already_set: alreadySet,
      unmatched: [...new Set(unmatched)],
      processed_this_run: props?.length || 0,
      next_offset: hasMore ? nextOffset : null,
      done: !hasMore,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});