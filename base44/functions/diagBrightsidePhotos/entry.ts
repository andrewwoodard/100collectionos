import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Jimp from 'npm:jimp@0.22.12';
import { Buffer } from 'node:buffer';

// ── Mirrors of the exact filter logic in scrapePropertyUrl ──────────────────

const STOCK_PHOTO_DOMAINS = [
  'unsplash.com','pexels.com','shutterstock.com','istockphoto.com',
  'gettyimages.com','depositphotos.com','alamy.com','dreamstime.com',
  'stock.adobe.com','stocksy.com',
];

const BAD_PATTERNS = [
  'logo','brand','header','footer','icon','favicon','sprite','watermark',
  'badge','svgrepo','cropped-',
  '-16x','-32x','-64x','-96x','-180x','-110x',
  'headshot','staff','team','award','seal','certif',
  'placeholder','noimage','no-image','blank.jpg','default.jpg',
  'person','woman','man','smile','portrait',
];

const SMALL_SIZE_PATTERN = /-(\d{1,2})x(\d{1,2})\./;

function isSmallImageByUrl(lower) {
  const m = lower.match(/[_-](\d+)x(\d+)\.[a-z]/);
  if (!m) return false;
  return parseInt(m[1]) < 600 && parseInt(m[2]) < 600;
}

function canonicalImageUrl(url) {
  const base = url.split('?')[0].split('#')[0];
  return base.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1').toLowerCase();
}

