import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { normalizeStorageUrl } from "@/lib/supabase";

function altsIncomplete(photoUrls, photoAltTexts) {
  const urls = Array.isArray(photoUrls) ? photoUrls.filter(Boolean) : [];
  if (!urls.length) return false;
  const alts = Array.isArray(photoAltTexts) ? photoAltTexts : [];
  if (alts.length < urls.length) return true;
  return urls.some((_, i) => !String(alts[i] || "").trim());
}

/**
 * Fetches photo_alt_texts for a property and provides a generate() function
 * that triggers the generatePropertyAltText backend function (admin only).
 * When autoEnsure is true, missing alts are filled automatically on load.
 */
export function usePropertyAltTexts(propertyId, { autoEnsure = false, photoUrls, photoAltTexts } = {}) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const ensureStarted = useRef(false);

  const { data: altTexts = [] } = useQuery({
    queryKey: ["property-alt-texts", propertyId],
    queryFn: async () => {
      const prop = await base44.entities.Property.get(propertyId);
      return Array.isArray(prop?.photo_alt_texts) ? prop.photo_alt_texts : [];
    },
    enabled: !!propertyId,
    staleTime: 300_000,
    initialData: Array.isArray(photoAltTexts) ? photoAltTexts : undefined,
  });

  const generate = useCallback(async ({ useVision = true } = {}) => {
    if (!propertyId) return null;
    setIsGenerating(true);
    try {
      const res = await base44.functions.invoke("generatePropertyAltText", {
        property_id: propertyId,
        use_vision: useVision,
      });
      const body = res?.data || res;
      await queryClient.invalidateQueries({ queryKey: ["property-alt-texts", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      return body;
    } finally {
      setIsGenerating(false);
    }
  }, [propertyId, queryClient]);

  // Auto-fill any missing alts when the property is viewed
  useEffect(() => {
    if (!autoEnsure || !propertyId || ensureStarted.current) return;
    if (!altsIncomplete(photoUrls, photoAltTexts ?? altTexts)) return;
    ensureStarted.current = true;
    generate({ useVision: false }).catch(() => {
      ensureStarted.current = false;
    });
  }, [autoEnsure, propertyId, photoUrls, photoAltTexts, altTexts, generate]);

  return { altTexts, generate, isGenerating };
}

/**
 * Builds a Map of URL -> alt text from parallel photo_urls and photo_alt_texts arrays.
 * Stores both the raw and normalized URL as keys for flexible lookup.
 */
export function buildAltTextMap(photoUrls, photoAltTexts) {
  const map = new Map();
  if (!Array.isArray(photoUrls) || !Array.isArray(photoAltTexts)) return map;
  photoUrls.forEach((url, i) => {
    if (photoAltTexts[i] && url) {
      map.set(url, photoAltTexts[i]);
      const normalized = normalizeStorageUrl(url) || url;
      if (normalized && normalized !== url) map.set(normalized, photoAltTexts[i]);
    }
  });
  return map;
}

/**
 * Returns alt text for a gallery URL by looking up the altTextMap,
 * falling back to a dynamic alt text with the property name and photo index.
 */
export function getGalleryAlt(altTextMap, url, index, propertyName = "Property") {
  if (url && altTextMap?.has(url)) return altTextMap.get(url);
  if (url) {
    const normalized = normalizeStorageUrl(url) || url;
    if (altTextMap?.has(normalized)) return altTextMap.get(normalized);
  }
  return `${propertyName} - Photo ${index + 1}`;
}
