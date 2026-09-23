import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SANITY_PROJECT_ID = 'b2yibrs1';
const SANITY_DATASET = 'production';
const SANITY_API_VERSION = '2021-06-07';

const DEST_META = {
  "orange-beach-and-gulf-shores": { state: "Alabama", region: "Southeast" },
  "scottsdale": { state: "Arizona", region: "Southwest" },
  "san-diego": { state: "California", region: "West" },
  "newport-beach": { state: "California", region: "West" },
  "aspen-snowmass": { state: "Colorado", region: "Mountain West" },
  "vail-valley": { state: "Colorado", region: "Mountain West" },
  "winter-park": { state: "Colorado", region: "Mountain West" },
  "telluride": { state: "Colorado", region: "Mountain West" },
  "washington-dc": { state: "District of Columbia", region: "Northeast" },
  "perdido-key": { state: "Florida", region: "Southeast" },
  "orlando": { state: "Florida", region: "Southeast" },
  "south-walton-florida": { state: "Florida", region: "Southeast" },
  "anna-maria-island-and-sarasota": { state: "Florida", region: "Southeast" },
  "destin": { state: "Florida", region: "Southeast" },
  "amelia-island": { state: "Florida", region: "Southeast" },
  "30a": { state: "Florida", region: "Southeast" },
  "tybee-island": { state: "Georgia", region: "Southeast" },
  "suches-and-blairsville": { state: "Georgia", region: "Southeast" },
  "blue-ridge": { state: "Georgia", region: "Southeast" },
  "st-simons-island": { state: "Georgia", region: "Southeast" },
  "big-canoe": { state: "Georgia", region: "Southeast" },
  "big-island-hawaii": { state: "Hawaii", region: "Pacific" },
  "kauai": { state: "Hawaii", region: "Pacific" },
  "sun-valley": { state: "Idaho", region: "Mountain West" },
  "boothbay-and-midcoast-maine": { state: "Maine", region: "Northeast" },
  "ocean-city-maryland": { state: "Maryland", region: "Mid-Atlantic" },
  "martha-s-vineyard": { state: "Massachusetts", region: "Northeast" },
  "southwest-michigan": { state: "Michigan", region: "Midwest" },
  "big-sky-montana": { state: "Montana", region: "Mountain West" },
  "west-yellowstone": { state: "Montana", region: "Mountain West" },
  "red-lodge-montana": { state: "Montana", region: "Mountain West" },
  "santa-fe": { state: "New Mexico", region: "Southwest" },
  "finger-lakes": { state: "New York", region: "Northeast" },
  "holden-beach": { state: "North Carolina", region: "Southeast" },
  "greater-asheville": { state: "North Carolina", region: "Southeast" },
  "topsail-island": { state: "North Carolina", region: "Southeast" },
  "wrightsville-beach": { state: "North Carolina", region: "Southeast" },
  "highlands": { state: "North Carolina", region: "Southeast" },
  "outer-banks": { state: "North Carolina", region: "Southeast" },
  "ocean-isle-beach-and-sunset-beach": { state: "North Carolina", region: "Southeast" },
  "boone-blowing-rock-and-banner-elk": { state: "North Carolina", region: "Southeast" },
  "sunriver": { state: "Oregon", region: "Pacific Northwest" },
  "willamette-valley": { state: "Oregon", region: "Pacific Northwest" },
  "cannon-beach-and-arch-cape": { state: "Oregon", region: "Pacific Northwest" },
  "bend": { state: "Oregon", region: "Pacific Northwest" },
  "pocono-mountains": { state: "Pennsylvania", region: "Mid-Atlantic" },
  "north-myrtle-beach": { state: "South Carolina", region: "Southeast" },
  "myrtle-beach": { state: "South Carolina", region: "Southeast" },
  "charleston": { state: "South Carolina", region: "Southeast" },
  "clemson-lake-keowee-and-lake-hartwell": { state: "South Carolina", region: "Southeast" },
  "hilton-head-island": { state: "South Carolina", region: "Southeast" },
  "folly-beach": { state: "South Carolina", region: "Southeast" },
  "kiawah-island": { state: "South Carolina", region: "Southeast" },
  "isle-of-palms": { state: "South Carolina", region: "Southeast" },
  "gatlinburg-and-pigeon-forge": { state: "Tennessee", region: "Southeast" },
  "nashville": { state: "Tennessee", region: "Southeast" },
  "park-city": { state: "Utah", region: "Mountain West" },
  "st-george": { state: "Utah", region: "Mountain West" },
  "stowe": { state: "Vermont", region: "Northeast" },
  "killington-vacation-rentals": { state: "Vermont", region: "Northeast" },
  "virginia-beach-and-sandbridge-beach": { state: "Virginia", region: "Mid-Atlantic" },
  "charlottesville": { state: "Virginia", region: "Mid-Atlantic" },
  "chincoteague-virginia": { state: "Virginia", region: "Mid-Atlantic" },
  "shenandoah-valley-and-massanutten": { state: "Virginia", region: "Mid-Atlantic" },
  "harpers-ferry": { state: "West Virginia", region: "Mid-Atlantic" },
  "jackson-hole": { state: "Wyoming", region: "Mountain West" },
  "cody-and-east-yellowstone": { state: "Wyoming", region: "Mountain West" },
  "huatulco": { state: "Mexico", region: "International" },
  "los-cabos": { state: "Mexico", region: "International" },
  "mont-tremblant": { state: "Canada", region: "International" },
  "the-bahamas": { state: "Caribbean", region: "International" },
  "turks-and-caicos": { state: "Caribbean", region: "International" },
  "tamarindo-costa-rica": { state: "Central America", region: "International" },
};