function cleanImageUrl(url) {
  if (url.includes('images.rezfusion.com/cdn-cgi/image/')) {
    const inner = url.replace(/^https:\/\/images\.rezfusion\.com\/cdn-cgi\/image\/[^/]+\//, '');
    if (inner.startsWith('http')) return inner.split('?')[0];
  }
  return url;
}

function isPropertyImage_trace(url, sourceDomain) {
  const lower = url.toLowerCase();
  const reasons = {};

  if (!lower.match(/\.(jpg|jpeg|png|webp)(\?|$|&|#)/)) {
    reasons.extension = 'FAIL — not jpg/jpeg/png/webp';
    return { pass: false, reasons };
  }
  reasons.extension = 'pass';

  const badHit = BAD_PATTERNS.find(k => lower.includes(k.toLowerCase()));
  if (badHit) {
    reasons.bad_patterns = `FAIL — matched pattern "${badHit}"`;
    return { pass: false, reasons };
  }
  reasons.bad_patterns = 'pass — no BAD_PATTERNS match';

  if (SMALL_SIZE_PATTERN.test(lower)) {
    reasons.small_size_tiny = `FAIL — matched tiny-size pattern (e.g. -4x4)`;
    return { pass: false, reasons };
  }
  reasons.small_size_tiny = 'pass';

  if (isSmallImageByUrl(lower)) {
    reasons.small_size_dim = `FAIL — URL encodes dimensions both <600`;
    return { pass: false, reasons };
  }
  reasons.small_size_dim = 'pass';

  if (lower.includes('.svg')) {
    reasons.svg = 'FAIL — SVG';
    return { pass: false, reasons };
  }
  reasons.svg = 'pass';

  if (STOCK_PHOTO_DOMAINS.some(d => lower.includes(d))) {
    reasons.stock = 'FAIL — stock photo domain';
    return { pass: false, reasons };
  }
  reasons.stock = 'pass';

  if (sourceDomain) {
    const urlHost = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const srcHost = sourceDomain.replace(/^www\./, '');
    const ALLOWED_CDNS = [
      'cloudfront.net','imgix.net','cdn.rezfusion.com','images.rezfusion.com',
      'gallery.streamlinevrs.com','media.base44.com',
    ];
    const isSameDomain = urlHost === srcHost || urlHost.endsWith('.'+srcHost);
    const isAllowedCdn = ALLOWED_CDNS.some(cdn => urlHost.endsWith(cdn));
    if (!isSameDomain && !isAllowedCdn) {
      reasons.domain = `FAIL — urlHost="${urlHost}" not same-domain or allowed CDN`;
      return { pass: false, reasons };
    }
    reasons.domain = `pass — urlHost="${urlHost}"`;
  } else {
    reasons.domain = 'skip — no sourceDomain';
  }

  return { pass: true, reasons };
}

function filenameStem(url) {
  const path = url.split('?')[0].split('#')[0];
  const filename = path.split('/').pop() || '';
  return filename
    .replace(/\.[a-z]+$/i, '')
    .replace(/@\d+x?$/i, '')
    .replace(/[_-]\d+x\d+$/i, '')
    .replace(/@\d+w$/i, '')
    .replace(/[_-](large|medium|small|thumb|thumbnail|sm|md|lg|xl|full|original)$/i, '')
    .toLowerCase();
}

async function sha256hex(buf) {
  try {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch { return null; }
}

async function computeAHash(buf) {
  try {
    const img = await Jimp.read(Buffer.from(buf));
    img.resize(8,8).greyscale();
    const px = [];
    img.scan(0,0,8,8,(_x,_y,idx) => px.push(img.bitmap.data[idx]));
    const avg = px.reduce((a,b)=>a+b,0)/64;
    return px.map(p=>(p>=avg?'1':'0')).join('');
  } catch(e) { return `error:${e.message}`; }
}

async function buildFingerprint(url) {
  const stem = filenameStem(url);
  try {
    const res = await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)});
    if (!res.ok) return { url, stem, sha256: null, aHash: null, fetchStatus: res.status, fetchOk: false };
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'unknown';
    const bytes = buf.byteLength;
    const [hash, aHash] = await Promise.all([sha256hex(buf), computeAHash(buf)]);
    return { url, stem, sha256: hash, aHash, fetchStatus: 200, fetchOk: true, contentType, bytes };
  } catch(e) {
    return { url, stem, sha256: null, aHash: null, fetchStatus: null, fetchOk: false, error: e.message };
  }
}

function hammingDistance(h1, h2) {
  let d = 0;
  for (let i = 0; i < Math.min(h1.length, h2.length); i++) if (h1[i] !== h2[i]) d++;
  return d;
}

// ── Deno.serve ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const url = 'https://seamountainvacations.com/browse-properties/brightside-house/?hub_property_id=SXRlbTozNDU4MQ==';
    const sourceDomain = 'seamountainvacations.com';

    const report = { url, steps: [], photos: [], logo_lookup: null };

    // ── Step 1: Partner logo lookup ─────────────────────────────────────────
    const knownLogoUrls = [];
    try {
      const profiles = await base44.asServiceRole.entities.PartnerProfile.filter({ partner_email: user.email });
      for (const p of profiles) if (p.company_logo_url) knownLogoUrls.push({ url: p.company_logo_url, source: 'PartnerProfile.company_logo_url' });
    } catch(e) { report.logo_lookup_error = e.message; }
    try {
      // Also check partner_id-based lookup — try to find partner by email
      const partners = await base44.asServiceRole.entities.Partner.filter({ primary_contact_email: user.email });
      if (partners.length > 0) {
        const pid = partners[0].id;
        const assets = await base44.asServiceRole.entities.MediaAsset.filter({ partner_id: pid, asset_type: 'logo' });
        for (const a of assets) if (a.file_url) knownLogoUrls.push({ url: a.file_url, source: `MediaAsset.file_url (partner_id=${pid})` });
      }
    } catch {}

    report.logo_lookup = {
      user_email: user.email,
      found: knownLogoUrls.length,
      entries: knownLogoUrls,
    };

    // ── Step 2: Fetch logo fingerprints ─────────────────────────────────────
    const logoFps = knownLogoUrls.length > 0
      ? (await Promise.allSettled(knownLogoUrls.map(e => buildFingerprint(e.url))))
          .filter(r => r.status === 'fulfilled').map(r => r.value)
      : [];
    report.logo_fingerprints = logoFps.map(lf => ({
      url: lf.url, stem: lf.stem, sha256: lf.sha256, aHash: lf.aHash,
      fetchOk: lf.fetchOk, contentType: lf.contentType, bytes: lf.bytes,
    }));

    // ── Step 3: Rezfusion fallback (clean page HTML CDN extraction) ──────────
    const urlObj = new URL(url);
    const cleanUrl = `${urlObj.origin}${urlObj.pathname}`;
    let rezfusionRaw = [];
    try {
      const cleanRes = await fetch(cleanUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });
      if (cleanRes.ok) {
        const cleanHtml = await cleanRes.text();
        // Strip header/nav/footer before extraction
        const strippedHtml = cleanHtml
          .replace(/<header[\s>][\s\S]*?<\/header>/gi, '')
          .replace(/<nav[\s>][\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s>][\s\S]*?<\/footer>/gi, '');

        const cdnPatterns = [
          /gallery\.streamlinevrs\.com\/[^\s"'\\>]+\.(?:jpg|jpeg|png|webp)/gi,
          /dh[a-z0-9]+\.cloudfront\.net\/uploads\/[^\s"'\\>]+\.(?:jpg|jpeg|png|webp)/gi,
          /images\.rezfusion\.com\/[^\s"'\\>]+\.(?:jpg|jpeg|png|webp)/gi,
        ];
        const found = new Set();
        for (const pattern of cdnPatterns) {
          let m;
          while ((m = pattern.exec(strippedHtml)) !== null) {
            const fullUrl = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
            const cleaned = cleanImageUrl(fullUrl.replace(/\\\//g, '/'));
            found.add(cleaned);
          }
        }
        // Also scan the RAW (non-stripped) HTML to see how many CDN URLs exist total
        const foundRaw = new Set();
        for (const pattern of cdnPatterns.map(p => new RegExp(p.source, p.flags))) {
          let m;
          const rawHtml = cleanHtml;
          while ((m = pattern.exec(rawHtml)) !== null) {
            const fullUrl = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
            foundRaw.add(cleanImageUrl(fullUrl.replace(/\\\//g, '/')));
          }
        }
        report.steps.push({
          step: 'rezfusion_fallback_cdn_scan',
          raw_html_cdn_urls: foundRaw.size,
          after_header_strip: found.size,
          urls_raw: Array.from(foundRaw),
          urls_after_strip: Array.from(found),
          note: 'CDN URLs extracted from clean page HTML — no isPropertyImage filter applied yet at this stage (CDN images exempt from domain check)',
        });
        rezfusionRaw = Array.from(found);
      }
    } catch(e) { report.steps.push({ step: 'rezfusion_fallback_cdn_scan', error: e.message }); }

    // ── Step 4: OG image ────────────────────────────────────────────────────
    let ogImages = [];
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const html = await res.text();
        const ogRaw = [];
        for (const m of html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)) ogRaw.push(m[1]);
        for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi)) ogRaw.push(m[1]);
        ogImages = ogRaw.filter(u => {
          const t = isPropertyImage_trace(u, sourceDomain);
          return t.pass;
        });
        report.steps.push({ step: 'og_image_extraction', raw_count: ogRaw.length, after_filter: ogImages.length, urls: ogImages });
      }
    } catch {}

    // ── Step 5: Combine, URL-dedup, build fingerprints, logo-filter ─────────
    const allPhotos = new Set();
    rezfusionRaw.forEach(u => allPhotos.add(u));
    ogImages.forEach(u => allPhotos.add(u));

    // URL-canonical dedup
    const seenCanon = new Set();
    const urlDeduped = Array.from(allPhotos).filter(u => {
      const k = canonicalImageUrl(u);
      if (seenCanon.has(k)) return false;
      seenCanon.add(k); return true;
    });

    report.steps.push({
      step: 'url_canonical_dedup',
      before: allPhotos.size,
      after: urlDeduped.length,
    });

    // Per-photo trace
    const photoFps = await Promise.all(urlDeduped.map(buildFingerprint));

    // SHA-256 content dedup
    const seenSha = new Set();
    const contentDeduped = photoFps.filter(fp => {
      if (!fp.sha256) return true;
      if (seenSha.has(fp.sha256)) return false;
      seenSha.add(fp.sha256); return true;
    });

    report.steps.push({
      step: 'sha256_content_dedup',
      before: photoFps.length,
      after: contentDeduped.length,
      removed: photoFps.filter(fp => fp.sha256 && !contentDeduped.includes(fp)).map(fp => fp.url),
    });

    // Logo matching
    const logoMatchResults = contentDeduped.map(fp => {
      if (logoFps.length === 0) return { url: fp.url, matched: false, reason: 'no logo fingerprints available' };
      for (const lf of logoFps) {
        if (lf.stem && fp.stem && lf.stem.length >= 5 && lf.stem === fp.stem)
          return { url: fp.url, matched: true, signal: 'stem', stem: fp.stem };
        if (lf.sha256 && fp.sha256 && lf.sha256 === fp.sha256)
          return { url: fp.url, matched: true, signal: 'sha256' };
        if (lf.aHash && fp.aHash && !lf.aHash.startsWith('error') && !fp.aHash.startsWith('error')) {
          const dist = hammingDistance(lf.aHash, fp.aHash);
          if (dist <= 10) return { url: fp.url, matched: true, signal: 'ahash', hamming: dist };
        }
      }
      const aHashComparisons = logoFps.map(lf => {
        if (!lf.aHash || !fp.aHash || lf.aHash.startsWith('error') || fp.aHash.startsWith('error'))
          return { logo_url: lf.url, dist: null, note: 'one or both aHash null/error' };
        return { logo_url: lf.url, dist: hammingDistance(lf.aHash, fp.aHash) };
      });
      return { url: fp.url, matched: false, aHashComparisons, photo_stem: fp.stem, logo_stems: logoFps.map(l=>l.stem) };
    });

    // Build final per-photo detail
    for (let i = 0; i < contentDeduped.length; i++) {
      const fp = contentDeduped[i];
      const trace = isPropertyImage_trace(fp.url, sourceDomain);
      const logoMatch = logoMatchResults[i];
      const source = rezfusionRaw.includes(fp.url) ? 'rezfusion_fallback_cdn'
                   : ogImages.includes(fp.url) ? 'og_image'
                   : 'html_body_scan';
      report.photos.push({
        slot: i + 1,
        url: fp.url,
        source,
        extension: fp.url.split('?')[0].split('.').pop().toLowerCase(),
        fingerprint: {
          fetchOk: fp.fetchOk,
          contentType: fp.contentType || null,
          bytes: fp.bytes || null,
          sha256: fp.sha256,
          aHash: fp.aHash,
          stem: fp.stem,
        },
        filter_trace: {
          ...trace.reasons,
          logo_match: logoMatch.matched
            ? `WOULD REMOVE — matched by ${logoMatch.signal}`
            : `pass — no logo match (${logoMatch.reason || `aHash distances: ${JSON.stringify(logoMatch.aHashComparisons)}`})`,
        },
        survived: !logoMatch.matched,
      });
    }

    return Response.json(report, { headers: { 'Content-Type': 'application/json' } });
  } catch(err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});