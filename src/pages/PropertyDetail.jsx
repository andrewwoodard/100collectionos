import React, { useState, useCallback, useEffect, useRef } from "react";
import { sb, imageUrlFromMetadata, normalizeStorageUrl } from "@/lib/supabase";
import { getImageUrl } from "@/lib/imageUrl";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft, MapPin, Bed, Bath, Users as UsersIcon, ExternalLink, Link as LinkIcon, Check, X, Database, CheckCircle, AlertCircle, EyeOff, Archive, RotateCcw, Sparkles
} from "lucide-react";
import { usePropertyAltTexts, buildAltTextMap, getGalleryAlt } from "@/hooks/usePropertyAltTexts";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../components/shared/StatusBadge";
import { useExistingMarkets } from "../components/shared/MarketSelect";
import RelatedEntitiesTab from "../components/partners/RelatedEntitiesTab";
import PropertyImagesTab from "../components/properties/PropertyImagesTab";
import { usePropertyImages } from "@/hooks/usePropertyImages";
import ArchiveConfirmModal from "../components/properties/ArchiveConfirmModal";
import AmenitiesEditor from "../components/properties/AmenitiesEditor";
import EditableSleepingArrangements from "../components/properties/EditableSleepingArrangements";
import { format } from "date-fns";
import { useMemo } from "react";

