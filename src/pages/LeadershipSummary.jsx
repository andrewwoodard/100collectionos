import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, DollarSign, Target, ArrowUp, ArrowDown, Minus } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";

// Parse month from a date string like "2024-03", "03/2024", or ISO
function parseMonth(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return null;
}

const MONTHLY_TARGET_LIVE = 3; // new live partners per month target
const FEE_VALUES = {
  "Yes": 500,
  "Paid": 500,
  // fallback for deal strings containing numbers
};

function parseFeeAmount(deal) {
  if (!deal) return 0;
  const match = deal.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 500;
}

export default function LeadershipSummary() {
  const [projectedMonthlyRevenue, setProjectedMonthlyRevenue] = useState(2000);

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["leadershipPartners"],
    queryFn: () => base44.entities.PartnerOnboarding.filter({}, "partner_name", 1000),
  });

  const { data: billingRecords = [] } = useQuery({
    queryKey: ["leadershipBilling"],
    queryFn: () => base44.entities.BillingRecord.filter({}, "-invoice_date", 1000),
  });

  // Month-over-month fully live partners
  const liveByMonth = useMemo(() => {
    const counts = {};
    partners.forEach(p => {
      if (p.fully_live === "Yes" || p.fully_live === "Done") {
        const month = parseMonth(p.updated_date) || parseMonth(p.created_date);
        if (month) counts[month] = (counts[month] || 0) + 1;
      }
    });
    const sorted = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
    let cumulative = 0;
    return sorted.map(([month, newLive]) => {
      cumulative += newLive;
      return { month: month.slice(0, 7), newLive, cumulative, target: MONTHLY_TARGET_LIVE };
    });
  }, [partners]);

  // Revenue by month from BillingRecords (paid)
  const revenueByMonth = useMemo(() => {
    const months = {};
    billingRecords.forEach(r => {
      if (r.status === "paid" && r.invoice_date) {
        const month = parseMonth(r.invoice_date);
        if (month) months[month] = (months[month] || 0) + (r.amount || 0);
      }
    });

    // Supplement with licensing fees from PartnerOnboarding if billing is sparse
    if (Object.keys(months).length === 0) {
      partners.forEach(p => {
        if (p.licensing_fees_invoiced === "Yes" || p.licensing_fees_invoiced === "Paid") {
          const month = parseMonth(p.updated_date) || parseMonth(p.created_date);
          if (month) months[month] = (months[month] || 0) + parseFeeAmount(p.licensing_fee_deal);
        }
      });
    }

    const sorted = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
    return sorted.map(([month, actual]) => ({
      month: month.slice(0, 7),
      actual: Math.round(actual),
      projected: projectedMonthlyRevenue,
    }));
  }, [billingRecords, partners, projectedMonthlyRevenue]);

  // KPIs
  const totalLive = partners.filter(p => p.fully_live === "Yes" || p.fully_live === "Done").length;
  const totalInvoiced = partners.filter(p => p.licensing_fees_invoiced === "Yes" || p.licensing_fees_invoiced === "Paid").length;
  const totalRevenue = billingRecords.filter(r => r.status === "paid").reduce((s, r) => s + (r.amount || 0), 0)
    || partners.filter(p => p.licensing_fees_invoiced === "Yes" || p.licensing_fees_invoiced === "Paid")
        .reduce((s, p) => s + parseFeeAmount(p.licensing_fee_deal), 0);

  const lastTwo = liveByMonth.slice(-2);
  const momLiveChange = lastTwo.length === 2 ? lastTwo[1].newLive - lastTwo[0].newLive : 0;
  const lastTwoRev = revenueByMonth.slice(-2);
  const momRevChange = lastTwoRev.length === 2 ? lastTwoRev[1].actual - lastTwoRev[0].actual : 0;

  const MomBadge = ({ val }) => {
    if (val > 0) return <span className="flex items-center gap-0.5 text-green-600 text-xs font-medium"><ArrowUp className="w-3 h-3" />+{val} vs prior month</span>;
    if (val < 0) return <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium"><ArrowDown className="w-3 h-3" />{val} vs prior month</span>;
    return <span className="flex items-center gap-0.5 text-gray-400 text-xs"><Minus className="w-3 h-3" />Same as prior month</span>;
  };

  if (isLoading) {
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
          <h1 className="text-2xl font-bold text-[#0F172A]">Leadership Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">Month-over-month growth, live partners, and licensing revenue vs. targets</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <Target className="w-4 h-4 text-[#C9A96E]" />
          <label className="text-xs text-gray-500 whitespace-nowrap">Monthly Revenue Target ($)</label>
          <input
            type="number"
            value={projectedMonthlyRevenue}
            onChange={e => setProjectedMonthlyRevenue(Number(e.target.value))}
            className="w-24 text-sm font-semibold text-[#0F172A] outline-none border-none"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Fully Live", value: totalLive, icon: Users, mom: <MomBadge val={momLiveChange} />, accent: "#C9A96E" },
          { label: "Total Partners", value: partners.length, icon: Users, mom: null, accent: "#0F172A" },
          { label: "Fees Invoiced", value: totalInvoiced, icon: DollarSign, mom: null, accent: "#64748B" },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp, mom: <MomBadge val={momRevChange} />, accent: "#A68B4B" },
        ].map(({ label, value, icon: Icon, mom, accent }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accent + "18" }}>
                <Icon className="w-4 h-4" style={{ color: accent }} />
              </div>
            </div>
            <p className="text-3xl font-bold text-[#0F172A]">{value}</p>
            {mom && <div className="mt-1">{mom}</div>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Fully Live MoM */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Fully Live Partners — Month over Month</h3>
          <p className="text-xs text-gray-400 mb-4">New partners going live each month vs. target ({MONTHLY_TARGET_LIVE}/mo)</p>
          {liveByMonth.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No live partner data with parseable dates yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={liveByMonth} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <ReferenceLine y={MONTHLY_TARGET_LIVE} stroke="#C9A96E" strokeDasharray="4 4" label={{ value: "Target", fill: "#C9A96E", fontSize: 10 }} />
                <Bar dataKey="newLive" name="New Live" fill="#0F172A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue vs Projected */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Licensing Revenue vs. Projected Target</h3>
          <p className="text-xs text-gray-400 mb-4">Actual revenue collected vs. monthly projection</p>
          {revenueByMonth.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No revenue data available yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueByMonth} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                <Tooltip formatter={v => `$${Number(v).toLocaleString()}`} />
                <Legend />
                <Line type="monotone" dataKey="actual" name="Actual Revenue" stroke="#0F172A" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="projected" name="Projected Target" stroke="#C9A96E" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cumulative live trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Cumulative Live Partners Over Time</h3>
        <p className="text-xs text-gray-400 mb-4">Running total of fully live partners</p>
        {liveByMonth.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={liveByMonth} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="cumulative" name="Cumulative Live" stroke="#C9A96E" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}