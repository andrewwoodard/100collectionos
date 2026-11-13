import React, { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/shared/EmptyState";
import {
  Activity, ArrowRight, Loader2, Search, UserRound, X,
} from "lucide-react";

function fmtWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function typeLabel(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchActivity({ search, type, seoChangesOnly, offset, limit }) {
  try {
    const res = await base44.functions.invoke("listSanitySeoActivity", {
      search: search || "",
      type: type || "",
      seo_changes_only: seoChangesOnly,
      limit,
      offset,
    });
    const body = res?.data || res || {};
    if (body.error) throw new Error(body.error);
    return {
      items: Array.isArray(body.items) ? body.items : [],
      total: Number(body.total) || 0,
      types: Array.isArray(body.types) ? body.types : [],
    };
  } catch (err) {
    const data = err?.response?.data || err?.data || {};
    const nested = data?.error;
    const msg =
      (typeof nested === "string" ? nested : nested?.message) ||
      data.message ||
      data.detail ||
      (typeof data === "string" ? data : null) ||
      err?.message ||
      "Failed to load SEO activity";
    throw new Error(msg);
  }
}

function AuthorChip({ author }) {
  if (!author?.name && !author?.email) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <UserRound className="w-3.5 h-3.5" /> Unknown
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {author.imageUrl ? (
        <img src={author.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
      ) : (
        <span className="w-7 h-7 rounded-full bg-[#0D1B2A] text-white text-[10px] font-semibold flex items-center justify-center">
          {(author.name || "?")[0]}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#0D1B2A] truncate">{author.name}</span>
        {author.email && <span className="block text-[11px] text-slate-400 truncate">{author.email}</span>}
      </span>
    </span>
  );
}

function SeoDiff({ before, after, label }) {
  if (!after && !before) return null;
  const changed = before !== after;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {changed && before ? (
        <div className="flex items-start gap-2 text-xs">
          <span className="text-slate-400 line-through break-words flex-1">{before}</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
          <span className="text-[#0D1B2A] font-medium break-words flex-1">{after || "—"}</span>
        </div>
      ) : (
        <p className="text-sm text-[#0D1B2A] break-words">{after || "—"}</p>
      )}
    </div>
  );
}

export default function AdminSeoActivity({ embedded = false }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [seoChangesOnly, setSeoChangesOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const pageSize = 40;

  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [accumulated, setAccumulated] = useState([]);

  React.useEffect(() => {
    setAccumulated([]);
    setOffset(0);
  }, [search, type, seoChangesOnly]);

  const query = useQuery({
    queryKey: ["sanity-seo-activity", search, type, seoChangesOnly, offset],
    queryFn: () =>
      fetchActivity({
        search,
        type: type === "all" ? "" : type,
        seoChangesOnly,
        offset,
        limit: pageSize,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  React.useEffect(() => {
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

  const items = accumulated;
  const total = query.data?.total ?? 0;
  const types = useMemo(() => query.data?.types || [], [query.data?.types]);
  const hasMore = items.length < total;

  return (
    <div className={embedded ? "space-y-5" : "p-6 space-y-5"}>
      {!embedded && (
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">SEO Activity</h1>
          <p className="text-slate-400 text-sm mt-1">
            Dates, times, and people who updated Sanity SEO fields across posts and pages.
          </p>
        </div>
      )}

      {embedded && (
        <div>
          <h2 className="text-sm font-semibold text-[#0D1B2A]">SEO Activity</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sanity history for documents with SEO title/description — who changed them and when.
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, slug, or SEO copy…"
            className="pl-9 bg-white"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setOffset(0);
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{typeLabel(t)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSeoChangesOnly((v) => !v);
              setOffset(0);
            }}
            className={`text-xs px-3 py-2 rounded-lg border ${
              seoChangesOnly
                ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            SEO field changes only
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Sanity SEO activity…
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Activity}
          title="Couldn’t load SEO activity"
          description={query.error?.message || "Check SANITY_API_READ_TOKEN and try again."}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No SEO activity found"
          description={seoChangesOnly
            ? "No confirmed SEO title/description diffs in this set."
            : "No Sanity documents with SEO fields matched your filters."}
        />
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Showing {items.length.toLocaleString()} of {total.toLocaleString()} SEO documents
          </p>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
            {items.map((item) => (
              <div key={item.id} className="p-5 hover:bg-slate-50/40 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4 justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {typeLabel(item.documentType)}
                      </span>
                      {item.seoFieldsChanged === true && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          SEO fields changed
                        </span>
                      )}
                      {item.seoFieldsChanged === false && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Other fields updated
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#0D1B2A]">{item.title}</h3>
                      {item.slug && <p className="text-xs text-slate-400 mt-0.5">/{item.slug}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <SeoDiff
                        label="SEO title"
                        before={item.previousSeoTitle}
                        after={item.seoTitle}
                      />
                      <SeoDiff
                        label="SEO description"
                        before={item.previousSeoDescription}
                        after={item.seoDescription}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 space-y-3 lg:text-right lg:min-w-[220px]">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                        Changed
                      </div>
                      <div className="text-sm text-[#0D1B2A] font-medium">{fmtWhen(item.changedAt)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                        By
                      </div>
                      <div className="lg:flex lg:justify-end">
                        <AuthorChip author={item.author} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            {hasMore ? (
              <button
                type="button"
                disabled={query.isFetching}
                onClick={() => setOffset((o) => o + pageSize)}
                className="text-xs font-medium px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                {query.isFetching ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                  </span>
                ) : (
                  `Load more (${(total - items.length).toLocaleString()} left)`
                )}
              </button>
            ) : (
              <p className="text-xs text-slate-400">All matching activity loaded</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
