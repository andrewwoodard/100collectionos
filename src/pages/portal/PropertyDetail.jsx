import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useParams, Link } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import PortalStatusBadge from "../../components/portal/PortalStatusBadge";
import PropertyEditModal from "../../components/portal/PropertyEditModal";
import PropertyContentEditor from "../../components/portal/PropertyContentEditor";
import PropertyDetailsEditor from "../../components/portal/PropertyDetailsEditor";
import PropertyAmenitiesEditor from "../../components/portal/PropertyAmenitiesEditor";
import OffboardingModal from "../../components/portal/OffboardingModal";
import { normalizeStorageUrl, imageUrlFromMetadata } from "@/lib/supabase";
import { getImageUrl } from "@/lib/imageUrl";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { usePropertyImages } from "@/hooks/usePropertyImages";
import { buildAltTextMap, getGalleryAlt } from "@/hooks/usePropertyAltTexts";
import {
  ChevronLeft, MapPin, Bed, Bath, Users, ExternalLink, Pencil,
  AlertCircle, ImageIcon, X, Home as HomeIcon, Tag, Settings,
} from "lucide-react";

export default function PropertyDetail() {
  const { id } = useParams();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [offboardingModalOpen, setOffboardingModalOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);

  const switchToOffboarding = () => { setEditModalOpen(false); setTimeout(() => setOffboardingModalOpen(true), 0); };
  const switchToEdit = () => { setOffboardingModalOpen(false); setTimeout(() => setEditModalOpen(true), 0); };

  // 1. Base44 Property — try direct get, fall back to supabase_property_id lookup
  //    (id from URL may be a Supabase numeric ID for portfolio properties)
  const { data: baseProperty, isLoading: isLoadingBase } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      try {
        return await base44.entities.Property.get(id);
      } catch {
        // id might be a Supabase numeric ID — look up Base44 Property by supabase_property_id
        try {
          const results = await base44.entities.Property.filter({ supabase_property_id: id });
          return results[0] || null;
        } catch {
          return null;
        }
      }
    },
    enabled: !!id,
    retry: false,
  });

  // 2. PropertySubmission — works when id is a submission id (for status/notes)
  const { data: submission, isLoading: isLoadingSub } = useQuery({
    queryKey: ["submission", id],
    queryFn: async () => {
      const results = await base44.entities.PropertySubmission.filter({ id });
      return results[0] || null;
    },
    enabled: !!id,
  });

  // 3. Determine Supabase lookup strategy (same pattern as admin PropertyDetail)
  const sbId = baseProperty?.supabase_property_id || submission?.supabase_property_id;
  const hasSbId = !!sbId && sbId !== "null" && sbId !== "undefined";
  const lookupUrl = baseProperty?.listing_url || baseProperty?.vrm_url || submission?.listing_url;
  const sbQueryKey = hasSbId ? sbId : (lookupUrl ? `url:${lookupUrl}` : `direct:${id}`);

  const { data: supabaseProperty, isLoading: isLoadingSb } = useQuery({
    queryKey: ["supabase-property", sbQueryKey],
    queryFn: async () => {
      if (hasSbId) {
        const res = await base44.functions.invoke("supabaseProperties", { action: "get", id: sbId });
        return res.data?.property || null;
      }
      if (lookupUrl) {
        const res = await base44.functions.invoke("supabaseProperties", { action: "get_by_url", url: lookupUrl });
        return res.data?.property || null;
      }
      // No Base44 entity — try the URL id directly as a Supabase property ID
      const res = await base44.functions.invoke("supabaseProperties", { action: "get", id });
      return res.data?.property || null;
    },
    enabled: !!id && !isLoadingBase && !isLoadingSub,
  });

  // 4. Review notes (only if we found a submission)
  const { data: notes = [] } = useQuery({
    queryKey: ["review-notes-partner", submission?.id],
    queryFn: async () => base44.entities.ReviewNote.filter({ submission_id: submission.id }),
    enabled: !!submission?.id,
  });

  // 5. Merge: Supabase wins, then Base44 Property, then submission fills gaps
  const property = useMemo(() => {
    let merged = {};
    if (submission) merged = { ...submission };
    if (baseProperty) merged = { ...merged, ...baseProperty };
    if (supabaseProperty) {
      for (const [k, v] of Object.entries(supabaseProperty)) {
        if (v !== null && v !== undefined && v !== "") merged[k] = v;
      }
    }
    // Preserve key identifiers
    if (baseProperty?.id) merged.id = baseProperty.id;
    else if (supabaseProperty?.id) merged.id = supabaseProperty.id;
    else if (submission?.id) merged.id = submission.id;
    return Object.keys(merged).length > 0 ? merged : null;
  }, [baseProperty, submission, supabaseProperty]);

  // Image metadata gallery (linked by listing URL)
  const listingUrl = property?.listing_url || property?.vrm_url;
  const { data: metadataImages = [] } = usePropertyImages(listingUrl);

  // Build gallery URLs: Supabase images → Base44 photo_urls → property_image → metadata images
  const galleryUrls = useMemo(() => {
    const urls = [];
    const seen = new Set();
    const add = (url) => {
      if (!url) return;
      const normalized = normalizeStorageUrl(url) || url;
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    };
    if (Array.isArray(property?.images)) property.images.forEach(add);
    if (Array.isArray(property?.photo_urls)) property.photo_urls.forEach(add);
    if (property?.property_image) add(property.property_image);
    metadataImages.forEach(img => add(imageUrlFromMetadata(img)));
    return urls;
  }, [property, metadataImages]);

  const altTextMap = useMemo(
    () => buildAltTextMap(property?.photo_urls, property?.photo_alt_texts),
    [property?.photo_urls, property?.photo_alt_texts]
  );

  const isLoading = isLoadingBase || isLoadingSub || isLoadingSb;

  // Helper: first non-null value from multiple field names (handles Supabase vs Base44 naming)
  const val = (...keys) => {
    for (const k of keys) {
      const v = property?.[k];
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };

  // Compute 100 Collection URL
  const hundredUrl = property?.hundred_collection_url || (() => {
    const destination = (val("market", "location_city") || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const prefix = destination ? `/destinations/${destination}/` : "/destinations/";
    const slug = (val("property_name") || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug ? `https://theonehundredcollection.com${prefix}${slug}` : null;
  })();

  // Status for banner
  const status = submission?.status || (property?.status === "active" ? "active" : null);
  const wasLive = ["approved", "licensed", "active"].includes(status);

  // --- Early returns ---
  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-7 h-7 border-4 border-slate-100 border-t-[#C9A96E] rounded-full animate-spin" />
        </div>
      </PortalLayout>
    );
  }

  if (!property) {
    return (
      <PortalLayout>
        <div className="text-center py-20 text-slate-400">
          <HomeIcon className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p>Property not found.</p>
          <Link to="/portal/properties" className="inline-flex items-center gap-1 text-sm text-[#C9A96E] hover:underline mt-4">
            <ChevronLeft className="w-4 h-4" /> Back to Properties
          </Link>
        </div>
      </PortalLayout>
    );
  }

  // --- Display values (handles both Supabase and Base44 field naming) ---
  const propertyName = val("property_name");
  const headline = val("headline");
  const description = val("description", "text");
  const shortSummary = val("short_summary", "excerpt");
  const propertyType = val("property_type", "house_type");
  const locationFull = val("location_full", "address");
  const market = val("market", "location_city");
  const bedrooms = val("bedrooms");
  const bathrooms = val("bathrooms");
  const halfBathrooms = val("half_bathrooms");
  const sleeps = val("sleeps");
  const amenities = val("amenities");
  const uniqueFeatures = val("unique_features", "unique_feature");
  const why100 = val("why_100_collection", "why_onehundred");
  const bestFitGuest = val("best_fit_guest");
  const designStyle = val("design_style_notes");
  const tags = val("tags");
  const vrmUrl = val("vrm_url");
  const listingLinkUrl = val("listing_url");

  return (
    <PortalLayout>
      <div className="max-w-4xl mx-auto pb-16">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <Link to="/portal/properties" className="text-slate-400 hover:text-[#0D1B2A] mt-1">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-light text-[#0D1B2A]">{propertyName || "Untitled Property"}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {status && <PortalStatusBadge status={status} />}
              {locationFull && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {locationFull}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setOffboardingModalOpen(true)}
              className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" /> Manage Status
            </button>
            <button
              onClick={() => setEditModalOpen(true)}
              className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1a2e45] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Request Edit
            </button>
          </div>
        </div>

        {/* Revision notes from admin */}
        {submission?.status === "needs_revision" && notes.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-5">
            <h3 className="text-sm font-semibold text-orange-800 mb-2">Revision Requested</h3>
            {notes.map(n => (
              <div key={n.id} className="text-sm text-orange-700 leading-relaxed">{n.content}</div>
            ))}
          </div>
        )}

        {/* Live property notice */}
        {wasLive && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              This is a <strong>{status}</strong> property. Changes you submit will be reviewed by our team before going live.
            </p>
          </div>
        )}

        {/* Partner-facing message */}
        {["rejected", "needs_revision"].includes(submission?.status) && submission?.partner_facing_message && (
          <div className="mb-5 bg-amber-50/50 border-l-2 border-[#C9A96E] rounded-r-2xl px-5 py-4">
            <p className="text-xs font-semibold text-[#C9A96E] uppercase tracking-wide mb-1">
              {submission.status === "rejected" ? "Message from our team" : "Feedback from our team"}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{submission.partner_facing_message}</p>
          </div>
        )}

        {/* Photo Gallery */}
        {galleryUrls.length > 0 ? (
          <div className="mb-6">
            <div
              className="relative rounded-2xl overflow-hidden aspect-[16/10] bg-slate-100 cursor-pointer mb-3"
              onClick={() => setLightboxIdx(0)}
            >
              <img src={getImageUrl(galleryUrls[0], "hero")} alt={getGalleryAlt(altTextMap, galleryUrls[0], 0, propertyName)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </div>
            {galleryUrls.length > 1 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {galleryUrls.slice(1).map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 cursor-pointer group"
                    onClick={() => setLightboxIdx(i + 1)}
                  >
                    <img src={getImageUrl(url, "medium")} alt={getGalleryAlt(altTextMap, url, i + 1, propertyName)} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-16">
            <ImageIcon className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-sm text-slate-400 italic">No photos available yet</p>
          </div>
        )}

        {/* Headline */}
        {headline && (
          <p className="text-lg text-[#0D1B2A] mb-4">{headline}</p>
        )}

        {/* Property Details — directly editable */}
        <PropertyDetailsEditor
          property={property}
          basePropertyId={baseProperty?.id}
          supabaseRowId={supabaseProperty?.id}
          supabaseUrl={property?.listing_url || property?.vrm_url}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["property", id] });
            queryClient.invalidateQueries({ queryKey: ["supabase-property"] });
          }}
        />

        {/* Property Content — directly editable (About, Why 100, Unique Features) */}
        <PropertyContentEditor
          property={property}
          basePropertyId={baseProperty?.id}
          supabaseRowId={supabaseProperty?.id}
          supabaseUrl={property?.listing_url || property?.vrm_url}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["property", id] });
            queryClient.invalidateQueries({ queryKey: ["supabase-property"] });
          }}
        />

        {/* Best Fit Guest + Design & Style */}
        {(bestFitGuest || designStyle) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            {bestFitGuest && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-[#C9A96E] uppercase tracking-wide mb-2">Best Fit Guest</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{bestFitGuest}</p>
              </div>
            )}
            {designStyle && (
              <div>
                <h3 className="text-xs font-semibold text-[#C9A96E] uppercase tracking-wide mb-2">Design & Style</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{designStyle}</p>
              </div>
            )}
          </div>
        )}

        {/* Amenities — directly editable */}
        <PropertyAmenitiesEditor
          property={property}
          basePropertyId={baseProperty?.id}
          supabaseRowId={supabaseProperty?.id}
          supabaseUrl={property?.listing_url || property?.vrm_url}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["property", id] });
            queryClient.invalidateQueries({ queryKey: ["supabase-property"] });
          }}
        />

        {/* Tags */}
        {Array.isArray(tags) && tags.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-[#0D1B2A] border-b border-slate-50 pb-3 mb-4">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t, i) => (
                <span key={i} className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded flex items-center gap-0.5">
                  <Tag className="w-2.5 h-2.5" /> {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Links */}
        {(vrmUrl || listingLinkUrl || hundredUrl) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-[#0D1B2A] border-b border-slate-50 pb-3 mb-4">Links</h3>
            <div className="flex flex-col gap-2">
              {vrmUrl && (
                <a href={vrmUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C9A96E] hover:underline flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> View VRM Listing
                </a>
              )}
              {listingLinkUrl && listingLinkUrl !== vrmUrl && (
                <a href={listingLinkUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C9A96E] hover:underline flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> View Listing
                </a>
              )}
              {hundredUrl && (
                <a href={hundredUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C9A96E] hover:underline flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> View on 100 Collection
                </a>
              )}
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightboxIdx !== null && galleryUrls[lightboxIdx] && (
          <div
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
            onClick={() => setLightboxIdx(null)}
          >
            <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightboxIdx(null)}>
              <X className="w-6 h-6" />
            </button>
            <img
              src={getImageUrl(galleryUrls[lightboxIdx], "large")}
              alt={getGalleryAlt(altTextMap, galleryUrls[lightboxIdx], lightboxIdx, propertyName)}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
            {galleryUrls.length > 1 && (
              <>
                {lightboxIdx > 0 && (
                  <button
                    className="absolute left-4 text-white/70 hover:text-white text-2xl px-2"
                    onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                  >
                    ‹
                  </button>
                )}
                {lightboxIdx < galleryUrls.length - 1 && (
                  <button
                    className="absolute right-4 text-white/70 hover:text-white text-2xl px-2"
                    onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                  >
                    ›
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Edit Modal */}
        {editModalOpen && (
          <PropertyEditModal
            property={property}
            basePropertyId={baseProperty?.id}
            user={user}
            onClose={() => setEditModalOpen(false)}
            onSubmitted={() => setEditModalOpen(false)}
            onSwitchToOffboarding={switchToOffboarding}
          />
        )}

        {offboardingModalOpen && (
          <OffboardingModal
            property={property}
            basePropertyId={baseProperty?.id}
            user={user}
            onClose={() => setOffboardingModalOpen(false)}
            onCompleted={() => setOffboardingModalOpen(false)}
            onSwitchToEdit={switchToEdit}
          />
        )}
      </div>
    </PortalLayout>
  );
}