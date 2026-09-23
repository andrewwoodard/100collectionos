import React, { useMemo, useState } from "react";
import { format, subMonths, startOfMonth, isSameMonth } from "date-fns";
import { DollarSign, Calendar, ChevronDown, History } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const statusStyles = {
  paid:          "bg-green-50 text-green-600",
  open:          "bg-blue-50 text-blue-600",
  draft:         "bg-gray-100 text-gray-500",
  void:          "bg-gray-100 text-gray-400",
  uncollectible: "bg-red-50 text-red-600",
};

export default function PaidRevenueTab({ invoices, isLoading }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(11); // default: current month

  // Last 12 months ending at the current month
  const months = useMemo(() => {
    const now = startOfMonth(new Date());
    const start = subMonths(now, 11);
    return Array.from({ length: 12 }, (_, i) => subMonths(now, 11 - i));
  }, []);

  // Only paid invoices, bucketed by their paid_date month
  const buckets = useMemo(() => {
    const paid = invoices.filter(inv => inv.status === "paid");
    return months.map((month) => {
      const monthInvoices = paid.filter(inv => {
        const ts = inv.paid_date || inv.created;
        if (!ts) return false;
        return isSameMonth(new Date(ts * 1000), month);
      }).sort((a, b) => (b.amount_paid || 0) - (a.amount_paid || 0));

      const total = monthInvoices.reduce((s, inv) => s + (inv.amount_paid || 0), 0);
      const totalProperties = monthInvoices.reduce((s, inv) => s + (inv.quantity || 1), 0);
      return { month, invoices: monthInvoices, total, totalProperties };
    });
  }, [months, invoices]);

  // Lookup of all paid invoices grouped by partner, for historical tooltips
  const invoicesByPartner = useMemo(() => {
    const map = new Map();
    for (const inv of invoices) {
      if (inv.status !== "paid") continue;
      const key = inv.partner_name;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(inv);
    }
    return map;
  }, [invoices]);

  const grandTotal = useMemo(() => buckets.reduce((s, b) => s + b.total, 0), [buckets]);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">Loading revenue…</div>;
  }

  const selectedBucket = buckets[selectedMonthIdx];
  const now = startOfMonth(new Date());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#C9A96E]" />
          <span className="text-sm font-medium text-gray-700">Revenue Paid by Month</span>
          <span className="text-xs text-gray-400">· {format(months[0], "MMM yyyy")} – {format(months[11], "MMM yyyy")}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Total Paid (12 mo)</span>
          <div className="text-lg font-bold text-gray-900">
            ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* 2 row × 6 column grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {buckets.map((bucket, idx) => {
          const isCurrent = isSameMonth(bucket.month, now);
          const isSelected = selectedMonthIdx === idx;
          const hasInvoices = bucket.invoices.length > 0;
          return (
            <div key={idx} className="relative group"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}>
              <div
                onClick={() => setSelectedMonthIdx(idx)}
                className={`rounded-xl border p-4 transition-all cursor-pointer min-h-[120px] ${
                  isCurrent
                    ? "border-[#C9A96E] bg-[#C9A96E]/5"
                    : hasInvoices
                      ? "border-gray-200 bg-white hover:border-[#C9A96E]/40 hover:shadow-md"
                      : "border-gray-200 bg-gray-50"
                } ${isSelected ? "ring-2 ring-[#C9A96E]/40" : ""}`}>
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
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                    {bucket.invoices.map((inv) => (
                      <div key={inv.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">{inv.partner_name || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-mono">
                            {inv.number || inv.id} · {inv.quantity || 1} {inv.quantity === 1 ? "property" : "properties"}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-semibold text-gray-900">
                            ${(inv.amount_paid || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">paid</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">Each card sums the amount paid on invoices whose paid date falls in that month. Click a month card to see invoice details below.</p>

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
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Partner</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice #</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid Date</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount Paid</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Properties</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selectedBucket.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-gray-900">
                      {(() => {
                        const partnerName = inv.partner_name || "—";
                        const history = (invoicesByPartner.get(partnerName) || []);
                        if (history.length === 0) return partnerName;
                        const paidTotal = history.reduce((s, h) => s + (h.amount_paid || 0), 0);
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
                                    <span className="text-[10px] text-gray-400 ml-auto">{history.length} paid invoice{history.length !== 1 ? "s" : ""}</span>
                                  </div>
                                  <div className="mb-2 text-[10px] text-gray-500">
                                    Total paid: <span className="font-semibold text-gray-700">${paidTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="max-h-44 overflow-y-auto space-y-1">
                                    {history.slice(0, 15).map((h, hi) => (
                                      <div key={hi} className="flex items-center justify-between gap-2 text-[10px]">
                                        <span className="font-mono text-gray-500 truncate">{h.number || h.id}</span>
                                        <span className="text-gray-400 whitespace-nowrap">
                                          {h.paid_date ? format(new Date(h.paid_date * 1000), "MMM yy") : "—"}
                                        </span>
                                        <span className="font-medium text-gray-700 whitespace-nowrap">
                                          ${(h.amount_paid || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </span>
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
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{inv.number || inv.id}</td>
                    <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                      {inv.paid_date ? format(new Date(inv.paid_date * 1000), "MMM d, yyyy") : inv.created ? format(new Date(inv.created * 1000), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold text-gray-900">
                      ${(inv.amount_paid || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-600">{inv.quantity || 1}</td>
                    <td className="px-5 py-2.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">paid</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}