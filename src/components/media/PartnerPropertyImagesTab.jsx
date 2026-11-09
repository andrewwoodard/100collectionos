import React, { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, Image as ImageIcon, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmptyState from "@/components/shared/EmptyState";
import { normalizeStorageUrl } from "@/lib/supabase";

function publicPropertyHref(item) {
  const path = String(item.propertyUrl || "").trim();
  if (path.startsWith("/destinations/")) {
    return `https://the100collection.com${path}`;
  }
  const vrm = String(item.vrmUrl || "").trim();
  if (/^https?:\/\//i.test(vrm)) return vrm;
  return null;
}

const PAGE_SIZE = 60;

function PropertyImageCard({ item }) {
  const [errored, setErrored] = useState(false);
  const src = normalizeStorageUrl(item.url) || item.url;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative block"
        title={item.alt || item.propertyName}
      >
        {!errored ? (
          <img
            src={src}
            alt={item.alt || `${item.propertyName} — photo ${item.index}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">Unavailable</span>
          </div>
        )}
        <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm">
          <ExternalLink className="w-3.5 h-3.5 text-gray-600" />
        </span>
      </a>
      <div className="p-3 space-y-1.5">
        <p
          className={`text-xs leading-snug line-clamp-3 ${
            item.hasAlt ? "text-gray-800" : "text-gray-400 italic"
          }`}
          title={item.alt || "No alt text"}
        >
          {item.hasAlt ? item.alt : "No alt text"}
        </p>
        <div className="pt-1 border-t border-gray-50 space-y-0.5">
          {publicPropertyHref(item) ? (
            <a
              href={publicPropertyHref(item)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-gray-900 hover:text-[#C9A96E] truncate block"
            >
              {item.propertyName}
            </a>
          ) : (
            <p className="text-xs font-medium text-gray-900 truncate">{item.propertyName}</p>
          )}
          <p className="text-xs text-gray-400 truncate">
            {[item.partnerName, item.market].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

async function fetchPage({ search, altFilter, partnerFilter, offset }) {
  const res = await base44.functions.invoke("listPropertyPageImages", {
    search: search || "",
    alt_filter: altFilter || "all",
    partner: partnerFilter === "all" ? "" : partnerFilter || "",
    limit: PAGE_SIZE,
    offset,
  });
  const body = res?.data || res || {};
  return {
    items: Array.isArray(body.items) ? body.items : [],
    total: Number(body.total) || 0,
    catalogTotal: Number(body.catalog_total) || 0,
    catalogWithAlt: Number(body.catalog_with_alt) || 0,
    partners: Array.isArray(body.partners) ? body.partners : [],
  };
}

/**
 * Catalog of every photo on property pages (propertiesbase44.images ≈ 50k+),
 * with alt text from image_metadata when available. Search/filter run server-side.
 */
export default function PartnerPropertyImagesTab() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [altFilter, setAltFilter] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState([]);

  // Debounce search typing
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
      setAccumulated([]);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setOffset(0);
    setAccumulated([]);
  }, [altFilter, partnerFilter]);

  const query = useQuery({
    queryKey: ["property-page-images", search, altFilter, partnerFilter, offset],
    queryFn: () => fetchPage({ search, altFilter, partnerFilter, offset }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.data?.items) return;
    setAccumulated((prev) => {
      if (offset === 0) return query.data.items;
      const seen = new Set(prev.map((i) => i.id));
      const next = [...prev];
      for (const item of query.data.items) {
        if (!seen.has(item.id)) next.push(item);
      }
      return next;
    });
  }, [query.data, offset]);

  const total = query.data?.total ?? 0;
  const [catalogMeta, setCatalogMeta] = useState({ total: 0, withAlt: 0, partners: [] });
  useEffect(() => {
    if (!query.data || offset !== 0) return;
    setCatalogMeta({
      total: query.data.catalogTotal || 0,
      withAlt: query.data.catalogWithAlt || 0,
      partners: query.data.partners || [],
    });
  }, [query.data, offset]);

  const catalogTotal = catalogMeta.total;
  const catalogWithAlt = catalogMeta.withAlt;
  const partners = catalogMeta.partners;
  const items = accumulated;
  const hasMore = items.length < total;
  const isInitialLoading = query.isLoading && offset === 0;

  const partnerOptions = useMemo(
    () => [...partners].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [partners],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Partner property images</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {isInitialLoading
              ? "Loading catalog…"
              : (
                <>
                  {(catalogTotal > 0 ? total : items.length).toLocaleString()} of{" "}
                  {(catalogTotal || total || items.length).toLocaleString()} photos
                  {(catalogTotal > 0 || catalogWithAlt > 0) && (
                    <> · {catalogWithAlt.toLocaleString()} with alt text</>
                  )}
                </>
              )}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by alt text, property, or partner…"
            className="pl-9 bg-white"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={altFilter} onValueChange={setAltFilter}>
          <SelectTrigger className="w-full lg:w-44 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All photos</SelectItem>
            <SelectItem value="with_alt">Has alt text</SelectItem>
            <SelectItem value="missing_alt">Missing alt text</SelectItem>
          </SelectContent>
        </Select>
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-full lg:w-56 bg-white">
            <SelectValue placeholder="Partner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All partners</SelectItem>
            {partnerOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isError && !isInitialLoading && items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="Couldn’t load property images"
          description="Try refreshing. Photos without alt text are included in the catalog."
        />
      ) : isInitialLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading property page images…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={catalogTotal === 0 ? "No property images yet" : "No matches"}
          description={
            catalogTotal === 0
              ? "Property gallery photos will appear here once listings have images"
              : "Try a different search or clear filters — images without alt text are included when Alt status is All"
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => (
              <PropertyImageCard key={item.id} item={item} />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2 pb-6">
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                className="min-w-[140px]"
              >
                {query.isFetching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Loading…
                  </>
                ) : (
                  `Load more (${(total - items.length).toLocaleString()} left)`
                )}
              </Button>
            ) : (
              <p className="text-xs text-gray-400">All matching images loaded</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
