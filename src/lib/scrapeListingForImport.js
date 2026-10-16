import { base44 } from "@/api/base44Client";
import { cleanScrapedPlainText } from "@/lib/cleanScrapedText";
import {
  discoverListingPhotos,
  preferListingPhotoUrl,
  unwrapFunctionPayload,
} from "@/lib/discoverListingPhotos";
import { splitBathrooms } from "@/lib/splitBathrooms";

export function isHeavyScrapeHost(listingUrl) {
  try {
    const host = new URL(listingUrl).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host.includes("streamline") ||
      host.includes("coastalcarolina") ||
      host.includes("lakefront") ||
      host.includes("guesty") ||
      host.includes("homerunner") ||
      host.endsWith(".luxury")
    );
  } catch {
    return false;
  }
}

function nameFromUrlSlug(listingUrl) {
  try {
    const slug = new URL(listingUrl).pathname.split("/").filter(Boolean).pop() || "";
    if (!slug || slug.length < 3) return "";
    return slug
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .trim();
  } catch {
    return "";
  }
}

function isBadScrapedName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return true;
  return (
    n === "403 forbidden" ||
    n === "404 not found" ||
    n === "access denied" ||
    n.includes("just a moment") ||
    n.startsWith("403 ") ||
    n.startsWith("404 ")
  );
}

/**
 * Shared listing import used by portal Add Property and admin AI add.
 * Prefers scrapePropertyLight (Guesty / Homerunner / amp=1) then enrich photos
 * via discoverListingPhotos.
 */
export async function scrapeListingForImport(listingUrl) {
  const url = String(listingUrl || "").trim();
  if (!url) throw new Error("A listing URL is required");

  let scraped = {};
  let lightOk = false;

  try {
    const res = await base44.functions.invoke("scrapePropertyLight", {
      url,
      // Full details when available; photos_only=false so beds/baths/copy come through
    });
    const body = unwrapFunctionPayload(res);
    const data = body?.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data
      : body;
    const success = body?.success !== false && (data?.property_name || data?.photo_urls?.length);
    if (success && data) {
      const baths = splitBathrooms(data.bathrooms, data.half_bathrooms);
      scraped = {
        property_name: cleanScrapedPlainText(data.property_name) || data.property_name,
        short_summary: cleanScrapedPlainText(data.short_summary) || data.short_summary,
        description: cleanScrapedPlainText(data.description) || data.description,
        location_full: cleanScrapedPlainText(data.location_full) || data.location_full,
        bedrooms: data.bedrooms,
        bathrooms: baths.bathrooms,
        half_bathrooms: baths.half_bathrooms,
        sleeps: data.sleeps,
        property_type: data.property_type || "house",
        photo_urls: Array.isArray(data.photo_urls) ? data.photo_urls : [],
        source: data.source || "light_html",
      };
      lightOk = true;
    }
  } catch {
    /* fall through */
  }

  // Heavy hosts: never wait on full Base44 AI scrape (timeouts / Guesty miss).
  if (!lightOk && !isHeavyScrapeHost(url)) {
    try {
      const res = await base44.functions.invoke("scrapePropertyUrl", { url });
      const body = unwrapFunctionPayload(res);
      const data = body?.data && typeof body.data === "object" ? body.data : body;
      if (data && (data.property_name || data.photo_urls?.length)) {
        const baths = splitBathrooms(data.bathrooms, data.half_bathrooms);
        scraped = {
          ...data,
          bathrooms: baths.bathrooms,
          half_bathrooms: baths.half_bathrooms,
          property_type: data.property_type || "house",
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (isBadScrapedName(scraped.property_name)) {
    scraped.property_name = nameFromUrlSlug(url) || scraped.property_name;
  }

  // Always enrich photos with Guesty-aware discovery (deduped + displayable URLs).
  try {
    const candidates = await discoverListingPhotos(url);
    const discovered = candidates.map((c) => preferListingPhotoUrl(c.url || c)).filter(Boolean);
    if (discovered.length > (scraped.photo_urls?.length || 0)) {
      scraped.photo_urls = discovered;
      scraped.photo_confidence = candidates.map((c) => ({
        url: preferListingPhotoUrl(c.url || c),
        confidence: c.confidence || "high",
        slug_match: Boolean(c.slug_match),
      }));
    } else if (Array.isArray(scraped.photo_urls)) {
      scraped.photo_urls = scraped.photo_urls.map(preferListingPhotoUrl).filter(Boolean);
    }
  } catch {
    if (Array.isArray(scraped.photo_urls)) {
      scraped.photo_urls = scraped.photo_urls.map(preferListingPhotoUrl).filter(Boolean);
    }
  }

  if (!scraped.property_name && !(scraped.photo_urls || []).length) {
    throw new Error("We couldn't read that listing. You can enter the details manually.");
  }

  const baths = splitBathrooms(scraped.bathrooms, scraped.half_bathrooms);
  return {
    ...scraped,
    bathrooms: baths.bathrooms,
    half_bathrooms: baths.half_bathrooms,
    property_type: scraped.property_type || "house",
    listing_url: url,
    ai_imported: true,
  };
}
