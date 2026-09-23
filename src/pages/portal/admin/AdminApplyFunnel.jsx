import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldAlert } from "lucide-react";
import FunnelChart from "@/components/admin/funnel/FunnelChart";
import AttributionBreakdown from "@/components/admin/funnel/AttributionBreakdown";
import AbandonedTable from "@/components/admin/funnel/AbandonedTable";
import {
  filterEvents,
  computeFunnel,
  computeAttribution,
  computeSessions,
  abandonedRows,
} from "@/lib/applyFunnelAdmin";

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
  { id: "all", label: "All time" },
];

const PATHS = [
  { id: "all", label: "All paths" },
  { id: "property_manager", label: "Managers" },
  { id: "homeowner", label: "Homeowners" },
  { id: "existing_partner", label: "Existing partner" },
];

export default function AdminApplyFunnel() {
  const queryClient = useQueryClient();
  const [rangeDays, setRangeDays] = useState(30);
  const [pathFilter, setPathFilter] = useState("all");
  const [tab, setTab] = useState("all_active");
  const [showSpam, setShowSpam] = useState(false);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["apply-funnel-events"],
    queryFn: () => base44.entities.ApplyFunnelEvent.list("-created_date", 5000),
  });

  const filtered = useMemo(
    () => filterEvents(events, { rangeDays, pathFilter }),
    [events, rangeDays, pathFilter]
  );
  const funnel = useMemo(() => computeFunnel(filtered), [filtered]);
  const attribution = useMemo(() => computeAttribution(filtered), [filtered]);
  const sessions = useMemo(() => computeSessions(filtered), [filtered]);
  const rows = useMemo(
    () => abandonedRows(sessions, { tab, showSpam }),
    [sessions, tab, showSpam]
  );

  const markSpam = async (sessionId) => {
    await base44.entities.ApplyFunnelEvent.updateMany({ session_id: sessionId }, { $set: { spam_score: 1 } });
    queryClient.invalidateQueries({ queryKey: ["apply-funnel-events"] });
  };
  const ignore = async (sessionId) => {
    await base44.entities.ApplyFunnelEvent.updateMany({ session_id: sessionId }, { $set: { ignored: true } });
    queryClient.invalidateQueries({ queryKey: ["apply-funnel-events"] });
  };
  const restore = async (sessionId) => {
    await base44.entities.ApplyFunnelEvent.updateMany({ session_id: sessionId }, { $set: { spam_score: 0 } });
    queryClient.invalidateQueries({ queryKey: ["apply-funnel-events"] });
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Insights</div>
        <h1 className="text-2xl font-light text-[#0D1B2A]">Application Funnel</h1>
        <p className="text-sm text-gray-500 mt-1">See who starts an application but doesn't finish, and where they drop off.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeDays(r.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                rangeDays === r.id ? "bg-[#0D1B2A] text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <select
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
        >
          {PATHS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FunnelChart stages={funnel.stages} total={funnel.total} />
        <AttributionBreakdown data={attribution} />
      </div>

      {/* Abandoned table */}
      <AbandonedTable
        rows={rows}
        tab={tab}
        onTabChange={setTab}
        showSpam={showSpam}
        onToggleSpam={setShowSpam}
        onMarkSpam={markSpam}
        onIgnore={ignore}
        onRestore={restore}
      />

      {/* Ethics guardrail */}
      <div className="flex items-start gap-2.5 text-xs text-gray-500 bg-[#FBF6EF] border border-[#E8DDD0] rounded-lg px-4 py-3">
        <ShieldAlert className="w-4 h-4 text-[#C9A96E] flex-shrink-0 mt-0.5" />
        <p>Data shown here is admin-only. Use the Reach out button with judgment — cold emails to abandoned form-fillers can feel intrusive if not framed well.</p>
      </div>
    </div>
  );
}