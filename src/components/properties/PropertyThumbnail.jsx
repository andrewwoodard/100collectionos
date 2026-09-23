import React from "react";
import { Building2 } from "lucide-react";
import { usePropertyImages } from "@/hooks/usePropertyImages";
import { imageUrlFromMetadata } from "@/lib/supabase";
import { getImageUrl } from "@/lib/imageUrl";

/**
 * Renders a property thumbnail using the first image from the supabase image_metadata
 * table matching the property's listing_url. Falls back to `fallbackUrl` (e.g. an
 * uploaded photo_url), then to an icon.
 */
export default function PropertyThumbnail({
  listingUrl,
  fallbackUrl,
  propertyName = "Property",
  className = "",
  icon: Icon = Building2,
  size = "thumb",
}) {
  const { data: images = [], isLoading } = usePropertyImages(listingUrl);
  const src = imageUrlFromMetadata(images[0]) || fallbackUrl;

  return (
    <div className={`${className} overflow-hidden flex-shrink-0 bg-slate-100 flex items-center justify-center`}>
      {src ? (
        <img src={getImageUrl(src, size)} className="w-full h-full object-cover" alt={propertyName} />
      ) : isLoading ? (
        <div className="w-full h-full animate-pulse bg-slate-100" />
      ) : (
        <Icon className="w-4 h-4 text-slate-300" />
      )}
    </div>
  );
}