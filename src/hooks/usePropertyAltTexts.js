import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { normalizeStorageUrl } from "@/lib/supabase";

/**
 * Fetches photo_alt_texts for a property and provides a generate() function
 * that triggers the generatePropertyAltText backend function (admin only).
 */
export function usePropertyAltTexts(propertyId) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: altTexts = [] } = useQuery({
    queryKey: ["property-alt-texts", propertyId],
    queryFn: async () => {
      const prop = await base44.entities.Property.get(propertyId);
      return Array.isArray(prop?.photo_alt_texts) ? prop.photo_alt_texts : [];
    },
    enabled: !!propertyId,
    staleTime: 300_000,
  });

  const generate = useCallback(async () => {
    if (!propertyId) return;
    setIsGenerating(true);
    try {
      await base44.functions.invoke("generatePropertyAltText", { property_id: propertyId });
      await queryClient.invalidateQueries({ queryKey: ["property-alt-texts", propertyId] });
    } finally {
      setIsGenerating(false);
    }
  }, [propertyId, queryClient]);

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