import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Root Drive folder ID
const DRIVE_ROOT_ID = '0AA1H3HEoYLJMUk9PVA';

// Target top-level folder names to import
const TARGET_ROOT_FOLDERS = ['Photos', 'VRMA Video'];

// Brand-related keywords that add brand-asset tag
const BRAND_KEYWORDS = ['logo', 'brand', 'wordmark', 'icon'];

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function listChildren(accessToken, folderId) {
  let allItems = [];
  let pageToken = null;
  do {
    // includeItemsFromAllDrives + supportsAllDrives covers both My Drive and Shared Drives
    let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,webViewLink,parents),nextPageToken&pageSize=1000&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Drive API error listing folder ${folderId}: ${res.status} ${err.substring(0, 200)}`);
    }
    const data = await res.json();
    allItems = allItems.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return allItems;
}

// ─── MediaFolder helpers ──────────────────────────────────────────────────────

// Returns an existing or newly created MediaFolder id
async function getOrCreateMediaFolder(base44, name, parentId, existingFolders, stats) {
  const key = `${parentId || 'root'}::${name.toLowerCase().trim()}`;
  if (existingFolders.has(key)) {
    return existingFolders.get(key);
  }
  // Create it
  const folder = await base44.asServiceRole.entities.MediaFolder.create({
    name,
    parent_id: parentId || null,
  });
  existingFolders.set(key, folder.id);
  stats.foldersCreated++;
  console.log(`Created MediaFolder: "${name}" (parent: ${parentId || 'root'}), id=${folder.id}`);
  return folder.id;
}

// Pre-load all existing MediaFolders into map keyed by parentId::name
async function loadExistingFolders(base44) {
  const folders = await base44.asServiceRole.entities.MediaFolder.list();
  const map = new Map();
  for (const f of folders) {
    const key = `${f.parent_id || 'root'}::${f.name.toLowerCase().trim()}`;
    map.set(key, f.id);
  }
  return map;
}

// ─── Partner/Property matching ────────────────────────────────────────────────

function normalize(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildPartnerMap(partners) {
  const map = new Map();
  for (const p of partners) {
    if (p.partner_name) map.set(normalize(p.partner_name), p);
  }
  return map;
}

function buildPropertyMap(properties) {
  const map = new Map();
  for (const p of properties) {
    if (p.property_name) map.set(normalize(p.property_name), p);
  }
  return map;
}

function detectAttribution(folderPath, partnerMap, propertyMap, partnerById) {
  // folderPath = array of folder names from root down (not including filename)
  let partner = null;
  let property = null;

  for (const segment of folderPath) {
    const norm = normalize(segment);
    if (!partner && partnerMap.has(norm)) {
      partner = partnerMap.get(norm);
    }
    if (!property && propertyMap.has(norm)) {
      property = propertyMap.get(norm);
    }
  }

  // If property found but no partner, try to get partner from property
  if (property && !partner && property.partner_id) {
    partner = partnerById.get(property.partner_id) || null;
  }

  return { partner, property };
}

// ─── Asset type / tag classification ─────────────────────────────────────────

function classifyAsset(mimeType, fileName, folderPathStr) {
  const lc = fileName.toLowerCase();
  let assetType = 'other';
  const tags = [];

  if (mimeType && mimeType.startsWith('image/')) {
    assetType = 'photo';
  } else if (mimeType && mimeType.startsWith('video/')) {
    assetType = 'video';
  }

  // Brand keyword tagging
  if (BRAND_KEYWORDS.some(k => lc.includes(k))) {
    tags.push('brand-asset');
  }

  // VRMA Video tagging — try to pull year from filename
  if (folderPathStr.toLowerCase().includes('vrma video')) {
    const yearMatch = fileName.match(/20\d{2}/);
    const year = yearMatch ? yearMatch[0] : '2024';
    tags.push(`vrma-${year}`);
  }

  return { assetType, tags };
}

// ─── Recursive folder walker ──────────────────────────────────────────────────

async function walkFolder(
  accessToken, base44,
  driveFolder, // { id, name }
  mediaFolderParentId, // MediaFolder id of the parent
  folderPath, // array of folder name strings from root
  existingFolders,
  existingDriveIds, // Set of drive_file_ids already in MediaAsset
  partners, partnerMap, propertyMap, partnerById,
  batchBuffer, stats
) {
  let items;
  try {
    items = await listChildren(accessToken, driveFolder.id);
  } catch (e) {
    console.error(`ERROR listing ${driveFolder.name} (${driveFolder.id}): ${e.message}`);
    stats.errors.push({ folder: driveFolder.name, error: e.message });
    return;
  }

  const subFolders = items.filter(i => i.mimeType === 'application/vnd.google-apps.folder');
  const files = items.filter(i => i.mimeType !== 'application/vnd.google-apps.folder');

  // Process files in this folder
  for (const file of files) {
    stats.traversed++;

    if (existingDriveIds.has(file.id)) {
      stats.skipped++;
      continue;
    }

    const fileNameNoExt = file.name.replace(/\.[^/.]+$/, '');
    const driveUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
    const { assetType, tags } = classifyAsset(file.mimeType, file.name, folderPath.join('/'));
    const { partner, property } = detectAttribution(folderPath, partnerMap, propertyMap, partnerById);

    const record = {
      asset_name: fileNameNoExt || file.name,
      asset_type: assetType,
      file_url: driveUrl,
      drive_file_id: file.id,
      drive_file_url: driveUrl,
      drive_mime_type: file.mimeType,
      thumbnail_url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400-h400`,
      folder_id: mediaFolderParentId,
      approval_status: 'pending',
      tags,
    };

    if (partner) {
      record.partner_id = partner.id;
      record.partner_name = partner.partner_name;
      record.market = partner.market || null;
    }
    if (property) {
      record.property_id = property.id;
      record.property_name = property.property_name;
      if (!record.partner_id && property.partner_id) {
        const owningPartner = partnerById.get(property.partner_id);
        if (owningPartner) {
          record.partner_id = owningPartner.id;
          record.partner_name = owningPartner.partner_name;
          record.market = owningPartner.market || null;
        }
      }
    }

    batchBuffer.push(record);
    existingDriveIds.add(file.id); // prevent duplicate within same run

    // Flush batch of 100
    if (batchBuffer.length >= 100) {
      await flushBatch(base44, batchBuffer, stats);
      batchBuffer.length = 0;
      console.log(`Progress: traversed=${stats.traversed}, created=${stats.created}, folders=${stats.foldersCreated}, skipped=${stats.skipped}, errors=${stats.errors.length}`);
    }
  }

  // Recurse into sub-folders
  for (const sub of subFolders) {
    const subMediaFolderId = await getOrCreateMediaFolder(
      base44, sub.name, mediaFolderParentId, existingFolders, stats
    );
    await walkFolder(
      accessToken, base44,
      sub,
      subMediaFolderId,
      [...folderPath, sub.name],
      existingFolders,
      existingDriveIds,
      partners, partnerMap, propertyMap, partnerById,
      batchBuffer, stats
    );
  }
}

