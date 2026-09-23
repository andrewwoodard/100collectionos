import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getSupabase, parseImages, normForDedup } from '../../shared/propertyImages.ts';
import { isTestPartner } from '../../shared/testDenylist.ts';
import { isOnPublicRoster } from '../../shared/socialProofRoster.ts';

// Public, read-only marketing data for the /apply pages. No auth required:
// returns hero photography from live partner properties plus the partner
// social-proof strip. Only partner names, markets, and image URLs are exposed.

const HERO_PARTNERS = [
  { key: 'coraltree', match: 'coraltree' },
  { key: 'akers', match: 'akers' },
  { key: 'sea_mountain', match: 'sea mountain' },
  { key: 'southern_comfort', match: 'southern comfort' },
  { key: 'stay_charlottesville', match: 'stay charlottesville' },
];

const HOMEOWNER_PREFERRED = ['sunset shack', 'bridgeview', 'tiki time'];

function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// A partner may appear in public social proof only if it is a REAL partner:
// an actual Partner row (live or approved — 'approved' covers CoralTree,
// which is genuinely operating but not yet flipped to 'live'), professional
// type, on the curated public roster, and passing the test denylist. Rows from
// the marketing-site directory import that are not on the roster never show.
// Pending applicants / leads / onboarding partners are excluded, and nothing
// is ever pulled from PartnerApplication.
function isPublicProfessionalPartner(p) {
  if (!p || !p.partner_name) return false;
  if (p.is_sample === true) return false;
  if (isTestPartner(p.partner_name)) return false;
  if (p.status !== 'live' && p.status !== 'approved') return false;
  if (p.partner_type !== 'property_manager' && p.partner_type !== 'hospitality_group') return false;
  return isOnPublicRoster(p.partner_name);
}

