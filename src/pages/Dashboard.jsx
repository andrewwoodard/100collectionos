import React from "react";
import { sb } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Users, Building2, FileText, CreditCard, ClipboardCheck,
  CheckSquare, ArrowRight, AlertTriangle, Clock, TrendingUp, Tag, PenLine
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import StatCard from "../components/shared/StatCard";
import StatusBadge from "../components/shared/StatusBadge";
import LoadingGrid from "../components/shared/LoadingGrid";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: partners = [], isLoading: pLoading } = useQuery({
    queryKey: ["partners-b44"],
    queryFn: () => base44.entities.Partner.list('-created_date', 200),
  });
  const { data: activeProperties = 0 } = useQuery({
    queryKey: ["propertiesbase44-active-count"],
    queryFn: async () => {
      const res = await base44.functions.invoke("supabaseProperties", { action: "list", limit: 1000, filters: { active: true } });
      return (res.data?.properties || []).length;
    },
  });
  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => { const r = await sb.list("documents", null, null, 10); return r.items || []; },
  });
  const { data: billing = [] } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => { const r = await sb.list("billing_records"); return r.items || []; },
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => { const r = await sb.list("tasks", null, null, 50); return r.items || []; },
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: async () => { const r = await sb.list("activity_logs", null, null, 10); return r.items || []; },
  });
  const { data: onboardingItems = [] } = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => { const r = await sb.list("onboarding_items", null, null, 100); return r.items || []; },
  });
  const { data: funnelPartners = [] } = useQuery({
    queryKey: ["partnerOnboarding"],
    queryFn: () => base44.entities.PartnerOnboarding.list("-created_date", 200),
  });
  const { data: funnelEvents = [] } = useQuery({
    queryKey: ["apply-funnel-events-dashboard"],
    queryFn: () => base44.entities.ApplyFunnelEvent.list("-created_date", 1000),
  });

  const navigate = useNavigate();
  if (pLoading) return <LoadingGrid count={8} />;

  const livePartners = partners.filter(p => p.status === "live").length;
  const onboardingPartners = partners.filter(p => ["approved","contracted","content","build"].includes(p.funnel_stage)).length;
  const inactivePartners = partners.filter(p => p.status === "inactive").length;
  const pendingContracts = partners.filter(p => p.contract_status === "sent").length;
  const overdueBilling = billing.filter(b => b.status === "overdue").length;
  const priorityTasks = tasks.filter(t => t.status !== "complete" && (t.priority === "high" || t.priority === "urgent"));
  const inProgressApps = (() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sessions = new Map();
    for (const e of funnelEvents) {
      const t = e.created_date ? new Date(e.created_date).getTime() : 0;
      if (t < cutoff) continue;
      if (!sessions.has(e.session_id)) sessions.set(e.session_id, false);
      if (e.event_type === "submitted") sessions.set(e.session_id, true);
    }
    return [...sessions.values()].filter(v => !v).length;
  })();

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Partners" value={partners.length} icon={Users} color="blue" />
        <StatCard label="Live Partners" value={livePartners} icon={Users} color="green" />
        <StatCard label="Onboarding" value={onboardingPartners} icon={ClipboardCheck} color="gold" />
        <StatCard label="Active Properties" value={activeProperties} icon={Building2} color="purple" />
        <StatCard label="Pending Contracts" value={pendingContracts} icon={FileText} color="slate" />
        <StatCard label="Overdue Billing" value={overdueBilling} icon={CreditCard} color="red" />
        <StatCard label="Inactive Partners" value={inactivePartners} icon={Users} color="slate" />
        <StatCard label="Open Tasks" value={tasks.filter(t => t.status !== "complete").length} icon={CheckSquare} color="blue" />
        <Link to="/admin/apply-funnel" className="block">
          <StatCard label="In Progress Applications" value={inProgressApps} icon={PenLine} color="gold" subtitle="Started but not submitted" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Tasks */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Priority Tasks</h3>
            <Link to={createPageUrl("Tasks")} className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {priorityTasks.length === 0 && (
              <div className="p-5 text-sm text-gray-400 text-center">No priority tasks</div>
            )}
            {priorityTasks.slice(0, 5).map(task => (
              <div key={task.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{task.partner_name || "General"}</p>
                  </div>
                  <StatusBadge status={task.priority} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Documents */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Recent Documents</h3>
            <Link to={createPageUrl("Documents")} className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {documents.length === 0 && (
              <div className="p-5 text-sm text-gray-400 text-center">No documents yet</div>
            )}
            {documents.slice(0, 5).map(doc => (
              <div key={doc.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{doc.partner_name} · {doc.doc_type?.replace(/_/g, " ")}</p>
                  </div>
                  <StatusBadge status={doc.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
            <Link to={createPageUrl("ActivityFeed")} className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {activities.length === 0 && (
              <div className="p-5 text-sm text-gray-400 text-center">No recent activity</div>
            )}
            {activities.slice(0, 6).map(act => (
              <div key={act.id} className="px-5 py-3">
                <p className="text-sm text-gray-700">{act.action}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {act.performed_by} · {act.created_date ? format(new Date(act.created_date), "MMM d, h:mm a") : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue Alerts */}
      {overdueBilling > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">
              {overdueBilling} overdue billing item{overdueBilling > 1 ? "s" : ""} need attention
            </p>
            <Link to={createPageUrl("Billing")} className="text-xs text-red-600 hover:underline mt-0.5 inline-block">
              Review billing →
            </Link>
          </div>
        </div>
      )}

      {/* Partner Funnel Metrics */}
      {partners.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Partner Funnel Insights</h2>
            <Link to="/PartnerFunnelTracker" className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1">
              Open Funnel Tracker <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Partners Count */}
            <PartnerStatusDonut partners={partners} />

            {/* Stage Completion Rates */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Partner Funnel Stages</h3>
              <FunnelStageChart partners={partners} navigate={navigate} />
            </div>
          </div>

          {/* Licensing Fee Summary */}
          <LicensingFeeSummary partners={funnelPartners} />
        </>
      )}
    </div>
  );
}

function FunnelStageChart({ partners, navigate }) {
  const STAGES = ["approved","contracted","content","build","listed"];
  const LABELS = { approved:"Approved", contracted:"Contracted", content:"Content", build:"Build", listed:"Listed" };
  const COLORS = { approved:"#94a3b8", contracted:"#6366f1", content:"#8b5cf6", build:"#f59e0b", listed:"#10b981" };

  const data = STAGES.map(stage => ({
    label: LABELS[stage],
    count: partners.filter(p => p.funnel_stage === stage).length,
    color: COLORS[stage],
  }));

  return (
    <div onClick={() => navigate("/PartnerFunnelTracker")} className="cursor-pointer">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={80} />
          <Tooltip formatter={(v) => `${v} partners`} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-center text-gray-400 mt-1">Click to open Funnel Tracker</p>
    </div>
  );
}

function PartnerStatusDonut({ partners }) {
  const live = partners.filter(p => p.status === "live").length;
  const inactive = partners.filter(p => p.status === "inactive").length;
  const other = partners.length - live - inactive;
  const total = partners.length;
  const livePct = total ? Math.round((live / total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-gray-900">Partner Status</h3>
      <div className="flex items-center justify-center">
        <div className="relative w-28 h-28">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#C9A96E" strokeWidth="3"
              strokeDasharray={`${livePct} ${100 - livePct}`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-900">{livePct}%</span>
            <span className="text-[10px] text-gray-400">live</span>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C9A96E] inline-block"></span>Live</span>
          <span className="font-semibold">{live}</span>
        </div>
        {inactive > 0 && (
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span>Inactive</span>
            <span className="font-semibold">{inactive}</span>
          </div>
        )}
        {other > 0 && (
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-200 inline-block"></span>Other</span>
            <span className="font-semibold">{other}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-medium border-t border-gray-100 pt-2">
          <span>Total</span>
          <span>{total}</span>
        </div>
      </div>
    </div>
  );
}

function LicensingFeeSummary({ partners }) {
  const groups = {};
  partners.forEach(p => {
    const key = p.licensing_fee_deal?.trim() || "Not Set";
    groups[key] = (groups[key] || 0) + 1;
  });

  const invoiced = partners.filter(p => p.licensing_fees_invoiced && p.licensing_fees_invoiced !== "No" && p.licensing_fees_invoiced !== "-").length;
  const notInvoiced = partners.length - invoiced;

  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Tag className="w-4 h-4 text-[#C9A96E]" /> Licensing Fee Summary
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Fee Deals</p>
          <div className="space-y-2">
            {sorted.map(([deal, count]) => (
              <div key={deal} className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-xs text-gray-700 truncate max-w-[200px]">{deal}</span>
                  <span className="text-xs font-semibold text-gray-900 ml-2">{count}</span>
                </div>
                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#C9A96E]"
                    style={{ width: `${Math.round((count / partners.length) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Invoicing Status</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm text-green-800">Fees Invoiced</span>
              <span className="text-lg font-bold text-green-700">{invoiced}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <span className="text-sm text-red-800">Not Yet Invoiced</span>
              <span className="text-lg font-bold text-red-700">{notInvoiced}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}