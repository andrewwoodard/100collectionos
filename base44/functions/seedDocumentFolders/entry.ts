/**
 * Phase B+ — Seed Document folder structure.
 * Pass step=1 for top-level+second-level+partner folders
 * Pass step=2 for property folders
 * Pass step=3 for visibility backfill + re-file docs
 * Idempotent: skips existing folders by name+parent.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const step = body.step || 1;

    const folders = await base44.asServiceRole.entities.DocumentFolder.list('name', 2000);
    const existingByKey = new Map();
    for (const f of folders) {
      existingByKey.set(`${f.name}::${f.parent_id ?? 'root'}`, f.id);
    }

    const ensureFolder = async (name, parentId, extra = {}) => {
      const key = `${name}::${parentId ?? 'root'}`;
      if (existingByKey.has(key)) return existingByKey.get(key);
      const f = await base44.asServiceRole.entities.DocumentFolder.create({ name, parent_id: parentId ?? null, color: 'blue', ...extra });
      existingByKey.set(key, f.id);
      return f.id;
    };

    if (step === 1) {
      // ── Top-level folders ──
      const topLevel = ['Partners', 'Properties', 'Finance', 'Brand & Marketing', 'Internal Ops', 'Templates', 'Archive', 'Inbox'];
      const topIds = {};
      for (const name of topLevel) {
        topIds[name] = await ensureFolder(name, null);
        await sleep(100);
      }
      const contractsFolder = folders.find(f => f.name === 'Contracts' && !f.parent_id);
      if (contractsFolder) topIds['Contracts'] = contractsFolder.id;

      // ── Second-level folders ──
      const secondLevel = {
        'Brand & Marketing': ['Branding and Marketing', 'Interior Design', 'SEO & Digital Marketing', 'VRMA Video'],
        'Internal Ops': ['Business Development', 'Company Management', 'Industry Resources'],
        'Finance': ['Invoices and Proposals'],
        'Templates': ['Home-Owner-Brochure'],
        'Archive': ['Backups', 'Hubspot Backup'],
      };
      for (const [parent, children] of Object.entries(secondLevel)) {
        const parentId = topIds[parent];
        if (!parentId) continue;
        for (const child of children) {
          await ensureFolder(child, parentId);
          await sleep(150);
        }
      }

      // ── Partner subfolders (batch of 30 at a time) ──
      const partners = await base44.asServiceRole.entities.Partner.list('partner_name', 2000);
      const partnersFolderId = topIds['Partners'];
      let partnerFoldersCreated = 0;
      for (let i = 0; i < Math.min(partners.length, 30); i++) {
        const p = partners[i];
        const name = (p.partner_name || '').trim();
        if (!name) continue;
        const key = `${name}::${partnersFolderId}`;
        if (!existingByKey.has(key)) {
          await base44.asServiceRole.entities.DocumentFolder.create({ name, parent_id: partnersFolderId, color: 'blue', partner_id: p.id, partner_name: p.partner_name });
          partnerFoldersCreated++;
          await sleep(150);
        }
      }

      return Response.json({ step: 1, done: true, partners_total: partners.length, partner_folders_created: partnerFoldersCreated, topIds });
    }

    if (step === 2) {
      // Partner folders continuation — batch offset via body.offset
      const offset = body.offset || 0;
      const batchSize = 25;
      const partners = await base44.asServiceRole.entities.Partner.list('partner_name', 2000);
      const partnersFolderId = existingByKey.get('Partners::root') || folders.find(f => f.name === 'Partners' && !f.parent_id)?.id;
      let created = 0;
      const batch = partners.slice(offset, offset + batchSize);
      for (const p of batch) {
        const name = (p.partner_name || '').trim();
        if (!name) continue;
        const key = `${name}::${partnersFolderId}`;
        if (!existingByKey.has(key)) {
          await base44.asServiceRole.entities.DocumentFolder.create({ name, parent_id: partnersFolderId, color: 'blue', partner_id: p.id, partner_name: p.partner_name });
          created++;
          await sleep(150);
        }
      }
      const hasMore = offset + batchSize < partners.length;
      return Response.json({ step: 2, offset, created, hasMore, nextOffset: offset + batchSize, total: partners.length });
    }

    if (step === 3) {
      // Property folders — batch via body.offset
      const offset = body.offset || 0;
      const batchSize = 20;
      const properties = await base44.asServiceRole.entities.Property.list('property_name', 2000);
      const propertiesFolderId = existingByKey.get('Properties::root') || folders.find(f => f.name === 'Properties' && !f.parent_id)?.id;
      let created = 0;
      const batch = properties.slice(offset, offset + batchSize);
      for (const p of batch) {
        const name = (p.property_name || '').trim();
        if (!name) continue;
        const key = `${name}::${propertiesFolderId}`;
        if (!existingByKey.has(key)) {
          await base44.asServiceRole.entities.DocumentFolder.create({ name, parent_id: propertiesFolderId, color: 'blue', property_id: p.id, partner_id: p.partner_id || null });
          created++;
          await sleep(200);
        }
      }
      const hasMore = offset + batchSize < properties.length;
      return Response.json({ step: 3, offset, created, hasMore, nextOffset: offset + batchSize, total: properties.length });
    }

    if (step === 4) {
      // Visibility backfill + re-file partner docs
      const documents = await base44.asServiceRole.entities.Document.list('-created_date', 2000);
      const refreshedFolders = await base44.asServiceRole.entities.DocumentFolder.list('name', 2000);
      const partnersFolderId = refreshedFolders.find(f => f.name === 'Partners' && !f.parent_id)?.id;

      // Build partner_id → folder_id map
      const partnerSubfolderMap = new Map();
      for (const f of refreshedFolders) {
        if (f.partner_id && f.parent_id === partnersFolderId) {
          partnerSubfolderMap.set(f.partner_id, f.id);
        }
      }

      // Also build a name→folder map for docs that have partner_name but missing folder
      const partnerNameSubfolderMap = new Map();
      for (const f of refreshedFolders) {
        if (f.partner_name && f.parent_id === partnersFolderId) {
          partnerNameSubfolderMap.set(f.partner_name.trim(), f.id);
        }
      }

      // Collect unique partner_ids from docs that need re-filing but have no folder yet
      const missingPartnerIds = new Set();
      for (const doc of documents) {
        if (doc.partner_id && !doc.folder_id && !partnerSubfolderMap.has(doc.partner_id)) {
          missingPartnerIds.add(doc.partner_id);
        }
      }

      // Try to fetch those partners and create folders for them
      let foldersCreated = 0;
      for (const pid of missingPartnerIds) {
        try {
          const partner = await base44.asServiceRole.entities.Partner.get(pid);
          if (partner && partner.partner_name) {
            const name = partner.partner_name.trim();
            // Check by name in case folder exists under different key
            if (!partnerNameSubfolderMap.has(name)) {
              const newFolder = await base44.asServiceRole.entities.DocumentFolder.create({
                name, parent_id: partnersFolderId, color: 'blue',
                partner_id: partner.id, partner_name: partner.partner_name
              });
              partnerSubfolderMap.set(pid, newFolder.id);
              partnerNameSubfolderMap.set(name, newFolder.id);
              foldersCreated++;
              await sleep(150);
            } else {
              // Folder exists by name — map the id
              partnerSubfolderMap.set(pid, partnerNameSubfolderMap.get(name));
            }
          } else {
            // Partner not found — create a placeholder using the doc's partner_name
            const docsForPid = documents.filter(d => d.partner_id === pid && d.partner_name);
            const pname = docsForPid[0]?.partner_name?.trim();
            if (pname && !partnerNameSubfolderMap.has(pname)) {
              const newFolder = await base44.asServiceRole.entities.DocumentFolder.create({
                name: pname, parent_id: partnersFolderId, color: 'blue',
                partner_id: pid, partner_name: pname
              });
              partnerSubfolderMap.set(pid, newFolder.id);
              partnerNameSubfolderMap.set(pname, newFolder.id);
              foldersCreated++;
              await sleep(150);
            } else if (pname && partnerNameSubfolderMap.has(pname)) {
              partnerSubfolderMap.set(pid, partnerNameSubfolderMap.get(pname));
            }
          }
        } catch (e) {
          // Partner fetch failed — try to use doc's partner_name
          const docsForPid = documents.filter(d => d.partner_id === pid && d.partner_name);
          const pname = docsForPid[0]?.partner_name?.trim();
          if (pname && !partnerNameSubfolderMap.has(pname)) {
            const newFolder = await base44.asServiceRole.entities.DocumentFolder.create({
              name: pname, parent_id: partnersFolderId, color: 'blue',
              partner_id: pid, partner_name: pname
            });
            partnerSubfolderMap.set(pid, newFolder.id);
            partnerNameSubfolderMap.set(pname, newFolder.id);
            foldersCreated++;
            await sleep(150);
          } else if (pname && partnerNameSubfolderMap.has(pname)) {
            partnerSubfolderMap.set(pid, partnerNameSubfolderMap.get(pname));
          }
        }
      }

      let visibilityUpdated = 0;
      let refiledCount = 0;
      for (const doc of documents) {
        const updates = {};
        if (!doc.visibility) { updates.visibility = 'internal'; visibilityUpdated++; }
        if (doc.partner_id && !doc.folder_id) {
          const fid = partnerSubfolderMap.get(doc.partner_id);
          if (fid) { updates.folder_id = fid; refiledCount++; }
        }
        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Document.update(doc.id, updates);
          await sleep(100);
        }
      }
      return Response.json({ step: 4, folders_created: foldersCreated, visibility_updated: visibilityUpdated, refiled_docs: refiledCount });
    }

    return Response.json({ error: 'Unknown step' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});