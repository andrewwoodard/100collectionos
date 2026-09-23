import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { imageUrlFromMetadata } from "@/lib/supabase";

/**
 * Fetches all image_metadata rows for a property, matching on the property_url
 * (booking/engine URL) or proppage (internal path) column via the imageMetadata backend function.
 */
export function usePropertyImages(propertyUrl) {
  return useQuery({
    queryKey: ["property-images", propertyUrl],
    queryFn: async () => {
      const res = await base44.functions.invoke("imageMetadata", {
        action: "list",
        property_url: propertyUrl,
      });
      return Array.isArray(res.data?.images) ? res.data.images : [];
    },
    enabled: !!propertyUrl,
    staleTime: 60_000,
  });
}

/**
 * Returns the first (cover) image URL from image_metadata for the given property_url,
 * or null if none found.
 */
export function usePropertyThumbnail(propertyUrl) {
  const { data: images = [] } = usePropertyImages(propertyUrl);
  return imageUrlFromMetadata(images[0]) || null;
}