import React, { useMemo, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { useExistingMarkets } from "@/components/shared/MarketSelect";
import {
  MapPin, ExternalLink, Loader2, RefreshCw, X, Link2, LocateFixed,
  ChevronDown, ChevronRight, Image as ImageIcon, FileText, Search,
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

function DestinationImage({ url, label }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group"
      title={label}
    >
      <img src={url} alt={label || ""} className="w-full h-28 object-cover group-hover:opacity-90" loading="lazy" />
      <div className="px-2 py-1 text-[10px] font-medium text-slate-500 truncate">{label}</div>
    </a>
  );
}

function DestinationContentPanel({ destination }) {
  const slug = destination?.slug || slugify(destination?.name);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["sanity-destination", slug, destination?.name],
    queryFn: async () => {
      const res = await base44.functions.invoke("getSanityDestination", {
        slug,
        name: destination?.name,
      });
      const body = res?.data || res || {};
      if (body.error) throw new Error(body.error);
      return body;
    },
    enabled: !!destination?.id,
    staleTime: 60_000,
  });

  const content = data?.destination;

  const directoryMeta = (
    <div className="rounded-lg border border-slate-200 bg-white p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetaField label="Directory name" value={destination?.name} />
      <MetaField label="Directory slug" value={destination?.slug || slug} />
      <MetaField label="Exclusive" value={destination?.is_exclusive ? "Yes" : "No"} />
      <MetaField
        label="Coordinates"
        value={
          destination?.latitude != null && destination?.longitude != null
            ? `${Number(destination.latitude).toFixed(5)}, ${Number(destination.longitude).toFixed(5)}`
            : ""
        }
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {directoryMeta}
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Sanity content &amp; meta…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        {directoryMeta}
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{error?.message || "Couldn’t load destination content"}</span>
          <button type="button" onClick={() => refetch()} className="text-xs font-medium underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="space-y-4">
        {directoryMeta}
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">
          No Sanity destination document matched “{destination?.name}”
          {slug ? ` (slug: ${slug})` : ""}. Create or rename it in Sanity to edit SEO and page content.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {directoryMeta}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Public content &amp; meta
          </div>
          <p className="text-sm text-slate-600">
            From Sanity · last updated {content.updatedAt ? new Date(content.updatedAt).toLocaleString() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
          {content.studioUrl && (
            <a
              href={content.studioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#A68B4B] hover:underline"
            >
              Edit in Sanity <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Search className="w-3.5 h-3.5" /> SEO meta
          </div>
          <MetaField label="SEO title" value={content.seoTitle} />
          <MetaField label="SEO description" value={content.seoDescription} multiline />
          <MetaField label="Canonical slug" value={content.slug} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FileText className="w-3.5 h-3.5" /> Page copy
          </div>
          <MetaField label="Title" value={content.title} />
          <MetaField label="Short description" value={content.shortDescription} multiline />
          <MetaField label="Area descriptor" value={content.areaDescriptor} multiline />
          <MetaField label="Area / region" value={[content.area, content.region].filter(Boolean).join(" · ")} />
          <MetaField label="Location" value={content.location} />
          <MetaField label="Season info" value={content.seasonInfo} multiline />
          <MetaField
            label="Months"
            value={Array.isArray(content.months) && content.months.length ? content.months.join(", ") : ""}
          />
          <MetaField label="Not on destination" value={content.notOnDestination} multiline />
          <MetaField label="Temporary VRM URL" value={content.temporaryVrmUrl} />
        </div>
      </div>

      {(content.categoryTitles?.length > 0 || content.typeTitles?.length > 0 || content.experienceTitles?.length > 0) && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Taxonomy</div>
          {content.typeTitles?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] uppercase text-slate-400 self-center mr-1">Types</span>
              {content.typeTitles.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>
              ))}
            </div>
          )}
          {content.categoryTitles?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] uppercase text-slate-400 self-center mr-1">Categories</span>
              {content.categoryTitles.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>
              ))}
            </div>
          )}
          {content.experienceTitles?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] uppercase text-slate-400 self-center mr-1">Experiences</span>
              {content.experienceTitles.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <ImageIcon className="w-3.5 h-3.5" /> Images
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DestinationImage url={content.mainImageUrl} label="Main image" />
          <DestinationImage url={content.mapImageUrl} label="Map image" />
          <DestinationImage url={content.footerImageUrl} label="Footer image" />
          {(content.sliderImages || []).slice(0, 5).map((url, i) => (
            <DestinationImage key={url} url={url} label={`Slider ${i + 1}`} />
          ))}
        </div>
        {!content.mainImageUrl && !content.mapImageUrl && !(content.sliderImages || []).length && (
          <p className="text-sm text-slate-300 italic">No images on this destination document.</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Body content</div>
        {content.bodyText ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {content.bodyText}
          </p>
        ) : (
          <p className="text-sm text-slate-300 italic">No body copy.</p>
        )}
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
    queryKey: ["destinations"],
    queryFn: () => base44.entities.Destination.list("-created_date", 500),
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
      await base44.entities.Destination.bulkCreate(
        missingMarkets.map((name) => ({ name, slug: slugify(name), is_exclusive: false }))
      );
      await queryClient.invalidateQueries({ queryKey: ["destinations"] });
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
      await base44.entities.Destination.update(id, { is_exclusive: value });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["destinations"] }),
    onError: (e) => toast({ variant: "destructive", title: "Update failed", description: e?.message || "Try again." }),
  });

  const updateSlugMutation = useMutation({
    mutationFn: async ({ id, slug }) => {
      await base44.entities.Destination.update(id, { slug });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["destinations"] }),
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
      const patch = {
        geocode_query: q,
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
      };
      await base44.entities.Destination.update(id, patch);
      try {
        await base44.functions.invoke("syncDestinationToSupabase", {
          action: "sync",
          destinationId: id,
          data: {
            id,
            name: destination?.name,
            slug: destination?.slug,
            is_exclusive: destination?.is_exclusive,
            ...patch,
          },
        });
      } catch (syncErr) {
        console.warn("[AdminDestinations] syncDestinationToSupabase failed:", syncErr?.message || syncErr);
      }
      return { ...patch, display_name: body.display_name, provider: body.provider };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
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
      const patch = { geocode_query: null, latitude: null, longitude: null };
      await base44.entities.Destination.update(id, patch);
      try {
        await base44.functions.invoke("syncDestinationToSupabase", {
          action: "sync",
          destinationId: id,
          data: { id, ...patch },
        });
      } catch (_) { /* non-fatal */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
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
            Markets with a public destination page, exclusivity flag, and partner linkage.
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
                            <DestinationContentPanel destination={d} />

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