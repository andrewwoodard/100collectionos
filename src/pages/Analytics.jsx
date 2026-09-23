import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Download, BarChart3, Users, Building2, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";

const COLORS = ["#C9A96E", "#0F172A", "#64748B", "#A68B4B", "#CBD5E1", "#475569", "#E8D5B0", "#334155"];

function exportCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Analytics() {
  const [regionFilter, setRegionFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const { data: partners = [], isLoading: loadingPartners } = useQuery({
    queryKey: ["analyticsPartners"],
    queryFn: () => base44.entities.PartnerOnboarding.filter({}, "partner_name", 1000),
  });

  const { data: auditData = [] } = useQuery({
    queryKey: ["analyticsAudit"],
    queryFn: () => base44.entities.PartnerAudit.filter({}, "company", 1000),
  });

  const { data: propertyChanges = [] } = useQuery({
    queryKey: ["analyticsPropertyChanges"],
    queryFn: () => base44.entities.PropertyChange.filter({}, "-created_date", 1000),
  });

  const { data: statsRaw = [] } = useQuery({
    queryKey: ["analyticsPropertyStats"],
    queryFn: async () => {
      const res = await base44.functions.invoke("supabaseProperties", { action: "stats" });
      return res.data?.properties || [];
    },
  });

  // Build cumulative property count per month over last 12 months
  const propertyCountByMonth = useMemo(() => {
    if (!statsRaw.length) return [];

    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    return months.map(month => {
      // A property is counted in a month if it was created on or before end of that month
      const inWindow = statsRaw.filter(p => p.created_at?.slice(0, 7) <= month);
      const active = inWindow.filter(p => p.active !== false).length;
      const inactive = inWindow.filter(p => p.active === false).length;
      return { month, active, inactive, total: inWindow.length };
    });
  }, [statsRaw]);

  // Derive unique regions & categories from partners (using licensing_fee_deal as category proxy)
  const regions = useMemo(() => {
    const vals = [...new Set(partners.map(p => p.region).filter(Boolean))];
    return ["All", ...vals.sort()];
  }, [partners]);

  const categories = useMemo(() => {
    const vals = [...new Set(partners.map(p => p.in_category).filter(Boolean))];
    return ["All", ...vals.sort()];
  }, [partners]);

  const filtered = useMemo(() => {
    return partners.filter(p => {
      if (regionFilter !== "All" && p.region !== regionFilter) return false;
      if (categoryFilter !== "All" && p.in_category !== categoryFilter) return false;
      return true;
    });
  }, [partners, regionFilter, categoryFilter]);

  // Onboarding completion rate per partner
  const onboardingFields = [
    "contract_sent", "contract_signed", "stripe_added", "onboarding_fee_invoiced",
    "onboarding_fee_paid", "kickoff_email_sent", "intake_form_done", "writeup_completed",
    "destination_writeup_approved", "properties_given", "analytics_given", "website_access_given",
    "fully_live", "live_email_sent", "proud_header_added", "landing_page_added",
    "social_media_announced", "in_category",
  ];

  const completionData = useMemo(() => {
    return filtered.map(p => {
      const done = onboardingFields.filter(f => p[f] === "Yes" || p[f] === "Done" || p[f] === "Sent" || p[f] === "Paid").length;
      return { name: p.partner_name, completion: Math.round((done / onboardingFields.length) * 100) };
    }).sort((a, b) => b.completion - a.completion).slice(0, 15);
  }, [filtered]);

  // License fee breakdown
  const licensingData = useMemo(() => {
    const counts = {};
    filtered.forEach(p => {
      const key = p.licensing_fee_deal || "Unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Audit status summary
  const auditSummary = useMemo(() => {
    const fields = ["analytics_given", "website_access_given", "proud_header_added", "vrm_landing_page_added"];
    const labels = ["Analytics", "Website Access", "Proud Header", "VRM Landing"];
    const filteredNames = new Set(filtered.map(p => p.partner_name?.toLowerCase().trim()));
    const relevantAudits = auditData.filter(a => filteredNames.has(a.company?.toLowerCase().trim()));
    return fields.map((f, i) => ({
      label: labels[i],
      yes: relevantAudits.filter(a => a[f] === "Yes").length,
      no: relevantAudits.filter(a => a[f] !== "Yes").length,
    }));
  }, [filtered, auditData]);

  // Property changes by status
  const changesByStatus = useMemo(() => {
    const filteredNames = new Set(filtered.map(p => p.partner_name?.toLowerCase().trim()));
    const relevant = propertyChanges.filter(c => filteredNames.has(c.partner?.toLowerCase().trim()));
    const counts = {};
    relevant.forEach(c => {
      const key = c.status || "Unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered, propertyChanges]);

  const handleExportPartners = () => {
    exportCSV("partner_performance.csv", filtered.map(p => ({
      partner_name: p.partner_name,
      region: p.region || "",
      in_category: p.in_category || "",
      licensing_fee_deal: p.licensing_fee_deal || "",
      licensing_fees_invoiced: p.licensing_fees_invoiced || "",
      fully_live: p.fully_live || "",
      completion_pct: (completionData.find(c => c.name === p.partner_name)?.completion ?? 0) + "%",
    })));
  };

  const handleExportAudit = () => {
    const filteredNames = new Set(filtered.map(p => p.partner_name?.toLowerCase().trim()));
    exportCSV("audit_status.csv", auditData.filter(a => filteredNames.has(a.company?.toLowerCase().trim())));
  };

  if (loadingPartners) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#C9A96E] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Partner Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aggregated performance data across {filtered.length} partners</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPartners} className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Download className="w-4 h-4" /> Export Partners CSV
          </button>
          <button onClick={handleExportAudit} className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Download className="w-4 h-4" /> Export Audit CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Region</label>
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#C9A96E] bg-white"
          >
            {regions.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Category</label>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#C9A96E] bg-white"
          >
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        {(regionFilter !== "All" || categoryFilter !== "All") && (
          <button onClick={() => { setRegionFilter("All"); setCategoryFilter("All"); }} className="text-xs text-[#C9A96E] hover:underline">Clear filters</button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Partners", value: filtered.length, icon: Users },
          { label: "Fully Live", value: filtered.filter(p => p.fully_live === "Yes").length, icon: TrendingUp },
          { label: "Fees Invoiced", value: filtered.filter(p => p.licensing_fees_invoiced === "Yes").length, icon: BarChart3 },
          { label: "Property Changes", value: propertyChanges.filter(c => new Set(filtered.map(p => p.partner_name?.toLowerCase().trim())).has(c.partner?.toLowerCase().trim())).length, icon: Building2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#0F172A]/5 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-[#C9A96E]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Onboarding Completion */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Onboarding Completion % (Top 15)</h3>
          {completionData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={completionData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `${v}%`} />
                <Bar dataKey="completion" fill="#C9A96E" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Licensing Fee Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Licensing Fee Deal Breakdown</h3>
          {licensingData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={licensingData} cx="50%" cy="45%" outerRadius={110} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {licensingData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Property Count Over Time */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Property Count Over Time</h3>
        <p className="text-xs text-gray-400 mb-4">Cumulative active vs. inactive properties over the last 12 months</p>
        {propertyCountByMonth.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={propertyCountByMonth} margin={{ left: 0, right: 16, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" name="Total" stroke="#0F172A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="active" name="Active" stroke="#C9A96E" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="inactive" name="Inactive" stroke="#94A3B8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Audit Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Audit Checklist Coverage</h3>
          {auditSummary.every(s => s.yes + s.no === 0) ? (
            <p className="text-sm text-gray-400 text-center py-8">No audit data</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={auditSummary} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="yes" name="Complete" fill="#C9A96E" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="no" name="Missing" fill="#E2E8F0" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Property Changes by Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Property Changes by Status</h3>
          {changesByStatus.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No property change data</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={changesByStatus} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Count" fill="#0F172A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}