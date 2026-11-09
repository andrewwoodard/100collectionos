import React, { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/shared/EmptyState";

const PAGE_SIZE = 40;

async function fetchPage({ search, offset }) {
  const res = await base44.functions.invoke("listSanityContent", {
    kind: "posts",
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

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SanityBlogPostsTab() {
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
    queryKey: ["sanity-posts", search, offset],
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
        <h2 className="text-sm font-semibold text-gray-900">Blog posts</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {isInitialLoading
            ? "Loading posts…"
            : `${items.length.toLocaleString()} of ${total.toLocaleString()} Sanity travel posts`}
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search title, slug, or excerpt…"
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
          icon={FileText}
          title="Couldn’t load blog posts"
          description={query.error?.message || "Check SANITY_API_READ_TOKEN and try again."}
        />
      ) : isInitialLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading blog posts…
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title="No blog posts" description="No posts matched your search." />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {items.map((post) => (
              <div key={post.id} className="flex gap-4 p-4 hover:bg-gray-50/60 transition-colors">
                <div className="w-20 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                  {post.mainImageUrl ? (
                    <img
                      src={post.mainImageUrl}
                      alt={post.mainImageAlt || post.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{post.title}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[post.author, formatDate(post.publishedAt), post.slug].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {post.pinned && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Pinned
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          post.approved
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-500 border-slate-200"
                        }`}
                      >
                        {post.approved ? "Approved" : "Draft"}
                      </span>
                      {post.publicUrl && (
                        <a
                          href={post.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-400 hover:text-[#C9A96E]"
                          title="View on site"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  {(post.excerpt || post.seoDescription) && (
                    <p className="text-xs text-gray-500 line-clamp-2">{post.excerpt || post.seoDescription}</p>
                  )}
                  {post.categories?.length > 0 && (
                    <p className="text-[11px] text-gray-400">{post.categories.join(" · ")}</p>
                  )}
                </div>
              </div>
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
              <p className="text-xs text-gray-400">All matching posts loaded</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
