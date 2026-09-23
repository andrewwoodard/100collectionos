import React, { useMemo, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { useExistingMarkets } from "@/components/shared/MarketSelect";
import { MapPin, ExternalLink, Loader2, RefreshCw, X, Link2 } from "lucide-react";

const PUBLIC_SITE = "https://theonehundredcollection.com";

const slugify = (name) =>
  (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const norm = (s) => (s || "").toLowerCase().trim();

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
                    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-800">{d.name}</span>
                        </div>
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
                            <Link2 className="w-3 h-3" /> No partner linked — assign
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
                          <div className="flex flex-col gap-3">
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