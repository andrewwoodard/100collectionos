import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import PortalLayout from "../../../components/portal/PortalLayout";
import StatusPill from "@/components/shared/StatusPill";
import { useToast } from "@/components/ui/use-toast";
import { Search, SlidersHorizontal, Home, RefreshCw, AlertTriangle } from "lucide-react";

const STATUS_FILTERS = ["all", "submitted", "under_review", "needs_revision", "approved", "rejected"];
const POST_REVIEW_STATUSES = ["approved", "licensed", "billed", "active"];
const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "edit", label: "Edits" },
  { key: "termination_request", label: "Terminations" },
];

const TYPE_BADGES = {
  new: { label: "NEW", cls: "bg-[#0D1B2A] text-white" },
  edit: { label: "EDIT", cls: "bg-[#C9A96E] text-white" },
  termination_request: { label: "TERMINATION REQUEST", cls: "bg-[#DC2626] text-white" },
};
const badgeFor = (t) => TYPE_BADGES[t || "new"] || TYPE_BADGES.new;

export default function AdminQueue({ embedded = false }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("-created_date");
  const [reconciling, setReconciling] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["admin-submissions"],
    queryFn: () => base44.entities.PropertySubmission.list(sortBy, 100),
  });

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await base44.functions.invoke("reconcilePropertySubmissions", {});
      const d = res.data;
      toast({
        title: "Reconciliation complete",
        description: `Reconciled ${d.orphaned_found} submission(s). ${d.created} new Property record(s) created, ${d.relinked_to_existing} linked to existing.`,
      });
      qc.invalidateQueries(["admin-submissions"]);
    } catch (e) {
      toast({ title: "Reconciliation failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  const filtered = submissions.filter(s => {
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const matchType = typeFilter === "all" || (s.submission_type || "new") === typeFilter;
    const matchSearch = !search ||
      s.property_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.partner_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.location_full?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchType && matchSearch;
  });

  // Termination requests always sort to the top of the queue (highest urgency)
  const sortedFiltered = [...filtered].sort((a, b) => {
    const aT = a.submission_type === "termination_request" ? 0 : 1;
    const bT = b.submission_type === "termination_request" ? 0 : 1;
    return aT - bT;
  });

  const inner = (
    <div>
      {!embedded && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Submission Queue</h1>
          <p className="text-slate-400 text-sm mt-1">{submissions.length} total submissions</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search submissions…"
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white w-52" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all capitalize ${statusFilter === s ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {TYPE_FILTERS.map(t => (
            <button key={t.key} onClick={() => setTypeFilter(t.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${typeFilter === t.key ? "bg-[#C9A96E] text-white border-[#C9A96E]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleReconcile} disabled={reconciling}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-all disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? "animate-spin" : ""}`} />
            {reconciling ? "Reconciling…" : "Reconcile"}
          </button>
          <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none text-slate-600">
            <option value="-created_date">Newest First</option>
            <option value="created_date">Oldest First</option>
            <option value="-ai_fit_score">Highest Fit Score</option>
            <option value="-completeness_score">Most Complete</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-100">
              {["Property", "Partner", "Location", "Score", "Status", "Submitted", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-full" /></td></tr>
              ))
            ) : sortedFiltered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">No submissions found</td></tr>
            ) : sortedFiltered.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-4 max-w-[200px]">
                  <div className="flex items-center gap-3">
                    {s.photo_urls?.[0] ? (
                      <img src={s.photo_urls[0]} className="w-10 h-8 rounded-lg object-cover flex-shrink-0" alt="" />
                    ) : (
                      <div className="w-10 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Home className="w-3.5 h-3.5 text-slate-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium text-sm text-[#0D1B2A] truncate block">{s.property_name}</span>
                      {(() => { const b = badgeFor(s.submission_type); return (
                        <span className={`inline-block text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded mt-0.5 ${b.cls}`}>{b.label}</span>
                      ); })()}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600 max-w-[140px] truncate">{s.partner_name}</td>
                <td className="px-5 py-4 text-xs text-slate-400 max-w-[140px] truncate">{s.location_full || s.location_city || "—"}</td>
                <td className="px-5 py-4">
                  {s.ai_fit_score ? (
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.ai_fit_score >= 80 ? "bg-emerald-500" : s.ai_fit_score >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${s.ai_fit_score}%` }} />
                      </div>
                      <span className="text-xs font-medium text-slate-600">{s.ai_fit_score}%</span>
                    </div>
                  ) : <span className="text-xs text-slate-300">—</span>}
                </td>
                <td className="px-5 py-4">
                  <StatusPill value={s.status} />
                  {POST_REVIEW_STATUSES.includes(s.status) && !s.source_property_id && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-2.5 h-2.5" /> Awaiting Property record
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 text-xs text-slate-400">
                  {s.submitted_date ? new Date(s.submitted_date).toLocaleDateString() : new Date(s.created_date).toLocaleDateString()}
                </td>
                <td className="px-5 py-4">
                  <Link to={`/admin/review/${s.id}`} className="text-xs font-medium text-[#C9A96E] hover:underline">Review →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
  return embedded ? inner : <PortalLayout>{inner}</PortalLayout>;
}