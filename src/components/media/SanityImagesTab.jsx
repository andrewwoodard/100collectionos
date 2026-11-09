import React, { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, Image as ImageIcon, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/shared/EmptyState";

const PAGE_SIZE = 60;

async function fetchPage({ search, offset }) {
  const res = await base44.functions.invoke("listSanityContent", {
    kind: "images",
    search: search || "",
    limit: PAGE_SIZE,
    offset,
  });
  const body = res?.data || res || {};
  if (body.error) throw new Error(body.error);
  return {
    items: Array.isArray(body.items) ? body.items : [],
    total: Number(body.total) || 0,
  };
}

function ImageCard({ item }) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative block"
        title={item.alt || item.title}
      >
        {!errored ? (
          <img
            src={item.url}
            alt={item.alt || item.title || "Sanity image"}
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
      <div className="p-3 space-y-1">
        <p className="text-xs text-gray-800 line-clamp-2" title={item.alt || item.title}>
          {item.alt || item.title || "No alt text"}
        </p>
        <p className="text-[11px] text-gray-400 truncate">{item.filename || item.id}</p>
      </div>
    </div>
  );
}

export default function SanityImagesTab() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
      setAccumulated([]);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["sanity-images", search, offset],
    queryFn: () => fetchPage({ search, offset }),
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
  const items = accumulated;
  const hasMore = items.length < total;
  const isInitialLoading = query.isLoading && offset === 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Sanity images</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {isInitialLoading
            ? "Loading Sanity assets…"
            : `${items.length.toLocaleString()} of ${total.toLocaleString()} images from the Sanity media library`}
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search filename, title, or alt text…"
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

      {query.isError && !isInitialLoading && items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="Couldn’t load Sanity images"
          description={query.error?.message || "Check SANITY_API_READ_TOKEN and try again."}
        />
      ) : isInitialLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading Sanity images…
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No Sanity images" description="No image assets matched your search." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => (
              <ImageCard key={item.id} item={item} />
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