// Inline editable field component
function EditableField({ label, value, onSave, type = "text", options = null, multiline = false, rows = 6, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const start = () => { setDraft(value ?? ""); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = () => { onSave(draft === "" ? null : draft); setEditing(false); };

  if (editing) {
    return (
      <div className={className}>
        {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
        {multiline ? (
          <div className="space-y-1">
            <Textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") cancel(); }}
              rows={rows}
              className="text-sm py-1.5 px-2 resize-y"
            />
            <div className="flex items-center gap-1">
              <button onClick={save} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 px-2 py-0.5"><Check className="w-3.5 h-3.5" /> Save</button>
              <button onClick={cancel} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5"><X className="w-3.5 h-3.5" /> Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {options ? (
              <Select value={draft} onValueChange={(v) => { onSave(v); setEditing(false); }}>
                <SelectTrigger className="h-7 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input
                  autoFocus
                  type={type}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                  className="h-7 text-sm py-0 px-2"
                />
                <button onClick={save} className="p-1 text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={cancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`group cursor-pointer ${className}`} onClick={start}>
      {label && <p className="text-xs text-gray-500 mb-0.5">{label}</p>}
      <p className={`text-sm font-medium mt-0.5 border-b border-transparent group-hover:border-dashed group-hover:border-gray-300 transition-all ${value ? "text-gray-900" : "text-gray-300 italic"} ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {options ? (options.find(o => o.value === value)?.label ?? value ?? "—") : (value || "—")}
      </p>
    </div>
  );
}

function EditableSlug({ label, prefix, value, onSave, className = "" }) {
  const [editing, setEditing] = useState(false);
  const slug = value && prefix && value.startsWith(prefix) ? value.slice(prefix.length) : (value || "");
  const [draft, setDraft] = useState(slug);

  const start = () => { setDraft(slug); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = () => { onSave(prefix + draft); setEditing(false); };

  if (editing) {
    return (
      <div className={className}>
        {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-400 whitespace-nowrap shrink-0">{prefix}</span>
          <Input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            className="h-7 text-sm py-0 px-2"
          />
          <button onClick={save} className="p-1 text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={cancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group cursor-pointer ${className}`} onClick={start}>
      {label && <p className="text-xs text-gray-500 mb-0.5">{label}</p>}
      <p className={`text-sm font-medium mt-0.5 border-b border-transparent group-hover:border-dashed group-hover:border-gray-300 transition-all break-all ${slug ? "text-gray-900" : "text-gray-300 italic"}`}>
        {prefix}<span className="font-semibold">{slug || "—"}</span>
      </p>
    </div>
  );
}

function SyncSingleToSupabaseButton({ propertyId, propertyName }) {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const { toast } = useToast();

  const handleSync = async () => {
    setStatus("syncing");
    setResult(null);
    try {
      const res = await base44.functions.invoke("syncPropertyToSupabase", { action: "sync_property", id: propertyId });
      setResult(res.data);
      setStatus("success");
      toast({ title: "Synced to Supabase", description: `"${propertyName}" ${res.data?.action === "created" ? "created" : "updated"} in Supabase.` });
      setTimeout(() => setStatus("idle"), 5000);
    } catch (err) {
      setResult({ error: err.message });
      setStatus("error");
      toast({ variant: "destructive", title: "Sync failed", description: err.message });
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={status === "syncing"}
        className="flex items-center gap-2 border-[#0F172A] text-[#0F172A] hover:bg-[#0F172A]/10"
      >
        <Database className={`w-4 h-4 ${status === "syncing" ? "animate-spin" : ""}`} />
        {status === "syncing" ? "Syncing…" : "Sync to Supabase"}
      </Button>
      {status === "success" && result && (
        <span className="flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle className="w-3.5 h-3.5" /> Synced
        </span>
      )}
      {status === "error" && result && (
        <span className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="w-3.5 h-3.5" /> {result.error}
        </span>
      )}
    </div>
  );
}

// Fields that exist on both the Supabase propertiesbase44 row and the Base44
// Property entity under the same name. Inline edits saved to Supabase (source
// of truth) are mirrored to the Base44 entity so Base44-backed views — e.g.
// PartnerDetail's Properties tab, which reads base44.entities.Property — stay
// in sync instead of showing a stale market/value after a save.
const MIRROR_FIELDS = new Set([
  "property_name", "market", "address", "property_type", "bedrooms",
  "bathrooms", "sleeps", "status", "onboarding_status", "photography_status",
  "launch_date", "vrm_url", "portal_visible", "excerpt", "text",
  "unique_feature", "internal_notes", "partner_name", "partner_id",
]);

export default function PropertyDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const propertyId = urlParams.get("id");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [archiveModal, setArchiveModal] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [amenitiesDraft, setAmenitiesDraft] = useState([]);
  const marketOptions = useExistingMarkets().map(m => ({ value: m, label: m }));

  // Base44 entity — backbone for id, archive state, and related-entity joins.
  // May fail if the URL id is a Supabase UUID (no matching Base44 entity).
  const { data: baseProperty, isLoading: isLoadingBase } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => base44.entities.Property.get(propertyId),
    enabled: !!propertyId,
    retry: false,
  });

  // propertiesbase44 record — source of truth for property info.
  const sbId = baseProperty?.supabase_property_id;
  const hasSbId = !!sbId && sbId !== "null" && sbId !== "undefined";
  const lookupUrl = baseProperty?.listing_url || baseProperty?.vrm_url;
  const sbQueryKey = hasSbId ? sbId : (lookupUrl ? `url:${lookupUrl}` : `direct:${propertyId}`);
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
      // No Base44 entity — try the URL id directly as a Supabase property ID.
      const res = await base44.functions.invoke("supabaseProperties", { action: "get", id: propertyId });
      return res.data?.property || null;
    },
    enabled: !!propertyId && !isLoadingBase,
  });

  // Source of truth = propertiesbase44, overlaid on the Base44 entity.
  // propertiesbase44 values win when present; null/empty values fall back to the
  // Base44 entity so sparse Supabase rows don't wipe known data (address, type, etc.).
  // When no Base44 entity exists (URL id is a Supabase UUID), use the Supabase
  // property directly as the base.
  const property = baseProperty
    ? (() => {
        const merged = { ...baseProperty };
        if (supabaseProperty) {
          for (const [k, v] of Object.entries(supabaseProperty)) {
            if (v !== null && v !== undefined && v !== "") merged[k] = v;
          }
        }
        merged.listing_url = baseProperty.listing_url;
        merged.vrm_url = supabaseProperty?.vrm_url || baseProperty.vrm_url;
        merged.archived_at = baseProperty.archived_at;
        merged.archived_by_user_id = baseProperty.archived_by_user_id;
        merged.id = baseProperty.id;
        merged.supabase_property_id = baseProperty.supabase_property_id;
        return merged;
      })()
    : supabaseProperty
      ? { ...supabaseProperty, id: supabaseProperty.id || propertyId, archived_at: null, archived_by_user_id: null }
      : null;

  // Save an info field to propertiesbase44 (source of truth).
  const save = useCallback((field) => async (value) => {
    const targetId = hasSbId ? sbId : supabaseProperty?.id;
    // No Supabase row exists (no id and no row resolved by url) — create one
    // seeded from the Base44 property with this edit applied, then link the
    // Base44 entity to the new row's id so subsequent saves update it directly.
    // Previously this fell through to a URL update that 404'd (e.g. when
    // supabase_property_id = "null" and the listing_url has no matching row).
    if (!targetId && !supabaseProperty && !isLoadingSb) {
      const listingUrl = baseProperty?.listing_url || baseProperty?.vrm_url;
      const createData = {
        property_name: baseProperty?.property_name,
        market: baseProperty?.market,
        listing_url: listingUrl,
        address: baseProperty?.address,
        bedrooms: baseProperty?.bedrooms,
        bathrooms: baseProperty?.bathrooms,
        sleeps: baseProperty?.sleeps,
        property_type: baseProperty?.property_type,
        status: baseProperty?.status || "draft",
        partner_name: baseProperty?.partner_name,
        partner_id: baseProperty?.partner_id,
        portal_visible: baseProperty?.portal_visible ?? false,
        onboarding_status: baseProperty?.onboarding_status || "not_started",
        photography_status: baseProperty?.photography_status || "not_started",
        launch_date: baseProperty?.launch_date,
        excerpt: baseProperty?.excerpt,
        internal_notes: baseProperty?.internal_notes,
        unique_feature: baseProperty?.unique_feature,
        [field]: value,
      };
      const res = await base44.functions.invoke("supabaseProperties", {
        action: "create",
        data: createData,
      });
      const newRow = res.data?.property;
      if (newRow?.id) {
        await base44.entities.Property.update(propertyId, {
          supabase_property_id: String(newRow.id),
          ...(MIRROR_FIELDS.has(field) ? { [field]: value } : {}),
        });
        queryClient.setQueryData(["supabase-property", sbQueryKey], newRow);
        queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
        queryClient.invalidateQueries({ queryKey: ["partner-properties"] });
        queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
      } else {
        // Create failed — persist the edit to the Base44 entity so it isn't lost.
        await base44.entities.Property.update(propertyId, { [field]: value });
        queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
        queryClient.invalidateQueries({ queryKey: ["partner-properties"] });
      }
      return;
    }
    const res = await base44.functions.invoke("supabaseProperties", {
      action: "update",
      id: targetId || undefined,
      url: !targetId ? lookupUrl : undefined,
      data: { [field]: value },
    });
    if (res.data?.property) {
      queryClient.setQueryData(["supabase-property", sbQueryKey], res.data.property);
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    }
    // Mirror the edit to the Base44 Property entity so Base44-backed views
    // (PartnerDetail Properties tab, partner property counts) reflect the
    // change instead of showing a stale value after the Supabase save.
    if (baseProperty && MIRROR_FIELDS.has(field)) {
      try {
        await base44.entities.Property.update(propertyId, { [field]: value });
        queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
        queryClient.invalidateQueries({ queryKey: ["partner-properties"] });
      } catch {}
    }
  }, [hasSbId, sbId, sbQueryKey, supabaseProperty, lookupUrl, propertyId, queryClient, baseProperty, isLoadingSb]);

  // Save the address: persist to Base44 + Supabase (via the geocode function),
  // which also geocodes to latitude/longitude and writes those to both stores.
  const [isGeocoding, setIsGeocoding] = useState(false);
  const saveAddress = useCallback(async (value) => {
    setIsGeocoding(true);
    try {
      const res = await base44.functions.invoke("geocodePropertyAddress", {
        property_id: propertyId,
        address: value,
      });
      if (res.data?.geocoded) {
        toast({ title: "Address saved", description: `Geocoded to ${res.data.latitude}, ${res.data.longitude}.` });
      } else {
        toast({ title: "Address saved", description: "No geocode match found for that address." });
      }
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["supabase-property"] });
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
      queryClient.invalidateQueries({ queryKey: ["partner-properties"] });
    } catch (err) {
      toast({ variant: "destructive", title: "Address save failed", description: err?.message });
    } finally {
      setIsGeocoding(false);
    }
  }, [propertyId, queryClient, toast]);

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  useEffect(() => { setAmenitiesDraft(property?.amenities || []); }, [property?.amenities]);

  const { generate: generateAltText, isGenerating: isGeneratingAltText } = usePropertyAltTexts(baseProperty?.id);
  const altTextMap = useMemo(
    () => buildAltTextMap(baseProperty?.photo_urls, baseProperty?.photo_alt_texts),
    [baseProperty?.photo_urls, baseProperty?.photo_alt_texts]
  );

  const handleGenerateAltText = async () => {
    try {
      await generateAltText();
      toast({ title: "Alt text generated", description: "AI-generated alt text saved for property photos." });
    } catch (err) {
      toast({ variant: "destructive", title: "Generation failed", description: err?.message });
    }
  };

  const { data: archivedByUser } = useQuery({
    queryKey: ["user-by-id", property?.archived_by_user_id],
    queryFn: async () => {
      try {
        const users = await base44.entities.User.list();
        return users.find(u => u.id === property.archived_by_user_id) || null;
      } catch { return null; }
    },
    enabled: !!property?.archived_by_user_id,
  });

  const handleArchiveRestore = async (isRestore) => {
    const now = new Date().toISOString();
    const targetId = hasSbId ? sbId : supabaseProperty?.id;
    if (targetId) {
      await base44.functions.invoke("supabaseProperties", {
        action: "update",
        id: targetId,
        data: { status: isRestore ? "active" : "inactive" },
      });
      queryClient.invalidateQueries({ queryKey: ["supabase-property", sbQueryKey] });
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    }
    if (baseProperty) {
      await base44.entities.Property.update(propertyId, isRestore
        ? { status: "active", archived_at: null, archived_by_user_id: null }
        : { status: "inactive", archived_at: now, archived_by_user_id: currentUser?.id }
      );
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    }
    queryClient.invalidateQueries({ queryKey: ["properties"] });
    queryClient.invalidateQueries({ queryKey: ["my-linked-properties"] });
    toast({ title: `${isRestore ? "Restored" : "Archived"} "${property.property_name}"` });
    setArchiveModal(null);
  };

  const handleAdminOffboarding = async (action) => {
    if (!confirm(`Are you sure you want to ${action === "bring_online" ? "bring this property back online" : "cancel the scheduled offboarding"}?`)) return;
    try {
      await base44.functions.invoke("manageOffboarding", { action, propertyId });
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["supabase-property"] });
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
      toast({ title: action === "bring_online" ? "Property brought online" : "Scheduled offboarding cancelled" });
    } catch (err) {
      toast({ variant: "destructive", title: "Action failed", description: err?.message });
    }
  };

  const handleAdminForceTerminate = async () => {
    const reason = window.prompt("Enter a reason for force terminating this property:");
    if (!reason) return;
    try {
      await base44.functions.invoke("manageOffboarding", { action: "force_terminate", propertyId, reason });
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["supabase-property"] });
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
      toast({ title: "Property force terminated" });
    } catch (err) {
      toast({ variant: "destructive", title: "Action failed", description: err?.message });
    }
  };

  const { data: documents = [] } = useQuery({
    queryKey: ["property-docs", propertyId],
    queryFn: async () => { const r = await sb.list("documents", { property_id: propertyId }); return Array.isArray(r?.items) ? r.items : []; },
    enabled: !!propertyId,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["property-tasks", propertyId],
    queryFn: async () => { const r = await sb.list("tasks", { property_id: propertyId }); return Array.isArray(r?.items) ? r.items : []; },
    enabled: !!propertyId,
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["property-notes", propertyId],
    queryFn: async () => { const r = await sb.list("notes", { property_id: propertyId }); return Array.isArray(r?.items) ? r.items : []; },
    enabled: !!propertyId,
  });
  const { data: media = [] } = useQuery({
    queryKey: ["property-media", propertyId],
    queryFn: async () => { const r = await sb.list("media_assets", { property_id: propertyId }); return Array.isArray(r?.items) ? r.items : []; },
    enabled: !!propertyId,
  });
  const { data: onboarding = [] } = useQuery({
    queryKey: ["property-onboarding", propertyId],
    queryFn: async () => { const r = await sb.list("onboarding_items", { property_id: propertyId }); return Array.isArray(r?.items) ? r.items : []; },
    enabled: !!propertyId,
  });

  const { data: metadataImagesData } = usePropertyImages(property?.vrm_url || property?.listing_url);
  const metadataImages = Array.isArray(metadataImagesData) ? metadataImagesData : [];

  // Sync image_metadata images into propertiesbase44.images so the detail page
  // shows all available images, not just the ones previously stored. Merges
  // metadata URLs into the existing images array, deduplicating by normalized URL.
  // The ref guard ensures the sync runs at most once per property load.
  const syncRef = useRef(null);
  useEffect(() => {
    if (!property || !metadataImages || metadataImages.length === 0) return;
    const targetId = hasSbId ? sbId : (supabaseProperty?.id || null);
    if (!targetId) return;
    if (syncRef.current === targetId) return;

    const metadataUrls = metadataImages
      .map(img => imageUrlFromMetadata(img))
      .filter(Boolean);
    if (metadataUrls.length === 0) return;

    const existingUrls = propertyImagesArr.filter(Boolean);
    const norm = (u) => normalizeStorageUrl(u) || u;
    const existingSet = new Set(existingUrls.map(norm));
    const newUrls = metadataUrls.filter(u => !existingSet.has(norm(u)));
    if (newUrls.length === 0) return;

    syncRef.current = targetId;

    const mergedSet = new Set();
    const merged = [];
    for (const u of [...existingUrls, ...newUrls]) {
      const n = norm(u);
      if (!mergedSet.has(n)) { mergedSet.add(n); merged.push(u); }
    }

    base44.functions.invoke("supabaseProperties", {
      action: "update",
      id: targetId,
      data: { images: merged },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["supabase-property", sbQueryKey] });
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    }).catch(() => {});
  }, [property?.id, metadataImages, hasSbId, sbId, supabaseProperty, sbQueryKey, queryClient]);



  if (isLoadingBase || isLoadingSb || !property) {
    if (!isLoadingBase && !isLoadingSb && !property) {
      return (
        <div className="text-center py-20">
          <p className="text-gray-400">Property not found.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(createPageUrl("Properties"))}>
            Back to Properties
          </Button>
        </div>
      );
    }
    return <div className="animate-shimmer h-8 w-48 rounded mb-4" />;
  }

  // property already carries propertiesbase44 values (source of truth).
  const excerptValue = typeof property.excerpt === "string" ? property.excerpt : null;
  const whyOnehundredValue = typeof property.why_onehundred === "string" ? property.why_onehundred : null;
  const textValue = typeof property.text === "string" ? property.text : null;

  const onehundredDestination = (property.market || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const onehundredPrefix = onehundredDestination ? `/destinations/${onehundredDestination}/` : "/destinations/";
  const propertySlug = (property.property_name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const onehundredUrlValue = propertySlug ? `${onehundredPrefix}${propertySlug}` : null;
  const onehundredFullUrl = onehundredUrlValue ? `https://theonehundredcollection.com${onehundredUrlValue}` : null;



  // Match the first image shown in the Images tab: propertiesbase44 `images` array
  // when present, otherwise the image_metadata gallery. property_image is a last
  // resort — its Supabase storage hostname is normalized to the current project,
  // since older records reference a stale project host that no longer serves.
  const firstMetadataImage = imageUrlFromMetadata(metadataImages[0]);
  const propertyImagesArr = Array.isArray(property.images) ? property.images : [];
  const heroImage = normalizeStorageUrl(propertyImagesArr.length > 0 ? propertyImagesArr[0] : null)
    || firstMetadataImage
    || normalizeStorageUrl(property.property_image);

  // Parse internal_notes if it's a JSON blob (scraped property data)
  let parsedNotes = null;
  let plainNotes = property.internal_notes;
  if (property.internal_notes) {
    try {
      const parsed = JSON.parse(property.internal_notes);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        parsedNotes = parsed;
        plainNotes = null;
      }
    } catch (e) {
      // not JSON, treat as plain text
    }
  }

  const scrapedBedrooms = parsedNotes?.sleepingArrangements?.total?.bedrooms;
  const scrapedBathrooms = parsedNotes?.bathrooms?.count;
  const scrapedSleeps = parsedNotes?.overview?.sleeps;
  const scrapedSubtitle = parsedNotes?.subtitle;
  const scrapedStyle = parsedNotes?.overview?.style;
  const scrapedBestFor = Array.isArray(parsedNotes?.overview?.bestFor) ? parsedNotes.overview.bestFor : [];
  const scrapedBedrooms2 = Array.isArray(parsedNotes?.sleepingArrangements?.bedrooms) ? parsedNotes.sleepingArrangements.bedrooms : [];
  const scrapedAmenities = [
    ...(Array.isArray(parsedNotes?.generalAmenities) ? parsedNotes.generalAmenities : []),
    ...(Array.isArray(parsedNotes?.indoorLiving) ? parsedNotes.indoorLiving : []),
    ...(Array.isArray(parsedNotes?.outdoorLiving) ? parsedNotes.outdoorLiving : []),
    ...(Array.isArray(parsedNotes?.kitchenDining) ? parsedNotes.kitchenDining : []),
  ];
  const scrapedLocation = Array.isArray(parsedNotes?.locationHighlights) ? parsedNotes.locationHighlights : [];
  const collectionDesignation = parsedNotes?.collection?.selectedFor;

  const completedOnboarding = onboarding.filter(i => i.completed).length;
  const totalOnboarding = onboarding.length;
  const pct = totalOnboarding > 0 ? Math.round((completedOnboarding / totalOnboarding) * 100) : 0;

  const statusOptions = [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "inactive", label: "Inactive" },
  ];
  const onboardingStatusOptions = [
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "complete", label: "Complete" },
  ];
  const photographyStatusOptions = [
    { value: "not_started", label: "Not Started" },
    { value: "scheduled", label: "Scheduled" },
    { value: "completed", label: "Completed" },
    { value: "approved", label: "Approved" },
  ];
  const propertyTypeOptions = [
    { value: "villa", label: "Villa" },
    { value: "apartment", label: "Apartment" },
    { value: "house", label: "House" },
    { value: "condo", label: "Condo" },
    { value: "estate", label: "Estate" },
    { value: "cabin", label: "Cabin" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Archived info bar */}
      {property.archived_at && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Archive className="w-4 h-4 flex-shrink-0" />
            <span>
              Archived on {format(new Date(property.archived_at), "MMM d, yyyy")}
              {archivedByUser ? ` by ${archivedByUser.full_name || archivedByUser.email}` : ""}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setArchiveModal({ properties: [property], isRestore: true })}
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl("Properties"))}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        {heroImage && (
          <img src={getImageUrl(heroImage, "thumb")} alt={getGalleryAlt(altTextMap, heroImage, 0, property.property_name)} className="w-16 h-16 rounded-lg object-cover border border-gray-100 shrink-0" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <EditableField
              value={property.property_name}
              onSave={save("property_name")}
              className="flex-1"
            />
            {property.portal_visible === false && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
                <EyeOff className="w-3 h-3" /> Hidden from portal
              </span>
            )}
            <EditableField
              value={property.status}
              onSave={save("status")}
              options={statusOptions}
            />
            {property.offboarding_status === "temporary_offline" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium whitespace-nowrap">Offline</span>
            )}
            {property.offboarding_status === "scheduled" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium whitespace-nowrap">
                Offboards {property.termination_date ? new Date(property.termination_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
              </span>
            )}
            {property.offboarding_status === "terminated" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium whitespace-nowrap">Terminated</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {property.partner_name && (
              <button
                onClick={() => navigate(createPageUrl("PartnerDetail") + `?id=${property.partner_id}`)}
                className="text-sm text-[#C9A96E] hover:underline flex items-center gap-1"
              >
                <LinkIcon className="w-3 h-3" /> {property.partner_name}
              </button>
            )}
            {onehundredFullUrl && (
              <a
                href={onehundredFullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#C9A96E] hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> View on 100 Collection
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {property.archived_at ? (
            <Button variant="outline" size="sm" onClick={() => setArchiveModal({ properties: [property], isRestore: true })}
              className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
              <RotateCcw className="w-4 h-4 mr-1.5" /> Restore
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setArchiveModal({ properties: [property], isRestore: false })}
              className="text-red-500 border-red-200 hover:bg-red-50">
              <Archive className="w-4 h-4 mr-1.5" /> Archive
            </Button>
          )}
          <SyncSingleToSupabaseButton propertyId={propertyId} propertyName={property.property_name} />
          {baseProperty?.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAltText}
              disabled={isGeneratingAltText || !Array.isArray(baseProperty?.photo_urls) || baseProperty.photo_urls.length === 0}
              className="flex items-center gap-2 border-[#0F172A] text-[#0F172A] hover:bg-[#0F172A]/10"
            >
              <Sparkles className={`w-4 h-4 ${isGeneratingAltText ? "animate-pulse" : ""}`} />
              {isGeneratingAltText ? "Generating..." : "Generate Alt Text"}
            </Button>
          )}
          {property.offboarding_status === "temporary_offline" && (
            <Button variant="outline" size="sm" onClick={() => handleAdminOffboarding("bring_online")}
              className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Bring Online
            </Button>
          )}
          {property.offboarding_status === "scheduled" && (
            <Button variant="outline" size="sm" onClick={() => handleAdminOffboarding("cancel_scheduled")}
              className="text-orange-600 border-orange-200 hover:bg-orange-50">
              <X className="w-3.5 h-3.5 mr-1.5" /> Cancel Scheduled
            </Button>
          )}
          {!property.offboarding_status && (
            <Button variant="outline" size="sm" onClick={() => handleAdminForceTerminate()}
              className="text-red-500 border-red-200 hover:bg-red-50">
              <Archive className="w-3.5 h-3.5 mr-1.5" /> Force Terminate
            </Button>
          )}
        </div>
      </div>

      {/* Property Info Card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        {collectionDesignation && (
          <div className="mb-4 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-3 py-1 rounded-full">
            ★ {collectionDesignation}
          </div>
        )}
        {scrapedSubtitle && (
          <p className="text-sm text-gray-500 mb-4">{scrapedSubtitle}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6">
          <div className="col-span-2">
            <EditableField label="Address / Location" value={property.address} onSave={saveAddress} />
            {(property.latitude != null || property.longitude != null) && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isGeocoding ? "Geocoding…" : `${property.latitude ?? "—"}, ${property.longitude ?? "—"}`}
              </p>
            )}
          </div>
          <EditableField label="Market" value={property.market} onSave={save("market")} options={marketOptions} />
          <EditableField
            label="Property Type"
            value={property.property_type}
            onSave={save("property_type")}
            options={propertyTypeOptions}
          />
          <EditableField label="Bedrooms" value={property.bedrooms != null ? String(property.bedrooms) : (scrapedBedrooms ? String(scrapedBedrooms) : null)} onSave={(v) => save("bedrooms")(v ? Number(v) : null)} type="number" />
          <EditableField label="Bathrooms" value={property.bathrooms != null ? String(property.bathrooms) : (scrapedBathrooms ? String(scrapedBathrooms) : null)} onSave={(v) => save("bathrooms")(v ? Number(v) : null)} type="number" />
          <EditableField label="Sleeps" value={property.sleeps != null ? String(property.sleeps) : (scrapedSleeps ? String(scrapedSleeps) : null)} onSave={(v) => save("sleeps")(v ? Number(v) : null)} type="number" />
          <EditableField
            label="Photography Status"
            value={property.photography_status}
            onSave={save("photography_status")}
            options={photographyStatusOptions}
          />
          <EditableField
            label="Onboarding Status"
            value={property.onboarding_status}
            onSave={save("onboarding_status")}
            options={onboardingStatusOptions}
          />
          <EditableField label="Launch Date" value={property.launch_date} onSave={save("launch_date")} type="date" />
          <div className="col-span-2">
            <EditableField label="Listing URL" value={property.vrm_url} onSave={save("vrm_url")} />
            {property.vrm_url && (
              <a href={property.vrm_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1 mt-1">
                View listing <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Extra Supabase fields */}
        <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
          <EditableField label="Partner Name" value={property.partner_name} onSave={save("partner_name")} />
          <EditableField label="VRM URL" value={property.vrm_url} onSave={save("vrm_url")} />
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Portal Visible</p>
            <button
              onClick={() => save("portal_visible")(!property.portal_visible)}
              className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${property.portal_visible ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
            >
              {property.portal_visible ? "Yes" : "No"}
            </button>
          </div>
          <div className="col-span-2">
            <EditableField label="Excerpt" value={excerptValue} onSave={save("excerpt")} />
          </div>
          <div className="col-span-3">
            <EditableField label="Unique Feature" value={typeof property.unique_feature === "string" ? property.unique_feature : null} onSave={save("unique_feature")} />
          </div>
          <div className="col-span-3">
            <EditableField label="Why 100 Collection" value={whyOnehundredValue} onSave={save("why_onehundred")} />
          </div>
          <div className="col-span-3">
            <EditableField label="Text" value={textValue} onSave={save("text")} multiline rows={6} />
          </div>
          <div className="col-span-3">
            <EditableSlug
              label="100 Collection URL"
              prefix={onehundredPrefix}
              value={onehundredUrlValue}
              onSave={save("onehundred_url")}
            />
            {onehundredFullUrl && (
              <a href={onehundredFullUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1 mt-1">
                View on 100 Collection <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {!parsedNotes && (
            <div className="col-span-3">
              <EditableField label="Internal Notes" value={typeof plainNotes === "string" ? plainNotes : null} onSave={save("internal_notes")} />
            </div>
          )}
          {/* Amenities */}
          <div className="col-span-3 mt-2 pt-4 border-t border-gray-50">
            <p className="text-xs text-gray-500 mb-2">Amenities</p>
            <AmenitiesEditor value={amenitiesDraft} onChange={(v) => { setAmenitiesDraft(v); save("amenities")(v); }} />
          </div>
        </div>

        {/* Scraped JSON notes (read-only display) */}
        {parsedNotes && (
          <div className="mt-4 pt-4 border-t border-gray-50 space-y-4">
            {scrapedStyle && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-700">{scrapedStyle}</p>
              </div>
            )}
            {scrapedBestFor.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Best For</p>
                <div className="flex flex-wrap gap-1.5">
                  {scrapedBestFor.map((b, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{b}</span>
                  ))}
                </div>
              </div>
            )}
            <EditableSleepingArrangements
              parsedNotes={parsedNotes}
              onSave={save("internal_notes")}
            />
            {scrapedAmenities.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {scrapedAmenities.map((a, i) => (
                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{a}</span>
                  ))}
                </div>
              </div>
            )}
            {scrapedLocation.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Location Highlights</p>
                <div className="flex flex-wrap gap-1.5">
                  {scrapedLocation.map((l, i) => (
                    <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{l}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Onboarding Progress */}
      {totalOnboarding > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Onboarding Progress</h4>
            <span className="text-sm font-bold text-gray-700">{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#C9A96E] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="images" className="space-y-4">
        <TabsList className="bg-white border border-gray-100">
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="media">Media ({media.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="images"><PropertyImagesTab listingUrl={property.vrm_url || property.listing_url} propertyImages={propertyImagesArr} supabasePropertyId={hasSbId ? sbId : supabaseProperty?.id} sbQueryKey={sbQueryKey} /></TabsContent>
        <TabsContent value="onboarding"><RelatedEntitiesTab type="onboarding" items={onboarding} /></TabsContent>
        <TabsContent value="documents"><RelatedEntitiesTab type="documents" items={documents} /></TabsContent>
        <TabsContent value="media"><RelatedEntitiesTab type="media" items={media} /></TabsContent>
        <TabsContent value="tasks"><RelatedEntitiesTab type="tasks" items={tasks} /></TabsContent>
        <TabsContent value="notes"><RelatedEntitiesTab type="notes" items={notes} /></TabsContent>
      </Tabs>

      {archiveModal && (
        <ArchiveConfirmModal
          properties={archiveModal.properties}
          isRestore={archiveModal.isRestore}
          onClose={() => setArchiveModal(null)}
          onConfirm={() => handleArchiveRestore(archiveModal.isRestore)}
        />
      )}
    </div>
  );
}