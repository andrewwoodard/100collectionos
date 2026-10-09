import React, { useMemo } from "react";
import { ImageIcon } from "lucide-react";
import { normalizeStorageUrl, imageUrlFromMetadata } from "@/lib/supabase";
import { usePropertyImages } from "@/hooks/usePropertyImages";
import SupabaseImagesGallery from "./SupabaseImagesGallery";

/**
 * Admin Images tab.
 * Always edits via propertiesbase44.images (and mirrors Property.photo_urls).
 * Seeds the gallery from Supabase images, then photo_urls, then image_metadata.
 */
export default function PropertyImagesTab({
  listingUrl,
  propertyImages = [],
  photoUrls = [],
  supabasePropertyId,
  propertyId,
  seedProperty,
  sbQueryKey,
  onSupabaseId,
}) {
  const { data: metadataImagesData } = usePropertyImages(listingUrl);
  const metadataImages = Array.isArray(metadataImagesData) ? metadataImagesData : [];

  const galleryImages = useMemo(() => {
    const urls = [];
    const seen = new Set();
    const add = (raw) => {
      const url = String(raw || "").trim();
      if (!url) return;
      const norm = normalizeStorageUrl(url) || url;
      if (seen.has(norm)) return;
      seen.add(norm);
      urls.push(url);
    };
    (Array.isArray(propertyImages) ? propertyImages : []).forEach(add);
    (Array.isArray(photoUrls) ? photoUrls : []).forEach(add);
    metadataImages.forEach((img) => add(imageUrlFromMetadata(img)));
    return urls;
  }, [propertyImages, photoUrls, metadataImages]);

  const canEdit = Boolean(propertyId || supabasePropertyId || listingUrl);

  if (!canEdit) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <ImageIcon className="w-10 h-10 mb-3" />
        <p className="text-sm">No property linked yet. Save the property before managing images.</p>
      </div>
    );
  }

  return (
    <SupabaseImagesGallery
      images={galleryImages}
      supabasePropertyId={supabasePropertyId}
      propertyId={propertyId}
      seedProperty={seedProperty}
      sbQueryKey={sbQueryKey}
      listingUrl={listingUrl}
      onSupabaseId={onSupabaseId}
    />
  );
}
