// Social proof metrics for branded email templates.
// Update these constants as the 100 Collection network grows.

export const PARTNERS_COUNT = 91;
export const DESTINATIONS_COUNT = 79;
export const PROPERTIES_COUNT = 800;

// Fallback hero image for activation/welcome emails when no property photo
// is available for the partner's market. If this URL fails to load, the email
// template shows a cream (#FAFAF8) background in its place.
export const FALLBACK_HERO_IMAGE = "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&auto=format&fit=crop&q=80";

// Market-specific hero images. Add entries here as destination imagery becomes
// available. The lookup is a case-insensitive partial match.
const MARKET_HERO_IMAGES: Record<string, string> = {
  // Beach / coastal destinations
  "nags head": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop&q=80",
  "outer banks": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop&q=80",
  "myrtle beach": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop&q=80",
  "north myrtle beach": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop&q=80",
  "cherry grove": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop&q=80",
  "hilton head": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop&q=80",
  "destin": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop&q=80",
  // Mountain destinations
  "aspen": "https://images.unsplash.com/photo-1605146768851-eda79da3988a?w=1200&auto=format&fit=crop&q=80",
  "park city": "https://images.unsplash.com/photo-1605146768851-eda79da3988a?w=1200&auto=format&fit=crop&q=80",
  // Desert
  "scottsdale": "https://images.unsplash.com/photo-1585230809292-79890a0c960e?w=1200&auto=format&fit=crop&q=80",
};

export function getMarketHeroImage(market?: string): string {
  if (!market) return FALLBACK_HERO_IMAGE;
  const key = market.toLowerCase().trim();
  for (const [k, v] of Object.entries(MARKET_HERO_IMAGES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return FALLBACK_HERO_IMAGE;
}

// Pre-built social proof strings. Use **double asterisks** to bold metrics
// in gold (#C9A96E). The email template parses these markers.
export const SOCIAL_PROOF = {
  activation: `Trusted by **${PARTNERS_COUNT}+ premier vacation rental partners** across ${DESTINATIONS_COUNT}+ destinations.`,
  application: `${PARTNERS_COUNT}+ partners. ${DESTINATIONS_COUNT}+ destinations. **One curated Collection.**`,
  homeowner: `Homeowners choose The 100 Collection for the **magazine-quality feature story** on every home.`,
};

// "What happens next" 3-step sections for different email contexts.
// Each step: { number, title, body }

export const WHAT_HAPPENS_NEXT = {
  // Application auto-reply (portfolio review process)
  application: [
    { title: "Portfolio review", body: "Our curation team reviews your properties within 3-5 business days to ensure they meet the 100 Collection standard." },
    { title: "We'll be in touch", body: "You'll hear from us with next steps by email, whether that's approval, additional questions, or a warm decline." },
    { title: "Go live", body: "Once approved, your properties get featured on theonehundredcollection.com and start reaching our curated audience." },
  ],
  // Activation email for property managers
  activation: [
    { title: "Set up your profile", body: "Add your founder bio, headshot, and favorite local spots. This is what appears on your public destination page." },
    { title: "Add your properties", body: "Paste any listing URL and our AI pre-fills the intake form. Takes about 3 minutes per property." },
    { title: "Go live", body: "Once we approve each property, your listings are live on theonehundredcollection.com within 24 hours." },
  ],
  // Homeowner batch approval / activation (editorial process)
  homeowner: [
    { title: "Editorial interview", body: "Our writer schedules a 30-minute call to capture the story of your home and its guests." },
    { title: "Feature written and reviewed", body: "Draft feature produced within 5 business days. You review and approve before it goes live." },
    { title: "Your home debuts", body: "Your listing goes live on theonehundredcollection.com with a magazine-quality feature." },
  ],
};