async function flushBatch(base44, batch, stats) {
  if (batch.length === 0) return;
  try {
    await base44.asServiceRole.entities.MediaAsset.bulkCreate([...batch]);
    stats.created += batch.length;
  } catch (e) {
    console.error(`Bulk create error: ${e.message}`);
    // Fall back to one-by-one
    for (const rec of batch) {
      try {
        await base44.asServiceRole.entities.MediaAsset.create(rec);
        stats.created++;
      } catch (e2) {
        console.error(`Single create error for ${rec.asset_name}: ${e2.message}`);
        stats.errors.push({ file: rec.asset_name, error: e2.message });
      }
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('=== Media Drive Migration starting ===');
    console.log(`Targets: ${TARGET_ROOT_FOLDERS.join(', ')} under Drive root ${DRIVE_ROOT_ID}`);

    // Get Drive access token
    let accessToken;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      accessToken = conn.accessToken;
      console.log('Drive auth: OK via googledrive connector');
    } catch (e) {
      return Response.json({ error: `Drive auth failed: ${e.message}` }, { status: 500 });
    }

    // Pre-load partners and properties for attribution
    const [partners, properties] = await Promise.all([
      base44.asServiceRole.entities.Partner.list(),
      base44.asServiceRole.entities.Property.list(),
    ]);
    const partnerMap = buildPartnerMap(partners);
    const propertyMap = buildPropertyMap(properties);
    const partnerById = new Map(partners.map(p => [p.id, p]));
    console.log(`Loaded ${partners.length} partners, ${properties.length} properties for attribution`);

    // Pre-load existing MediaFolders
    const existingFolders = await loadExistingFolders(base44);
    console.log(`Pre-loaded ${existingFolders.size} existing MediaFolders`);

    // Pre-load existing MediaAsset drive_file_ids to detect duplicates
    const existingAssets = await base44.asServiceRole.entities.MediaAsset.list();
    const existingDriveIds = new Set(existingAssets.filter(a => a.drive_file_id).map(a => a.drive_file_id));
    console.log(`Pre-loaded ${existingAssets.length} existing MediaAssets (${existingDriveIds.size} with drive_file_id)`);

    const stats = {
      traversed: 0,
      created: 0,
      foldersCreated: 0,
      skipped: 0,
      errors: [],
      perFolder: {},
    };

    // Find target top-level folders in Drive root
    let rootChildren;
    try {
      rootChildren = await listChildren(accessToken, DRIVE_ROOT_ID);
    } catch (e) {
      return Response.json({ error: `Cannot list Drive root: ${e.message}` }, { status: 500 });
    }

    const targetDriveFolders = rootChildren.filter(
      item => item.mimeType === 'application/vnd.google-apps.folder'
        && TARGET_ROOT_FOLDERS.some(t => t.toLowerCase() === item.name.toLowerCase().trim())
    );

    if (targetDriveFolders.length === 0) {
      return Response.json({
        error: 'No target folders found in Drive root',
        rootFoldersFound: rootChildren.filter(i => i.mimeType === 'application/vnd.google-apps.folder').map(i => i.name),
      }, { status: 404 });
    }

    console.log(`Found ${targetDriveFolders.length} target Drive folders: ${targetDriveFolders.map(f => f.name).join(', ')}`);

    // Walk each target folder
    for (const driveFolder of targetDriveFolders) {
      const topMediaFolderId = await getOrCreateMediaFolder(
        base44, driveFolder.name, null, existingFolders, stats
      );
      stats.perFolder[driveFolder.name] = { created: 0 };
      const batchBuffer = [];
      const beforeCreated = stats.created;
      await walkFolder(
        accessToken, base44,
        driveFolder,
        topMediaFolderId,
        [driveFolder.name],
        existingFolders,
        existingDriveIds,
        partners, partnerMap, propertyMap, partnerById,
        batchBuffer, stats
      );
      // Flush remaining
      await flushBatch(base44, batchBuffer, stats);
      stats.perFolder[driveFolder.name].created = stats.created - beforeCreated;
    }

    console.log('=== Migration complete ===');
    console.log(`traversed=${stats.traversed}, created=${stats.created}, folders=${stats.foldersCreated}, skipped=${stats.skipped}, errors=${stats.errors.length}`);

    return Response.json({
      success: true,
      summary: {
        traversed: stats.traversed,
        created: stats.created,
        foldersCreated: stats.foldersCreated,
        skipped: stats.skipped,
        errorCount: stats.errors.length,
        firstErrors: stats.errors.slice(0, 10),
      },
      perTopLevelFolder: stats.perFolder,
    });

  } catch (error) {
    console.error('Migration fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});