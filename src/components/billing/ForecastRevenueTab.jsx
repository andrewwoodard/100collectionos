import React, { useMemo, useState } from "react";
import { format, subMonths, addMonths, startOfMonth, isSameMonth } from "date-fns";
import { TrendingUp, Calendar, ChevronDown, History } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const statusStyles = {
  paid:          "bg-green-50 text-green-600",
  open:          "bg-blue-50 text-blue-600",
  draft:         "bg-gray-100 text-gray-500",
  void:          "bg-gray-100 text-gray-400",
  uncollectible: "bg-red-50 text-red-600",
};

export default function ForecastRevenueTab({ invoices, subscriptions, isLoading }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(2); // default: current month

  // Build a lookup of all invoices grouped by partner name, for historical tooltips
  const invoicesByPartner = useMemo(() => {
    const map = new Map();
    for (const inv of invoices) {
      const key = inv.partner_name;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(inv);
    }
    return map;
  }, [invoices]);

  // Generate 12 months: 3 past (including current) + 9 future
  const months = useMemo(() => {
    const now = startOfMonth(new Date());
    const start = subMonths(now, 2);
    return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  }, []);

  // Lookup: subscription ID → interval, for resolving actual invoice intervals
  const subIntervalMap = useMemo(() => {
    const map = new Map();
    for (const sub of subscriptions) {
      if (sub.id) map.set(sub.id, sub.interval);
    }
    return map;
  }, [subscriptions]);

  // Helper: resolve interval for an invoice or projected subscription
  const resolveInterval = (inv) => {
    if (inv.interval) return inv.interval;
    if (inv.subscription_id && subIntervalMap.has(inv.subscription_id)) {
      return subIntervalMap.get(inv.subscription_id);
    }
    return null;
  };

  // Project future recurring invoices from active subscriptions
  const projectedByMonth = useMemo(() => {
    const now = startOfMonth(new Date());
    const lastMonth = months[months.length - 1];
    const map = new Map();

    for (const sub of subscriptions) {
      if (!sub.amount || sub.amount <= 0) continue;
      // Skip canceled/voided subscriptions — they won't generate future renewals
      if (sub.status === "canceled") continue;
      const periodEnd = new Date((sub.current_period_end || 0) * 1000);

      if (sub.interval === "year") {
        const renewalMonth = startOfMonth(periodEnd);
        if (renewalMonth >= now && renewalMonth <= lastMonth) {
          const idx = months.findIndex(m => isSameMonth(m, renewalMonth));
          if (idx >= 0) {
            if (!map.has(idx)) map.set(idx, []);
            map.get(idx).push({
              ...sub,
              is_projected: true,
              projected_date: renewalMonth.getTime() / 1000,
              description: `Annual renewal · ${sub.plan_name || "subscription"}`,
            });
          }
        }
      } else {
        let nextBilling = startOfMonth(periodEnd);
        while (nextBilling < now) {
          nextBilling = addMonths(nextBilling, sub.interval_count || 1);
        }
        while (nextBilling <= lastMonth) {
          const idx = months.findIndex(m => isSameMonth(m, nextBilling));
          if (idx >= 0) {
            if (!map.has(idx)) map.set(idx, []);
            map.get(idx).push({
              ...sub,
              is_projected: true,
              projected_date: nextBilling.getTime() / 1000,
              description: `Monthly recurring · ${sub.plan_name || "subscription"}`,
            });
          }
          nextBilling = addMonths(nextBilling, sub.interval_count || 1);
        }
      }
    }
    return map;
  }, [subscriptions, months]);

  // Bucket: actual invoices for past/current months + projected for future months
  const buckets = useMemo(() => {
    return months.map((month, idx) => {
      const isFuture = idx > 2;

      const actualInvoices = invoices
        .filter((inv) => inv.status !== "void")
        .filter((inv) => {
          const ts = inv.due_date || inv.created;
          if (!ts) return false;
          return isSameMonth(new Date(ts * 1000), month);
        })
        .map(inv => ({ ...inv, is_projected: false }));

      const projectedInvoices = isFuture ? (projectedByMonth.get(idx) || []) : [];

      const allInvoices = [...actualInvoices, ...projectedInvoices]
        .sort((a, b) => (b.amount_due || b.amount || 0) - (a.amount_due || a.amount || 0));
      const total = allInvoices.reduce((sum, inv) => sum + (inv.amount_due || inv.amount || 0), 0);
      const totalProperties = allInvoices.reduce((sum, inv) => sum + (inv.quantity || 1), 0);

      // Count properties by renewal interval
      let monthlyProperties = 0;
      let annualProperties = 0;
      for (const inv of allInvoices) {
        // Resolve interval: projected subs carry it directly; actual invoices
        // need to look it up from the subscription map via subscription_id
        let interval = inv.interval;
        if (!interval && inv.subscription_id) {
          interval = subIntervalMap.get(inv.subscription_id);
        }
        const qty = inv.quantity || 1;
        if (interval === "year") annualProperties += qty;
        else if (interval === "month") monthlyProperties += qty;
      }

      return { month, invoices: allInvoices, total, totalProperties, monthlyProperties, annualProperties };
    });
  }, [months, invoices, projectedByMonth, subIntervalMap]);

  const grandTotal = useMemo(() => buckets.reduce((s, b) => s + b.total, 0), [buckets]);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">Loading forecast…</div>
    );
  }

  const selectedBucket = buckets[selectedMonthIdx];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#C9A96E]" />
          <span className="text-sm font-medium text-gray-700">Revenue Forecast</span>
          <span className="text-xs text-gray-400">· {format(months[0], "MMM yyyy")} – {format(months[11], "MMM yyyy")}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Total Forecast</span>
          <div className="text-lg font-bold text-gray-900">
            ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* 2 row × 6 column grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {buckets.map((bucket, idx) => {
          const isPast = idx < 3;
          const isCurrent = idx === 2;
          const isSelected = selectedMonthIdx === idx;
          const hasInvoices = bucket.invoices.length > 0;
          return (
            <div
              key={idx}
              className="relative group"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                onClick={() => setSelectedMonthIdx(idx)}
                className={`rounded-xl border p-4 transition-all cursor-pointer min-h-[120px] ${
                  isCurrent
                    ? "border-[#C9A96E] bg-[#C9A96E]/5"
                    : isPast
                      ? "border-gray-200 bg-gray-50"
                      : "border-gray-200 bg-white hover:border-[#C9A96E]/40 hover:shadow-md"
                } ${isSelected ? "ring-2 ring-[#C9A96E]/40" : ""}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar className="w-3 h-3 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {format(bucket.month, "MMM yy")}
                  </span>
                  {isCurrent && (
                    <span className="text-[9px] font-semibold text-[#C9A96E] uppercase ml-auto">Now</span>
                  )}
                </div>
                <div className={`text-lg font-bold ${hasInvoices ? "text-gray-900" : "text-gray-300"}`}>
                  ${bucket.total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {bucket.invoices.length} invoice{bucket.invoices.length !== 1 ? "s" : ""} · {bucket.totalProperties} {bucket.totalProperties === 1 ? "property" : "properties"}
                </div>
                {(bucket.monthlyProperties > 0 || bucket.annualProperties > 0) && (
                  <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                    {bucket.monthlyProperties > 0 && (
                      <span className="text-blue-500">{bucket.monthlyProperties} monthly</span>
                    )}
                    {bucket.annualProperties > 0 && (
                      <span className="text-[#A68B4B]">{bucket.annualProperties} annual</span>
                    )}
                  </div>
                )}
              </div>

              {/* Hover popover */}
              {hoveredIdx === idx && hasInvoices && (
                <div className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 w-64 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-700">
                      {format(bucket.month, "MMMM yyyy")} · {bucket.invoices.length} invoice{bucket.invoices.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      ${bucket.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {(bucket.monthlyProperties > 0 || bucket.annualProperties > 0) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {bucket.monthlyProperties > 0 && (
                          <span className="text-[10px] text-blue-500">{bucket.monthlyProperties} monthly props</span>
                        )}
                        {bucket.annualProperties > 0 && (
                          <span className="text-[10px] text-[#A68B4B]">{bucket.annualProperties} annual props</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                    {bucket.invoices.map((inv, i) => {
                      const amount = inv.is_projected ? (inv.amount || 0) : (inv.amount_due || 0);
                      return (
                        <div key={inv.is_projected ? `proj-${inv.id}-${i}` : inv.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-800 truncate">{inv.partner_name || "—"}</p>
                            <p className="text-[10px] text-gray-400 font-mono">
                              {inv.is_projected ? (inv.description || "Projected") : (inv.number || inv.id)} · {inv.quantity || 1} {inv.quantity === 1 ? "property" : "properties"}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-xs font-semibold ${inv.is_projected ? "text-[#A68B4B]" : "text-gray-900"}`}>
                              ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </p>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${inv.is_projected ? "bg-amber-50 text-amber-600" : inv.status === "paid" ? "bg-green-50 text-green-600" : inv.status === "open" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
                              {inv.is_projected ? "projected" : inv.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">Past months show actual Stripe invoices. Future months project recurring subscriptions (monthly &amp; annual) in gold. Click a month card to see invoice details below.</p>

      {/* Invoice details table for selected month */}
      {selectedBucket && selectedBucket.invoices.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">{format(selectedBucket.month, "MMMM yyyy")}</span>
              <ChevronDown className="w-3 h-3 text-gray-300" />
            </div>
            <div className="text-xs text-gray-500">
              {selectedBucket.invoices.length} invoices · {selectedBucket.totalProperties} properties · ${selectedBucket.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {(selectedBucket.monthlyProperties > 0 || selectedBucket.annualProperties > 0) && (
                <span className="ml-2 text-gray-400">
                  ({selectedBucket.monthlyProperties > 0 && <span className="text-blue-500">{selectedBucket.monthlyProperties} monthly</span>}
                  {selectedBucket.monthlyProperties > 0 && selectedBucket.annualProperties > 0 && " · "}
                  {selectedBucket.annualProperties > 0 && <span className="text-[#A68B4B]">{selectedBucket.annualProperties} annual</span>})
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Partner</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice #</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Properties</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selectedBucket.invoices.map((inv, i) => {
                  const amount = inv.is_projected ? (inv.amount || 0) : (inv.amount_due || 0);
                  const date = inv.is_projected
                    ? (inv.projected_date ? format(new Date(inv.projected_date * 1000), "MMM d, yyyy") : "—")
                    : (inv.due_date ? format(new Date(inv.due_date * 1000), "MMM d, yyyy") : inv.created ? format(new Date(inv.created * 1000), "MMM d, yyyy") : "—");
                  return (
                    <tr key={inv.is_projected ? `proj-${inv.id}-${i}` : inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-2.5 font-medium text-gray-900">
                        {(() => {
                          const partnerName = inv.partner_name || "—";
                          const history = invoicesByPartner.get(partnerName) || [];
                          if (history.length === 0) return partnerName;
                          const paidTotal = history
                            .filter(h => h.status === "paid")
                            .reduce((s, h) => s + (h.amount_paid || h.amount_due || 0), 0);
                          return (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help underline decoration-dotted decoration-gray-300 underline-offset-2">
                                    {partnerName}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-sm p-0">
                                  <div className="px-3 py-2.5">
                                    <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-gray-100">
                                      <History className="w-3 h-3 text-gray-400" />
                                      <span className="text-xs font-semibold text-gray-700">{partnerName}</span>
                                      <span className="text-[10px] text-gray-400 ml-auto">{history.length} invoice{history.length !== 1 ? "s" : ""}</span>
                                    </div>
                                    <div className="mb-2 text-[10px] text-gray-500">
                                      Total paid: <span className="font-semibold text-gray-700">${paidTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="max-h-44 overflow-y-auto space-y-1">
                                      {history.slice(0, 15).map((h, hi) => (
                                        <div key={hi} className="flex items-center justify-between gap-2 text-[10px]">
                                          <span className="font-mono text-gray-500 truncate">{h.number || h.id}</span>
                                          <span className="text-gray-400 whitespace-nowrap">
                                            {h.due_date ? format(new Date(h.due_date * 1000), "MMM yy") : h.created ? format(new Date(h.created * 1000), "MMM yy") : "—"}
                                          </span>
                                          <span className="font-medium text-gray-700 whitespace-nowrap">
                                            ${(h.amount_due || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                          </span>
                                          <span className={`px-1 py-0.5 rounded-full text-[8px] ${statusStyles[h.status] || "bg-gray-100 text-gray-500"}`}>{h.status}</span>
                                        </div>
                                      ))}
                                      {history.length > 15 && (
                                        <div className="text-[10px] text-gray-400 text-center pt-0.5">+{history.length - 15} more…</div>
                                      )}
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-gray-600">
                        {inv.is_projected ? (inv.description || "Projected") : (inv.number || inv.id)}
                      </td>
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{date}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">
                        ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-2.5 text-right text-gray-600">{inv.quantity || 1}</td>
                      <td className="px-5 py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${inv.is_projected ? "bg-amber-50 text-amber-600" : statusStyles[inv.status] || "bg-gray-100 text-gray-500"}`}>
                          {inv.is_projected ? "projected" : inv.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}