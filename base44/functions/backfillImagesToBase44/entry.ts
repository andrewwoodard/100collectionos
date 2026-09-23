import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import {
  getSupabase,
  parseImages,
  normalizeUrl,
} from '../../shared/propertyImages.ts';

// Re-hosts external image URLs (e.g. track-pm.s3.amazonaws.com) already stored on
// existing properties into Base44 storage, then writes the new Base44 URLs back to
// every place the old URLs appear: Property.photo_urls, image_metadata.original_url,
// and the images/property_image columns on propertiesbase44.
//
// Why image_metadata too: syncPropertyToSupabase.fetchOrderedImages rebuilds the
// propertiesbase44.images column from image_metadata + MediaAsset + photo_urls, and
// image_metadata rows without a storage_path fall back to original_url — so leaving
// track-pm URLs there would re-introduce them on the next sync.

function isExternalUrl(u) {
  if (!u || typeof u !== 'string') return false;
  if (!u.startsWith('http')) return false;
  if (u.includes('base44.app') || u.includes('base44.com') || u.includes('media.base44.com')) return false;
  if (u.includes('.supabase.co/storage/v1/object/public/')) return false;
  return true;
}

function isPrivateIpv4(ip) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = parseInt(m[1]), b = parseInt(m[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    a === 127 || (a === 169 && b === 254) || a === 0 || a >= 224;
}

async function fetchImageBytes(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '0.0.0.0' ||
      isPrivateIpv4(hostname) || hostname === '::1' || hostname.startsWith('fe80:')) return null;
  try {
    const addrs = await Deno.resolveDns(hostname, 'A');
    if (addrs.some(isPrivateIpv4)) return null;
  } catch { /* not resolvable */ }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': parsed.origin + '/',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await res.arrayBuffer();
  return { bytes: new Uint8Array(arrayBuffer), contentType };
}

async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Bulk preload: load all propertiesbase44 + image_metadata rows once into
// in-memory maps so per-property lookups are instant (no per-property DB round-trip).
async function loadPropertiesBase44(supabase) {
  const byRowId = new Map();
  const byVrmUrl = new Map();
  const byUrl = new Map();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('propertiesbase44')
      .select('row_id, images, property_image, vrm_url, url')
      .range(offset, offset + pageSize - 1);
    if (error) { console.error('propertiesbase44 load error:', error.message); break; }
    for (const row of data || []) {
      if (row.row_id != null) byRowId.set(String(row.row_id), row);
      if (row.vrm_url) byVrmUrl.set(normalizeUrl(row.vrm_url), row);
      if (row.url) byUrl.set(normalizeUrl(row.url), row);
    }
    if (!data || data.length < pageSize) break;
    offset += pageSize;
    if (offset > 20000) break;
  }
  return { byRowId, byVrmUrl, byUrl };
}

