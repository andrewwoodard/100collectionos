import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useApplyPageMedia } from "@/hooks/useApplyPageMedia";
import {
  FALLBACK_HERO_IMAGES,
  FALLBACK_IMAGES,
  FALLBACK_PARTNER_STRIP,
} from "@/components/apply/applyShowcaseData";

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Curator picks live as flat fields on the singleton (featured_property_N_*).
// Only a slot with a URL, a name, and a photo counts as a real pick; this
// filters partial entries so the backfill logic stays correct.
function buildFeaturedProperties(media, autoPull) {
  const picks = [];
  for (let n = 1; n <= 3; n++) {
    const url = clean(media[`featured_property_${n}_url`]);
    const name = clean(media[`featured_property_${n}_name`]);
    const photo = clean(media[`featured_property_${n}_photo_url`]);
    if (!url || !name) continue;
    picks.push({
      url,
      propertyName: name,
      partnerName: clean(media[`featured_property_${n}_partner_name`]) || "",
      market: clean(media[`featured_property_${n}_market`]) || null,
      heroImage: photo || null,
      alt: clean(media[`featured_property_${n}_photo_alt`]) || name,
    });
  }
  const auto = Array.isArray(autoPull) ? autoPull : [];
  const usedNames = new Set(picks.map((p) => p.propertyName.toLowerCase()));
  const backfill = auto.filter((p) => !usedNames.has(String(p.propertyName || "").toLowerCase()));
  return [...picks, ...backfill].slice(0, 3);
}

// Live marketing data for the /apply pages: hero photography and partner
// social proof, with admin-controlled overrides from the ApplyPageMedia
// singleton layered on top. Curated fallbacks keep the page beautiful
// if the live call fails or nothing is set.
export function useApplyShowcase() {
  const { data } = useQuery({
    queryKey: ["apply-showcase"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getApplyShowcase", {});
      return res.data || {};
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });
  const media = useApplyPageMedia();

  const d = data || {};
  const heroOverrides = (Array.isArray(media.hero_rotation_urls) ? media.hero_rotation_urls : []).filter(Boolean);

  return {
    heroImages:
      heroOverrides.length > 0
        ? heroOverrides
        : Array.isArray(d.heroImages) && d.heroImages.length > 0
          ? d.heroImages
          : FALLBACK_HERO_IMAGES,
    heroAltTexts: Array.isArray(media.hero_rotation_alt_texts) ? media.hero_rotation_alt_texts : [],
    managerCard: clean(media.manager_card_hero_url) || d.managerCard || FALLBACK_IMAGES.managerCard,
    managerCardAlt: clean(media.manager_card_hero_alt) || "The 100 Collection",
    homeownerCard: clean(media.homeowner_card_hero_url) || d.homeownerCard || FALLBACK_IMAGES.homeownerHero,
    homeownerCardAlt: clean(media.homeowner_card_hero_alt) || "The 100 Collection",
    partnerCard: clean(media.existing_partner_card_hero_url) || FALLBACK_IMAGES.partnerCard,
    partnerCardAlt: clean(media.existing_partner_card_hero_alt) || "The 100 Collection",
    homeownerHero: clean(media.homeowner_form_hero_url) || d.homeownerHero || FALLBACK_IMAGES.homeownerHero,
    closingImage: clean(media.closing_editorial_url) || d.closingImage || FALLBACK_IMAGES.closingImage,
    closingAlt: clean(media.closing_editorial_alt) || "The 100 Collection",
    closingQuote: clean(media.closing_editorial_quote) || "Every home is a story worth telling.",
    managerFormHero: clean(media.manager_form_hero_url),
    partnerStrip:
      Array.isArray(d.partnerStrip) && d.partnerStrip.length > 0
        ? d.partnerStrip
        : FALLBACK_PARTNER_STRIP,
    // Curator-picked featured properties (from the ApplyPageMedia singleton)
    // take priority; remaining slots backfill with the auto-pulled properties
    // from getApplyShowcase. A curator pick needs at least a URL + name + photo.
    featuredProperties: buildFeaturedProperties(media, d.featuredProperties),
    featuredFallback: FALLBACK_IMAGES.recentlyWelcomed,
  };
}