export default async function (req) {
  try {
    const supabase = getSupabase();
    const base44 = createClientFromRequest(req);

    // 1. Active properties with photography (Supabase is the public-site source of truth)
    const { data: rows, error } = await supabase
      .from('propertiesbase44')
      .select('name,partner_name,destination,images')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Best hero per hero-partner (highest photo count wins), plus a deduped pool of all heroes
    const bestByPartner = {};
    const allHeroes = [];
    const seenHero = new Set();
    // Hero fallbacks keyed for matching Base44 properties whose photo_urls is empty
    const supaHeroByProp = new Map(); // `${partner}|${property}` lowercased -> hero url
    const supaHeroByPartner = new Map(); // partner name lowercased -> hero url (most photos wins)
    for (const row of rows || []) {
      const imgs = parseImages(row.images);
      if (!imgs || imgs.length === 0) continue;
      const hero = imgs[0];
      const rec = {
        url: hero,
        count: imgs.length,
        partnerName: cleanName(row.partner_name),
        propertyName: row.name,
        market: row.destination || null,
      };
      supaHeroByProp.set(`${rec.partnerName}|${rec.propertyName}`.toLowerCase(), hero);
      const pk = rec.partnerName.toLowerCase();
      const prev = supaHeroByPartner.get(pk);
      if (!prev || rec.count > prev.count) supaHeroByPartner.set(pk, { url: hero, count: rec.count });
      const dkey = normForDedup(hero);
      if (!seenHero.has(dkey)) {
        seenHero.add(dkey);
        allHeroes.push(rec);
      }
      const pname = rec.partnerName.toLowerCase();
      for (const hp of HERO_PARTNERS) {
        if (pname.includes(hp.match)) {
          if (!bestByPartner[hp.key] || rec.count > bestByPartner[hp.key].count) {
            bestByPartner[hp.key] = rec;
          }
        }
      }
    }

    const heroImages = HERO_PARTNERS
      .map(hp => (bestByPartner[hp.key] ? bestByPartner[hp.key].url : null))
      .filter(Boolean);

    const managerCard = (bestByPartner.coraltree || allHeroes[0] || {}).url || null;

    let homeownerPick = null;
    for (const pref of HOMEOWNER_PREFERRED) {
      homeownerPick = allHeroes.find(h => String(h.propertyName || '').toLowerCase().includes(pref));
      if (homeownerPick) break;
    }
    if (!homeownerPick) {
      homeownerPick = allHeroes.find(h => h.partnerName.toLowerCase().includes('sea mountain')) || allHeroes[1] || null;
    }
    const homeownerHero = homeownerPick ? homeownerPick.url : null;
    const homeownerCard = homeownerHero;

    const closingImage = (allHeroes.find(h => h.url !== managerCard && h.url !== homeownerHero) || allHeroes[allHeroes.length - 1] || {}).url || null;

    // 2. Partner social proof — REAL live professional partners only (service
    // role because Partner RLS blocks public reads). Never PartnerApplication.
    const partners = await base44.asServiceRole.entities.Partner.list('-created_date', 500);
    const professional = partners.filter(isPublicProfessionalPartner);

    // Public site link per partner: an explicit hundred_collection_url wins;
    // otherwise resolve the partner's market to the public destination page
    // (https://theonehundredcollection.com/destinations/{slug}). No match =
    // null, and the strip renders that name as plain text (never a broken link).
    const destinations = await base44.asServiceRole.entities.Destination.list('-created_date', 500);
    const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const destByKey = new Map();
    for (const d of destinations || []) {
      if (!d.slug) continue;
      const url = `https://theonehundredcollection.com/destinations/${d.slug}`;
      const n = String(d.name || '').toLowerCase().trim();
      destByKey.set(n, url);
      destByKey.set(slugify(d.name), url);
      destByKey.set(String(d.slug).toLowerCase(), url);
    }
    const publicUrlFor = (p) => {
      const direct = String(p.hundred_collection_url || '').trim();
      if (/^https?:\/\//i.test(direct)) return direct;
      const m = String(p.market || '').trim().toLowerCase();
      if (!m) return null;
      return destByKey.get(m) || destByKey.get(slugify(m)) || null;
    };

    const partnerStrip = professional
      .map(p => ({ name: cleanName(p.partner_name), market: p.market ? cleanName(p.market) : null, url: publicUrlFor(p) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 3. Featured properties — 3 individual active Properties (not partners),
    // each resolving to a real live professional partner. Sorted by the
    // partner's eligible property count, then property photo count, then date.
    const properties = await base44.asServiceRole.entities.Property.list('-created_date', 1000);
    const partnerById = new Map(professional.map(p => [p.id, p]));
    const byPartner = new Map(); // partner name -> list of eligible property records
    for (const prop of properties || []) {
      if (prop.status !== 'active') continue;
      const partner = partnerById.get(prop.partner_id)
        || professional.find(p => cleanName(p.partner_name).toLowerCase() === cleanName(prop.partner_name).toLowerCase());
      if (!partner) continue;
      const pname = cleanName(partner.partner_name);
      const propname = cleanName(prop.property_name);
      let imgs = Array.isArray(prop.photo_urls) ? prop.photo_urls.filter(Boolean) : [];
      if (imgs.length === 0) {
        // Sync-gap fallback: some Base44 properties still have empty photo_urls
        // while the Supabase mirror has images — use the Supabase hero.
        const s = supaHeroByProp.get(`${pname}|${propname}`.toLowerCase())
          || (supaHeroByPartner.get(pname.toLowerCase()) || {}).url;
        if (s) imgs = [s];
      }
      if (imgs.length === 0) continue;
      const list = byPartner.get(pname) || [];
      list.push({
        propertyName: propname,
        partnerName: pname,
        market: prop.market ? cleanName(prop.market) : (prop.location_full ? cleanName(prop.location_full) : null),
        heroImage: imgs[0],
        photoCount: imgs.length,
        createdDate: prop.created_date,
      });
      byPartner.set(pname, list);
    }
    for (const [, list] of byPartner) {
      list.sort((a, b) => (b.photoCount - a.photoCount)
        || (new Date(b.createdDate || 0).getTime() - new Date(a.createdDate || 0).getTime()));
    }

    // Diversity rule: with 3+ eligible partners show one property from each of
    // the top 3 partners; with fewer, allow 2-3 properties from the strongest.
    const sortedPartners = [...byPartner.entries()]
      .sort((a, b) => (b[1].length - a[1].length) || a[0].localeCompare(b[0]));
    const capPerPartner = sortedPartners.length >= 3 ? 1 : sortedPartners.length === 2 ? 2 : 3;
    const featuredProperties = [];
    for (let round = 0; round < capPerPartner; round++) {
      for (const [, list] of sortedPartners) {
        if (featuredProperties.length >= 3) break;
        if (list[round]) featuredProperties.push(list[round]);
      }
      if (featuredProperties.length >= 3) break;
    }

    return Response.json({
      heroImages,
      managerCard,
      homeownerHero,
      homeownerCard,
      closingImage,
      partnerStrip,
      featuredProperties,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}