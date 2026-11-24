import React, { useMemo, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { cms } from "@/lib/cms";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useExistingMarkets } from "@/components/shared/MarketSelect";
import {
  MapPin, ExternalLink, Loader2, RefreshCw, X, Link2, LocateFixed,
  ChevronDown, ChevronRight, Image as ImageIcon, FileText, Search, Save, Video,
} from "lucide-react";

const PUBLIC_SITE = "https://theonehundredcollection.com";

const slugify = (name) =>
  (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const norm = (s) => (s || "").toLowerCase().trim();

function MetaField({ label, value, multiline = false }) {
  if (!value && value !== 0) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <p className="text-sm text-slate-300 italic">Not set</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {multiline ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{value}</p>
      ) : (
        <p className="text-sm text-[#0D1B2A] break-words">{value}</p>
      )}
    </div>
  );
}

function DestinationImage({ url, label, alt }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group"
      title={alt || label}
    >
      <img src={url} alt={alt || label || ""} className="w-full h-28 object-cover group-hover:opacity-90" loading="lazy" />
      <div className="px-2 py-1 text-[10px] font-medium text-slate-500 truncate">{label}</div>
    </a>
  );
}

function EditableField({ label, value, onChange, multiline = false, placeholder = "" }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</Label>
      {multiline ? (
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="text-sm"
        />
      ) : (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="text-sm"
        />
      )}
    </div>
  );
}

