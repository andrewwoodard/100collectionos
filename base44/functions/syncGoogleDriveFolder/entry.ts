import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MAX_DEPTH = 3;
const TIME_BUDGET_MS = 55_000; // hard cap under Base44's ~60s timeout
const PRELOAD_BUDGET_MS = 15_000;
const FLUSH_THRESHOLD = 20;

const START_TIME = Date.now();

function timeBudgetExceeded() {
  return Date.now() - START_TIME > TIME_BUDGET_MS;
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// List all children (files + subfolders) of a Drive folder, with pagination
async function listChildren(accessToken, folderId) {
  let allItems = [];
  let pageToken = null;
  do {
    let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,webViewLink),nextPageToken&pageSize=1000&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Drive API error (${res.status}) listing folder ${folderId}: ${errBody.substring(0, 300)}`);
    }
    const data = await res.json();
    allItems = allItems.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return allItems;
}

// Build a lookup map of existing DocumentFolders keyed by normalized name
async function loadDocumentFolders(base44) {
  const folders = await base44.asServiceRole.entities.DocumentFolder.list();
  const map = new Map();
  for (const f of folders) {
    if (f.name) map.set(normalize(f.name), f);
  }
  return map;
}

// Pre-load existing Document.drive_file_id values for dedup — filtered to only drive-imported docs
async function loadExistingDriveDocIds(base44) {
  const set = new Set();
  let cursor = 0;
  const PAGE = 500;
  while (true) {
    const docs = await base44.asServiceRole.entities.Document.filter(
      { drive_file_id: { $exists: true, $ne: null } },
      null,
      PAGE,
      cursor
    );
    if (!docs || docs.length === 0) break;
    for (const d of docs) {
      if (d.drive_file_id) set.add(d.drive_file_id);
    }
    if (docs.length < PAGE) break;
    cursor += PAGE;
  }
  return set;
}

function classifyDocType(mimeType) {
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'google_sheet';
  if (mimeType === 'application/vnd.google-apps.document') return 'google_doc';
  return 'miscellaneous';
}

// Recursively walk a Drive folder, importing files and descending into subfolders
async function walkFolder(
  accessToken, base44, user,
  driveFolder, depth,
  destFolderId, folderName,
  docFolderMap, existingDriveIds,
  batchBuffer, stats
) {
  if (depth > MAX_DEPTH) return;
  if (timeBudgetExceeded()) {
    stats.deferred_folders++;
    return;
  }

  let items;
  try {
    items = await listChildren(accessToken, driveFolder.id);
  } catch (e) {
    console.error(`Error listing "${driveFolder.name}" (${driveFolder.id}): ${e.message}`);
    stats.errors.push({ folder: driveFolder.name, error: e.message });
    stats.folders_failed++;
    return;
  }

  stats.folders_scanned++;

  const subfolders = items.filter(i => i.mimeType === 'application/vnd.google-apps.folder');
  const files = items.filter(i => i.mimeType !== 'application/vnd.google-apps.folder');

  // Import files at this level
  for (const file of files) {
    if (existingDriveIds.has(file.id)) {
      stats.skipped_duplicates++;
      continue;
    }

    const driveUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
    const record = {
      title: file.name,
      file_url: driveUrl,
      doc_type: classifyDocType(file.mimeType),
      folder_id: destFolderId || null,
      status: 'draft',
      uploaded_by: user.email,
      notes: `Imported from Google Drive folder: ${folderName}`,
      drive_file_id: file.id,
      drive_file_url: driveUrl,
      drive_mime_type: file.mimeType,
    };

    batchBuffer.push(record);
    existingDriveIds.add(file.id);

    if (batchBuffer.length >= FLUSH_THRESHOLD) {
      await flushBatch(base44, batchBuffer, stats);
    }
  }

  // Recurse into subfolders
  for (const sub of subfolders) {
    if (timeBudgetExceeded()) {
      stats.deferred_folders++;
      break;
    }

    const normName = normalize(sub.name);
    const matchedFolder = docFolderMap.get(normName);

    if (matchedFolder) {
      await walkFolderWithDocContext(
        accessToken, base44, user,
        sub, depth + 1,
        matchedFolder.id, sub.name,
        matchedFolder, docFolderMap, existingDriveIds,
        batchBuffer, stats
      );
    } else {
      stats.unmatched_folders.push(sub.name);
      await walkFolder(
        accessToken, base44, user,
        sub, depth + 1,
        destFolderId, sub.name,
        docFolderMap, existingDriveIds,
        batchBuffer, stats
      );
    }
  }
}

// Walk variant that attaches partner_id / partner_name from a matched DocumentFolder
async function walkFolderWithDocContext(
  accessToken, base44, user,
  driveFolder, depth,
  destFolderId, folderName,
  matchedDocFolder, docFolderMap, existingDriveIds,
  batchBuffer, stats
) {
  if (depth > MAX_DEPTH) return;
  if (timeBudgetExceeded()) {
    stats.deferred_folders++;
    return;
  }

  let items;
  try {
    items = await listChildren(accessToken, driveFolder.id);
  } catch (e) {
    console.error(`Error listing "${driveFolder.name}" (${driveFolder.id}): ${e.message}`);
    stats.errors.push({ folder: driveFolder.name, error: e.message });
    stats.folders_failed++;
    return;
  }

  stats.folders_scanned++;

  const subfolders = items.filter(i => i.mimeType === 'application/vnd.google-apps.folder');
  const files = items.filter(i => i.mimeType !== 'application/vnd.google-apps.folder');

  for (const file of files) {
    if (existingDriveIds.has(file.id)) {
      stats.skipped_duplicates++;
      continue;
    }

    const driveUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
    const record = {
      title: file.name,
      file_url: driveUrl,
      doc_type: classifyDocType(file.mimeType),
      folder_id: destFolderId,
      status: 'draft',
      uploaded_by: user.email,
      notes: `Imported from Google Drive folder: ${folderName}`,
      drive_file_id: file.id,
      drive_file_url: driveUrl,
      drive_mime_type: file.mimeType,
      partner_id: matchedDocFolder.partner_id || null,
      partner_name: matchedDocFolder.partner_name || null,
    };

    batchBuffer.push(record);
    existingDriveIds.add(file.id);

    if (batchBuffer.length >= FLUSH_THRESHOLD) {
      await flushBatch(base44, batchBuffer, stats);
    }
  }

  // Deeper subfolders: try matching again, fall back to current context
  for (const sub of subfolders) {
    if (timeBudgetExceeded()) {
      stats.deferred_folders++;
      break;
    }

    const normName = normalize(sub.name);
    const childMatch = docFolderMap.get(normName);
    if (childMatch) {
      await walkFolderWithDocContext(
        accessToken, base44, user,
        sub, depth + 1,
        childMatch.id, sub.name,
        childMatch, docFolderMap, existingDriveIds,
        batchBuffer, stats
      );
    } else {
      stats.unmatched_folders.push(sub.name);
      await walkFolderWithDocContext(
        accessToken, base44, user,
        sub, depth + 1,
        destFolderId, sub.name,
        matchedDocFolder, docFolderMap, existingDriveIds,
        batchBuffer, stats
      );
    }
  }
}

async function flushBatch(base44, batch, stats) {
  if (batch.length === 0) return;
  try {
    await base44.asServiceRole.entities.Document.bulkCreate([...batch]);
    stats.imported += batch.length;
  } catch (e) {
    console.error(`Bulk create error: ${e.message}`);
    for (const rec of batch) {
      try {
        await base44.asServiceRole.entities.Document.create(rec);
        stats.imported++;
      } catch (e2) {
        console.error(`Single create error for "${rec.title}": ${e2.message}`);
        stats.errors.push({ file: rec.title, error: e2.message });
      }
    }
  }
  batch.length = 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { googleFolderId, destFolderId, folderName } = await req.json();
    if (!googleFolderId) {
      return Response.json({ error: 'Google folder ID is required' }, { status: 400 });
    }

    // Extract folder ID from URL if full URL was provided
    let folderId = googleFolderId.trim();
    if (folderId.includes('/folders/')) {
      const match = folderId.match(/\/folders\/([a-zA-Z0-9-_]+)/);
      if (match) folderId = match[1];
    }

    // googledrive connector has drive.readonly scope — can list/read all files in shared folders
    let accessToken;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      accessToken = conn.accessToken;
    } catch (e) {
      return Response.json({ error: `Google Drive auth failed: ${e.message}` }, { status: 500 });
    }

    // Pre-load DocumentFolders and existing Drive doc IDs for dedup + matching
    const preloadStart = Date.now();
    const docFolderMap = await loadDocumentFolders(base44);

    let existingDriveIds;
    try {
      existingDriveIds = await Promise.race([
        loadExistingDriveDocIds(base44),
        new Promise((_, rej) => setTimeout(() => rej(new Error('preload_timeout')), PRELOAD_BUDGET_MS)),
      ]);
    } catch (e) {
      console.warn('Preload dedup set timed out — proceeding without full dedup:', e.message);
      existingDriveIds = new Set();
    }
    const preloadMs = Date.now() - preloadStart;

    const stats = {
      imported: 0,
      skipped_duplicates: 0,
      folders_scanned: 0,
      deferred_folders: 0,
      folders_failed: 0,
      unmatched_folders: [],
      errors: [],
    };

    const batchBuffer = [];

    const walkStart = Date.now();
    await walkFolder(
      accessToken, base44, user,
      { id: folderId, name: folderName || 'Drive Root' },
      1,
      destFolderId, folderName || 'Imported from Drive',
      docFolderMap, existingDriveIds,
      batchBuffer, stats
    );
    const walkMs = Date.now() - walkStart;

    // Flush remaining
    await flushBatch(base44, batchBuffer, stats);

    const inProgress = stats.deferred_folders > 0;

    return Response.json({
      success: true,
      in_progress: inProgress,
      imported: stats.imported,
      skipped_duplicates: stats.skipped_duplicates,
      folders_scanned: stats.folders_scanned,
      deferred_folders: stats.deferred_folders,
      folders_failed: stats.folders_failed,
      preload_ms: preloadMs,
      walk_ms: walkMs,
      unmatched_folders: stats.unmatched_folders.slice(0, 20),
      errors: stats.errors.slice(0, 10),
      message: inProgress
        ? `Imported ${stats.imported} so far (${stats.deferred_folders} folders deferred). Click "Continue sync" again to resume.`
        : `Imported ${stats.imported} documents from ${stats.folders_scanned} folders. Sync complete.`,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});