function slugToName(slug) {
  if (!slug) return null;
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+And\s+/g, ' & ')
    .trim();
}

async function sanityQuery(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encoded}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Sanity API error: ${resp.status}`);
  const data = await resp.json();
  return data.result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // 1. Fetch all VRMs from Sanity
    const vrms = await sanityQuery(
      `*[_type=="vrm"]{_id,slug,title,destinations[]->{_id,slug,title},"properties":showcase[]{name,roomcount,bathrooms,occupancy,slug,propertyLink}}`
    );

    // 2. Fetch all existing partners and properties from the DB
    let existingPartners = [];
    let page = await base44.asServiceRole.entities.Partner.list('created_date', 200);
    existingPartners = page;
    // If there might be more than 200, keep paginating
    while (page.length === 200) {
      page = await base44.asServiceRole.entities.Partner.list('created_date', 200, existingPartners.length);
      existingPartners = [...existingPartners, ...page];
    }

    let existingProperties = [];
    page = await base44.asServiceRole.entities.Property.list('created_date', 200);
    existingProperties = page;
    while (page.length === 200) {
      page = await base44.asServiceRole.entities.Property.list('created_date', 200, existingProperties.length);
      existingProperties = [...existingProperties, ...page];
    }

    // Build lookup sets for deduplication
    const existingPartnerNames = new Set(existingPartners.map(p => p.partner_name?.toLowerCase().trim()));
    const existingPropertyKeys = new Set(
      existingProperties.map(p => `${p.partner_name?.toLowerCase().trim()}||${p.property_name?.toLowerCase().trim()}`)
    );
    const partnerNameToId = {};
    for (const p of existingPartners) {
      partnerNameToId[p.partner_name?.toLowerCase().trim()] = p.id;
    }

    let newPartners = 0;
    let newProperties = 0;

    for (const vrm of vrms) {
      if (!vrm.title && !vrm.slug?.current) continue;
      const partnerName = vrm.title || slugToName(vrm.slug?.current);
      if (!partnerName || partnerName === 'Test Group') continue;

      const partnerKey = partnerName.toLowerCase().trim();
      let partnerId = partnerNameToId[partnerKey];

      // Create partner if it doesn't exist
      if (!existingPartnerNames.has(partnerKey)) {
        let market = null, region = null;
        if (vrm.destinations && vrm.destinations.length > 0) {
          const dest = vrm.destinations[0];
          market = dest.title || slugToName(dest.slug?.current);
          const destMeta = DEST_META[dest.slug?.current];
          if (destMeta) region = destMeta.region;
        }
        const created = await base44.asServiceRole.entities.Partner.create({
          partner_name: partnerName,
          company_name: partnerName,
          market,
          region,
          partner_type: 'property_manager',
          status: 'live',
          onboarding_stage: 'live',
          contract_status: 'signed',
          billing_status: 'active',
        });
        partnerId = created.id;
        partnerNameToId[partnerKey] = partnerId;
        existingPartnerNames.add(partnerKey);
        newPartners++;
        await new Promise(r => setTimeout(r, 50));
      }

      // Process properties for this VRM
      if (vrm.properties) {
        const market = vrm.destinations?.[0]?.title || slugToName(vrm.destinations?.[0]?.slug?.current) || null;
        const destSlug = vrm.destinations?.[0]?.slug?.current;

        for (const prop of vrm.properties) {
          const propSlug = prop.slug?.current;
          const propName = prop.name || slugToName(propSlug);
          if (!propName) continue;

          const propKey = `${partnerKey}||${propName.toLowerCase().trim()}`;
          if (existingPropertyKeys.has(propKey)) continue;

          await base44.asServiceRole.entities.Property.create({
            property_name: propName,
            partner_id: partnerId || null,
            partner_name: partnerName,
            market,
            bedrooms: prop.roomcount ? parseFloat(prop.roomcount) : null,
            bathrooms: prop.bathrooms ? parseFloat(prop.bathrooms) : null,
            sleeps: prop.occupancy ? parseFloat(prop.occupancy) : null,
            listing_url: prop.propertyLink || (destSlug && propSlug ? `https://theonehundredcollection.com/destinations/${destSlug}/${propSlug}` : null),
            status: 'active',
            onboarding_status: 'complete',
            photography_status: 'approved',
          });
          existingPropertyKeys.add(propKey);
          newProperties++;
          await new Promise(r => setTimeout(r, 30));
        }
      }
    }

    return Response.json({
      success: true,
      newPartners,
      newProperties,
      message: newPartners === 0 && newProperties === 0
        ? 'Everything is up to date — no new partners or properties found.'
        : `Sync complete: added ${newPartners} new partner(s) and ${newProperties} new property(ies).`,
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});