function MuxPlaybackPreview({ playbackId }) {
  const id = String(playbackId || "").trim();
  if (!id) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 h-40 flex items-center justify-center text-xs text-slate-400">
        No Mux playback ID set
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="rounded-lg overflow-hidden border border-slate-200 bg-black aspect-video">
        <iframe
          title="Mux destination video"
          src={`https://player.mux.com/${encodeURIComponent(id)}?metadata-video-title=Destination%20video`}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
      <a
        href={`https://dashboard.mux.com/video?playbackId=${encodeURIComponent(id)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-[#C9A96E] hover:underline inline-flex items-center gap-1"
      >
        Open in Mux <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

function DestinationContentPanel({ destination, linkedPartners = [] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);

  const destSlug = destination?.slug || slugify(destination?.name);

  const { data: linkedVrm } = useQuery({
    queryKey: ["cms-vrm-for-destination", destSlug],
    queryFn: async () => {
      const res = await cms.list("vrms", { first_destination_slug: destSlug }, null, 5);
      if (res?.error) throw new Error(res.error);
      const items = res?.items || [];
      return (
        items.find((v) => v.mux_playback_id) ||
        items[0] ||
        null
      );
    },
    enabled: !!destSlug,
  });

  useEffect(() => {
    if (!destination) return;
    const months = Array.isArray(destination.months)
      ? destination.months.join(", ")
      : typeof destination.months === "string"
        ? destination.months
        : "";
    setForm({
      title: destination.title || destination.name || "",
      seo_title: destination.seo_title || "",
      seo_description: destination.seo_description || "",
      short_description: destination.short_description || "",
      area_descriptor: destination.area_descriptor || "",
      area: destination.area || "",
      region: destination.region || "",
      states: destination.states || "",
      season_info: destination.season_info || "",
      months,
      temporary_vrm_url: destination.temporary_vrm_url || "",
      video_url: destination.video_url || "",
      mux_playback_id: destination.mux_playback_id || linkedVrm?.mux_playback_id || "",
      destination_not_on: !!destination.destination_not_on,
      location_lat: destination.location_lat ?? "",
      location_lng: destination.location_lng ?? "",
      main_image_url: destination.main_image_url || "",
      main_image_alt: destination.main_image_alt || "",
      map_image_url: destination.map_image_url || "",
      footer_image_url: destination.footer_image_url || "",
      body_text: destination.body_text || "",
    });
  }, [destination, linkedVrm?.mux_playback_id]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const months = String(payload.months || "")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
      const muxId = String(payload.mux_playback_id || "").trim() || null;
      const res = await cms.update("destinations", destination.id, {
        ...payload,
        months,
        mux_playback_id: muxId,
        main_image_alt: String(payload.main_image_alt || "").trim() || null,
        location_lat: payload.location_lat === "" ? null : Number(payload.location_lat),
        location_lng: payload.location_lng === "" ? null : Number(payload.location_lng),
        source: destination.source ? `${destination.source}` : "portal",
      });
      if (res?.error) throw new Error(res.error);

      // Keep linked VRM destination-card videos in sync (public destinations index).
      if (destSlug) {
        const vrmRes = await cms.list("vrms", { first_destination_slug: destSlug }, null, 20);
        for (const vrm of vrmRes?.items || []) {
          const video_json = muxId
            ? { _type: "mux.video", asset: { playbackId: muxId } }
            : null;
          await cms.update("vrms", vrm.id, {
            mux_playback_id: muxId,
            video_json,
          });
        }
      }
      return res?.item || res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-destinations"] });
      queryClient.invalidateQueries({ queryKey: ["cms-vrm-for-destination", destSlug] });
      toast({ title: "Destination content saved" });
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Save failed", description: e?.message || "Try again." }),
  });

  if (!form) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading content…
      </div>
    );
  }

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const sliderUrls = Array.isArray(destination.slider_images_json)
    ? destination.slider_images_json.map((s) => (typeof s === "string" ? s : s?.url)).filter(Boolean)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Content &amp; meta
          </div>
          <p className="text-sm text-slate-600">
            Neon cms.destinations · updated{" "}
            {destination.updated_at ? new Date(destination.updated_at).toLocaleString() : "—"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          Save content
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Search className="w-3.5 h-3.5" /> SEO meta
          </div>
          <EditableField label="SEO title" value={form.seo_title} onChange={set("seo_title")} />
          <EditableField
            label="SEO description"
            value={form.seo_description}
            onChange={set("seo_description")}
            multiline
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FileText className="w-3.5 h-3.5" /> Page copy
          </div>
          <EditableField label="Title" value={form.title} onChange={set("title")} />
          <EditableField
            label="Short description"
            value={form.short_description}
            onChange={set("short_description")}
            multiline
          />
          <EditableField
            label="Area descriptor"
            value={form.area_descriptor}
            onChange={set("area_descriptor")}
            multiline
          />
          <div className="grid grid-cols-2 gap-2">
            <EditableField label="Area" value={form.area} onChange={set("area")} />
            <EditableField label="Region" value={form.region} onChange={set("region")} />
          </div>
          <EditableField label="States" value={form.states} onChange={set("states")} />
          <EditableField
            label="Season info"
            value={form.season_info}
            onChange={set("season_info")}
            multiline
          />
          <EditableField
            label="Months"
            value={form.months}
            onChange={set("months")}
            placeholder="June, July, August"
          />
          <EditableField
            label="Temporary VRM URL"
            value={form.temporary_vrm_url}
            onChange={set("temporary_vrm_url")}
          />
          <EditableField label="Video URL" value={form.video_url} onChange={set("video_url")} />
          <div className="flex items-center gap-2 pt-1">
            <Switch
              checked={!!form.destination_not_on}
              onCheckedChange={(v) => setForm((f) => ({ ...f, destination_not_on: v }))}
            />
            <span className="text-xs text-slate-600">Hide from destination listings</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Video className="w-3.5 h-3.5" /> Destination Mux video
        </div>
        <p className="text-xs text-slate-500">
          Playback ID used on the public destinations card
          {linkedPartners?.[0]?.partner_name ? ` (synced to ${linkedPartners[0].partner_name})` : ""}.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-2">
            <EditableField
              label="Mux playback ID"
              value={form.mux_playback_id}
              onChange={set("mux_playback_id")}
              placeholder="e.g. zIP9FjW4nIUdmbpkMN2LKe8xPb5J1Inj9ByFtfskuuU"
            />
            {linkedVrm?.mux_playback_id &&
              linkedVrm.mux_playback_id !== String(form.mux_playback_id || "").trim() && (
                <button
                  type="button"
                  className="text-[11px] text-[#C9A96E] hover:underline"
                  onClick={() =>
                    setForm((f) => ({ ...f, mux_playback_id: linkedVrm.mux_playback_id }))
                  }
                >
                  Use linked VRM playback ID ({linkedVrm.partner_name || linkedVrm.slug})
                </button>
              )}
          </div>
          <MuxPlaybackPreview playbackId={form.mux_playback_id} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <ImageIcon className="w-3.5 h-3.5" /> Images
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <EditableField label="Main image URL" value={form.main_image_url} onChange={set("main_image_url")} />
          <EditableField
            label="Main image alt text"
            value={form.main_image_alt}
            onChange={set("main_image_alt")}
            placeholder={`${(form.title || destination?.name || "Destination").trim()} Vacation Rentals`}
          />
          <p className="text-[11px] text-slate-400 md:col-span-2 -mt-1">
            Leave blank to use the image’s existing alt text, or “{(form.title || destination?.name || "Destination").trim()} Vacation Rentals”.
          </p>
          <EditableField label="Map image URL" value={form.map_image_url} onChange={set("map_image_url")} />
          <EditableField label="Footer image URL" value={form.footer_image_url} onChange={set("footer_image_url")} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DestinationImage url={form.main_image_url} label="Main image" alt={form.main_image_alt} />
          <DestinationImage url={form.map_image_url} label="Map image" />
          <DestinationImage url={form.footer_image_url} label="Footer image" />
          {sliderUrls.slice(0, 5).map((url, i) => (
            <DestinationImage key={url} url={url} label={`Slider ${i + 1}`} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Body content</Label>
        <Textarea
          value={form.body_text}
          onChange={(e) => setForm((f) => ({ ...f, body_text: e.target.value }))}
          rows={8}
          placeholder="Destination page body copy"
          className="text-sm"
        />
        <p className="text-xs text-slate-400">Separate paragraphs with a blank line.</p>
      </div>
    </div>
  );
}

function DestinationGeocodeSection({ destination, geocoding, clearing, onGeocode, onClear }) {
  const hasCoords =
    destination?.latitude != null &&
    destination?.longitude != null &&
    destination.latitude !== "" &&
    destination.longitude !== "";
  const [query, setQuery] = useState(
    () => destination?.geocode_query || destination?.name || ""
  );

  useEffect(() => {
    setQuery(destination?.geocode_query || destination?.name || "");
  }, [destination?.id, destination?.geocode_query, destination?.name]);

  return (
    <div className="border border-slate-200 rounded-lg bg-white p-3 mb-1">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <LocateFixed className="w-3.5 h-3.5" />
        Map coordinates
      </div>
      <p className="text-xs text-slate-400 mb-2">
        Geocode an address or place name to store latitude and longitude for this destination.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onGeocode(query);
          }}
          placeholder={`e.g. ${destination?.name || "Hilton Head Island, SC"}`}
          disabled={geocoding || clearing}
          className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#C9A96E] flex-1 min-w-0"
        />
        <button
          type="button"
          onClick={() => onGeocode(query)}
          disabled={geocoding || clearing || !String(query || "").trim()}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-[#0D1B2A] hover:bg-[#1a2d42] disabled:opacity-50 rounded-md px-3 py-2 shrink-0"
        >
          {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
          {geocoding ? "Geocoding…" : "Geocode & save"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {hasCoords ? (
          <>
            <span className="font-mono text-slate-700">
              {Number(destination.latitude).toFixed(6)}, {Number(destination.longitude).toFixed(6)}
            </span>
            <a
              href={`https://www.openstreetmap.org/?mlat=${destination.latitude}&mlon=${destination.longitude}#map=10/${destination.latitude}/${destination.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A68B4B] hover:underline inline-flex items-center gap-1"
            >
              View on map <ExternalLink className="w-3 h-3" />
            </a>
            <button
              type="button"
              onClick={onClear}
              disabled={clearing || geocoding}
              className="text-slate-400 hover:text-red-600 disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear"}
            </button>
          </>
        ) : (
          <span className="text-slate-400 italic">No coordinates stored yet.</span>
        )}
      </div>
    </div>
  );
}