async function loadImageMetadata(supabase) {
  // Map: normalized (property_url or proppage) -> array of rows
  const byListing = new Map();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('image_metadata')
      .select('id, original_url, storage_path, property_url, proppage')
      .range(offset, offset + pageSize - 1);
    if (error) { console.error('image_metadata load error:', error.message); break; }
    for (const row of data || []) {
      for (const key of [row.property_url, row.proppage]) {
        if (!key) continue;
        const n = normalizeUrl(key);
        if (!byListing.has(n)) byListing.set(n, []);
        byListing.get(n).push(row);
      }
    }
    if (!data || data.length < pageSize) break;
    offset += pageSize;
    if (offset > 50000) break;
  }
  return { byListing };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      property_id,
      property_name,
      dry_run = false,
      limit = 50,
      skip = 0,
      scan_limit = 600,
      batch = 0,
      batch_size = 8,
    } = body;

    const supabase = getSupabase();

    // 1. Resolve the set of Base44 Property records to process.
    let properties = [];
    if (property_id) {
      const p = await base44.asServiceRole.entities.Property.get(property_id);
      properties = p ? [p] : [];
    } else {
      // Scan a wider window of recent properties, then (optionally) narrow to
      // only those that actually have external URLs and process just one batch.
      // The in-memory external check is cheap once the Supabase maps are loaded,
      // so scanning hundreds of properties to find the affected ones is fast.
      properties = await base44.asServiceRole.entities.Property.list('-created_date', scan_limit, skip);
      if (property_name) {
        const needle = String(property_name).toLowerCase();
        properties = properties.filter(p => (p.property_name || '').toLowerCase().includes(needle));
      }
    }

    // 2. Bulk preload Supabase maps (skip the heavy per-property queries).
    const [{ byRowId, byVrmUrl, byUrl }, { byListing }] = await Promise.all([
      loadPropertiesBase44(supabase),
      loadImageMetadata(supabase),
    ]);

    const stats = {
      processed: 0,
      rehosted: 0,
      skipped_no_external: 0,
      failed: 0,
      properties_updated: 0,
      metadata_rows_updated: 0,
      supabase_rows_updated: 0,
    };
    const perProperty = [];

    const extFor = (ct) => {
      const t = (ct || '').toLowerCase();
      if (t.includes('png')) return 'png';
      if (t.includes('webp')) return 'webp';
      if (t.includes('gif')) return 'gif';
      if (t.includes('avif')) return 'avif';
      return 'jpg';
    };

    // Gather every external URL currently visible for a property across all
    // three sources (photo_urls, image_metadata, propertiesbase44). Cheap and
    // in-memory thanks to the bulk-preloaded maps.
    const gatherExternal = (prop) => {
      const listingUrl = prop.listing_url || null;
      const normalizedListing = listingUrl ? normalizeUrl(listingUrl) : null;
      const sourceUrls = new Map(); // externalUrl -> { sources: Set, metaIds: Set }
      const addExternal = (url, source, metaId = null) => {
        if (!isExternalUrl(url)) return;
        if (!sourceUrls.has(url)) sourceUrls.set(url, { sources: new Set(), metaIds: new Set() });
        sourceUrls.get(url).sources.add(source);
        if (metaId != null) sourceUrls.get(url).metaIds.add(metaId);
      };

      (prop.photo_urls || []).forEach((u) => addExternal(u, 'photo_urls'));

      if (normalizedListing && byListing.has(normalizedListing)) {
        for (const row of byListing.get(normalizedListing)) {
          if (row.storage_path) continue;
          addExternal(row.original_url, 'image_metadata', row.id);
        }
      }

      let sbRow = null;
      const sbId = prop.supabase_property_id;
      const hasValidSbId = sbId && sbId !== 'null' && sbId !== 'undefined';
      if (hasValidSbId && byRowId.has(String(sbId))) {
        sbRow = byRowId.get(String(sbId));
      } else if (normalizedListing) {
        sbRow = byVrmUrl.get(normalizedListing) || byUrl.get(normalizedListing) || null;
      }
      if (sbRow) {
        parseImages(sbRow.images).forEach((u) => addExternal(u, 'propertiesbase44'));
        addExternal(sbRow.property_image, 'propertiesbase44_primary');
      }
      return { sourceUrls, sbRow, normalizedListing };
    };

    // Build the affected list (properties that actually have external URLs).
    // When a single property_id is requested, just use it as-is.
    let affected = [];
    if (property_id) {
      affected = properties.map((p) => ({ prop: p, ...gatherExternal(p) }));
    } else {
      for (const p of properties) {
        const g = gatherExternal(p);
        if (g.sourceUrls.size > 0) affected.push({ prop: p, ...g });
      }
      stats.skipped_no_external = properties.length - affected.length;
    }

    const totalAffected = affected.length;
    // pagination: if the scan window was full, more properties may exist beyond it
    const scanHasMore = !property_id && properties.length >= scan_limit;
    // Batch slice: process only [batch*batch_size, (batch+1)*batch_size) of affected.
    const sliceStart = property_id ? 0 : batch * batch_size;
    const sliceEnd = property_id ? affected.length : sliceStart + batch_size;
    const batchSlice = affected.slice(sliceStart, sliceEnd);
    const remaining = totalAffected - sliceEnd;

    const itemsToReport = dry_run ? affected : batchSlice;

    for (const { prop, sourceUrls, sbRow } of itemsToReport) {
      stats.processed++;
      const externalUrls = Array.from(sourceUrls.keys());

      if (dry_run) {
        perProperty.push({
          id: prop.id, name: prop.property_name, status: 'dry_run',
          external: externalUrls.length,
        });
        continue;
      }

      // ── Re-host each external URL into Base44 storage ──
      const urlMap = new Map(); // oldExternal -> newBase44Url
      let firstFailure = null;
      await mapWithLimit(externalUrls, 5, async (oldUrl) => {
        try {
          const fetched = await fetchImageBytes(oldUrl);
          if (!fetched) { if (!firstFailure) firstFailure = { stage: 'fetch', url: oldUrl }; stats.failed++; return; }
          const ext = extFor(fetched.contentType);
          const file = new File([fetched.bytes], `property-${Date.now()}.${ext}`, { type: fetched.contentType });
          try {
            const result = await base44.integrations.Core.UploadFile({ file });
            const file_url = result?.file_url;
            if (file_url) { urlMap.set(oldUrl, file_url); stats.rehosted++; }
            else { if (!firstFailure) firstFailure = { stage: 'upload_no_url', url: oldUrl }; stats.failed++; }
          } catch (upErr) {
            if (!firstFailure) firstFailure = { stage: 'upload', url: oldUrl, error: upErr.message };
            stats.failed++;
          }
        } catch (e) {
          if (!firstFailure) firstFailure = { stage: 'outer', url: oldUrl, error: e.message };
          stats.failed++;
        }
      });

      if (urlMap.size === 0) {
        perProperty.push({ id: prop.id, name: prop.property_name, status: 'all_failed', external: externalUrls.length, firstFailure });
        continue;
      }

      // ── Write back: Property.photo_urls ──
      const newPhotoUrls = (prop.photo_urls || []).map((u) => urlMap.get(u) || u);
      if (JSON.stringify(newPhotoUrls) !== JSON.stringify(prop.photo_urls || [])) {
        try {
          await base44.asServiceRole.entities.Property.update(prop.id, { photo_urls: newPhotoUrls });
          stats.properties_updated++;
        } catch (e) {
          console.log(`Property.photo_urls update failed for ${prop.id}: ${e.message}`);
        }
      }

      // ── Write back: image_metadata.original_url for rows we re-hosted ──
      let metaUpdated = 0;
      for (const [oldUrl, newUrl] of urlMap) {
        const metaIds = sourceUrls.get(oldUrl)?.metaIds;
        if (!metaIds || metaIds.size === 0) continue;
        for (const mid of metaIds) {
          const { error } = await supabase.from('image_metadata').update({ original_url: newUrl }).eq('id', mid);
          if (!error) metaUpdated++;
        }
      }
      stats.metadata_rows_updated += metaUpdated;

      // ── Write back: propertiesbase44.images + property_image ──
      if (sbRow) {
        const replaced = (arr) => (arr || []).map((u) => urlMap.get(u) || u);
        const updatePayload = {};
        if (sbRow.images) {
          const before = parseImages(sbRow.images);
          const after = parseImages(replaced(before));
          if (JSON.stringify(after) !== JSON.stringify(before)) {
            updatePayload.images = JSON.stringify(after);
          }
        }
        if (sbRow.property_image && urlMap.has(sbRow.property_image)) {
          updatePayload.property_image = urlMap.get(sbRow.property_image);
        }
        if (Object.keys(updatePayload).length > 0) {
          const { error } = await supabase.from('propertiesbase44').update(updatePayload).eq('row_id', sbRow.row_id);
          if (!error) stats.supabase_rows_updated++;
        }
      }

      perProperty.push({
        id: prop.id, name: prop.property_name, status: 'updated',
        external: externalUrls.length, rehosted: urlMap.size,
        metadata_rows_updated: metaUpdated, supabase_updated: !!sbRow, firstFailure,
      });
    }

    return Response.json({
      success: true,
      dry_run,
      stats,
      total_affected: totalAffected,
      batch,
      batch_size,
      remaining_after_batch: Math.max(0, remaining),
      scan_has_more: scanHasMore,
      properties: perProperty,
    });
  } catch (error) {
    console.error('backfillImagesToBase44 error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});