export default function AdminDestinations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const markets = useExistingMarkets();

  const { data: destinations = [], isLoading } = useQuery({
    queryKey: ["cms-destinations"],
    queryFn: async () => {
      const res = await cms.list("destinations", null, null, 500);
      if (res?.error) throw new Error(res.error);
      return res?.items || [];
    },
    staleTime: 30 * 1000,
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["base44-partners"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
    staleTime: 30 * 1000,
  });

  const destByName = useMemo(() => {
    const map = {};
    destinations.forEach((d) => {
      if (d.name) map[norm(d.name)] = d;
    });
    return map;
  }, [destinations]);

  const partnersByDestination = useMemo(() => {
    const map = {};
    destinations.forEach((d) => (map[norm(d.name)] = []));
    partners.forEach((p) => {
      const key = norm(p.market);
      if (key && map[key]) map[key].push(p);
    });
    return map;
  }, [destinations, partners]);

  const missingMarkets = useMemo(
    () => markets.filter((m) => !destByName[norm(m)]),
    [markets, destByName]
  );

  const syncDestinations = async () => {
    if (missingMarkets.length === 0) return;
    setSyncing(true);
    try {
      const res = await cms.bulkCreate(
        "destinations",
        missingMarkets.map((name) => ({ name, slug: slugify(name), is_exclusive: false, source: "portal" }))
      );
      if (res?.error) throw new Error(res.error);
      await queryClient.invalidateQueries({ queryKey: ["cms-destinations"] });
      toast({ title: `Created ${missingMarkets.length} destination${missingMarkets.length !== 1 ? "s" : ""}.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Sync failed", description: e?.message || "Try again." });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!isLoading && destinations.length === 0 && markets.length > 0 && !syncing) {
      syncDestinations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, destinations.length, markets.length]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, value }) => {
      const res = await cms.update("destinations", id, { is_exclusive: value });
      if (res?.error) throw new Error(res.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cms-destinations"] }),
    onError: (e) => toast({ variant: "destructive", title: "Update failed", description: e?.message || "Try again." }),
  });

  const updateSlugMutation = useMutation({
    mutationFn: async ({ id, slug }) => {
      const res = await cms.update("destinations", id, { slug });
      if (res?.error) throw new Error(res.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cms-destinations"] }),
    onError: (e) => toast({ variant: "destructive", title: "Update failed", description: e?.message || "Try again." }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ partnerId, market }) => {
      await base44.entities.Partner.update(partnerId, { market });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
      toast({ title: "Partner linked." });
    },
    onError: (e) => toast({ variant: "destructive", title: "Link failed", description: e?.message || "Try again." }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ partnerId }) => {
      await base44.entities.Partner.update(partnerId, { market: "" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
      toast({ title: "Partner unlinked." });
    },
    onError: (e) => toast({ variant: "destructive", title: "Unlink failed", description: e?.message || "Try again." }),
  });

  const geocodeMutation = useMutation({
    mutationFn: async ({ id, query, destination }) => {
      const q = String(query || "").trim();
      if (!q) throw new Error("Enter an address or place name to geocode.");
      const res = await base44.functions.invoke("geocodeAddress", {
        address: q,
        scope: "destination",
        country: null,
      });
      const body = res?.data || res;
      if (!body?.geocoded || body.latitude == null || body.longitude == null) {
        throw new Error("No match found for that address or place name.");
      }
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      const patch = {
        geocode_query: q,
        latitude: lat,
        longitude: lng,
        location_lat: lat,
        location_lng: lng,
      };
      const updateRes = await cms.update("destinations", id, patch);
      if (updateRes?.error) throw new Error(updateRes.error);
      return { ...patch, display_name: body.display_name, provider: body.provider };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cms-destinations"] });
      const via = result?.provider ? ` via ${result.provider}` : "";
      toast({
        title: "Coordinates saved",
        description: `${Number(result.latitude).toFixed(5)}, ${Number(result.longitude).toFixed(5)}${via}`,
      });
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Geocode failed", description: e?.message || "Try again." }),
  });

  const clearCoordsMutation = useMutation({
    mutationFn: async ({ id }) => {
      const res = await cms.update("destinations", id, {
        geocode_query: null,
        latitude: null,
        longitude: null,
        location_lat: null,
        location_lng: null,
      });
      if (res?.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-destinations"] });
      toast({ title: "Coordinates cleared" });
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Clear failed", description: e?.message || "Try again." }),
  });

  const partnerSummary = (row) => {
    const linked = partnersByDestination[norm(row.name)] || [];
    const live = linked.filter((p) => p.status === "live").length;
    return { total: linked.length, live };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-medium text-[#0D1B2A]">Destinations</h2>
          <p className="text-sm text-slate-500">
            Neon-backed destination directory, content, exclusivity, and partner linkage.
          </p>
        </div>
        <button
          onClick={syncDestinations}
          disabled={syncing || missingMarkets.length === 0}
          className="inline-flex items-center gap-1.5 text-sm text-[#0D1B2A] border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync markets
          {missingMarkets.length > 0 && <span className="text-xs text-amber-600">({missingMarkets.length} new)</span>}
        </button>
      </div>

      <div className="bg-white border border-slate-100 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-left text-slate-500">
                <th className="px-4 py-2.5 font-medium">Destination</th>
                <th className="px-4 py-2.5 font-medium">Slug</th>
                <th className="px-4 py-2.5 font-medium text-center">Exclusive</th>
                <th className="px-4 py-2.5 font-medium">Linked Partners</th>
                <th className="px-4 py-2.5 font-medium text-center">Live</th>
              </tr>
            </thead>
            <tbody>
              {destinations.map((d) => {
                const slug = d.slug || slugify(d.name);
                const url = `${PUBLIC_SITE}/destinations/${slug}`;
                const key = norm(d.name);
                const linked = partnersByDestination[key] || [];
                const liveCount = linked.filter((p) => p.status === "live").length;
                const isExpanded = expanded === d.id;
                const assignable = partners.filter((p) => norm(p.market) !== key);
                const summary = partnerSummary(d);

                return (
                  <React.Fragment key={d.id}>
                    <tr className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 ${isExpanded ? "bg-slate-50/80" : ""}`}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : d.id)}
                          className="flex items-center gap-2 text-left w-full group"
                          title={isExpanded ? "Hide details" : "View content & meta"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-[#A68B4B] shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#A68B4B] shrink-0" />
                          )}
                          <MapPin className={`w-3.5 h-3.5 shrink-0 ${d.latitude != null && d.longitude != null ? "text-emerald-500" : "text-slate-400"}`} />
                          <div>
                            <span className="font-medium text-slate-800 group-hover:text-[#A68B4B]">{d.name}</span>
                            {d.latitude != null && d.longitude != null && (
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                {Number(d.latitude).toFixed(4)}, {Number(d.longitude).toFixed(4)}
                              </div>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            defaultValue={slug}
                            onBlur={(e) => {
                              const next = slugify(e.target.value);
                              if (next && next !== d.slug) updateSlugMutation.mutate({ id: d.id, slug: next });
                            }}
                            className="text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 w-44 focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
                          />
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-[#C9A96E]" title="View public page">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Switch
                          checked={!!d.is_exclusive}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: d.id, value: v })}
                          disabled={toggleMutation.isPending}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {linked.length === 0 ? (
                          <button
                            onClick={() => setExpanded(isExpanded ? null : d.id)}
                            className="text-xs text-slate-400 hover:text-[#C9A96E] inline-flex items-center gap-1"
                          >
                            <Link2 className="w-3 h-3" /> {isExpanded ? "Hide" : "Manage"}
                            <span className="text-slate-300">·</span> no partner linked
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {linked.slice(0, 3).map((p) => (
                              <div
                                key={p.id}
                                className={`text-xs px-2 py-1 rounded-full border inline-flex items-center gap-1 ${
                                  p.status === "live"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-amber-200 bg-amber-50/60 text-amber-700"
                                }`}
                                title={`${p.partner_name} — ${p.status || "unknown"}`}
                              >
                                {p.partner_name}
                                <button
                                  onClick={() => unlinkMutation.mutate({ partnerId: p.id })}
                                  disabled={unlinkMutation.isPending}
                                  className="hover:text-red-600 disabled:opacity-50"
                                  title="Unlink partner from this destination (clears market)"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            {linked.length > 3 && (
                              <span className="text-xs text-slate-400">+{linked.length - 3} more</span>
                            )}
                            <button
                              onClick={() => setExpanded(isExpanded ? null : d.id)}
                              className="text-xs px-2 py-1 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-[#C9A96E] hover:text-[#C9A96E] inline-flex items-center gap-1"
                            >
                              <Link2 className="w-3 h-3" /> {isExpanded ? "Hide" : "Manage"}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-semibold text-emerald-700">{liveCount}</span>
                        <span className="text-xs text-slate-400"> / {summary.total}</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/40">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="flex flex-col gap-5">
                            <DestinationContentPanel destination={d} linkedPartners={linked} />

                            <DestinationGeocodeSection
                              destination={d}
                              geocoding={geocodeMutation.isPending && geocodeMutation.variables?.id === d.id}
                              clearing={clearCoordsMutation.isPending && clearCoordsMutation.variables?.id === d.id}
                              onGeocode={(query) => geocodeMutation.mutate({ id: d.id, query, destination: d })}
                              onClear={() => clearCoordsMutation.mutate({ id: d.id })}
                            />

                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              Linked partner{linked.length !== 1 ? "s" : ""} ({linked.length})
                            </div>
                            {linked.length === 0 ? (
                              <div className="text-sm text-slate-400 italic">No partners linked. Assign one below.</div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {linked.map((p) => (
                                  <div
                                    key={p.id}
                                    className={`text-xs px-2.5 py-1.5 rounded-full border inline-flex items-center gap-2 ${
                                      p.status === "live"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-amber-200 bg-amber-50/60 text-amber-700"
                                    }`}
                                  >
                                    <a href={`/PartnerDetail?id=${p.id}`} className="font-medium hover:underline">
                                      {p.partner_name}
                                    </a>
                                    <span className="text-[9px] uppercase tracking-wide opacity-70">{p.status || "unknown"}</span>
                                    <button
                                      onClick={() => unlinkMutation.mutate({ partnerId: p.id })}
                                      disabled={unlinkMutation.isPending}
                                      className="hover:text-red-600 disabled:opacity-50"
                                      title="Unlink (clears market)"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="border-t border-slate-100 pt-3">
                              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                Assign partner to {d.name}
                              </div>
                              <select
                                value=""
                                onChange={(e) => {
                                  const pid = e.target.value;
                                  if (pid) assignMutation.mutate({ partnerId: pid, market: d.name });
                                }}
                                disabled={assignMutation.isPending || assignable.length === 0}
                                className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#C9A96E] max-w-md w-full"
                              >
                                <option value="">
                                  {assignable.length === 0
                                    ? "All partners already linked to this destination"
                                    : `Choose a partner (${assignable.length} available)…`}
                                </option>
                                {assignable.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.partner_name} {p.market ? `— ${p.market}` : "(no market)"}
                                  </option>
                                ))}
                              </select>
                              {assignable.length > 0 && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Assigning sets the partner's market to "{d.name}", linking them here and on the public destination page.
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {destinations.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                    No destinations yet. Click "Sync markets" to import from existing partner/property markets.
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading destinations...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}