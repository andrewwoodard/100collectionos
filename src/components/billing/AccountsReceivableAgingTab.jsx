import React, { useMemo, useState } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { AlertCircle, Clock, ChevronDown } from "lucide-react";

const statusStyles = {
  paid:          "bg-green-50 text-green-600",
  open:          "bg-blue-50 text-blue-600",
  draft:         "bg-gray-100 text-gray-500",
  void:          "bg-gray-100 text-gray-400",
  uncollectible: "bg-red-50 text-red-600",
};

const BUCKETS = [
  { key: "0-7",      label: "0–7 days",      min: 0,  max: 7,   accent: "emerald" },
  { key: "8-30",     label: "8–30 days",     min: 8,  max: 30,  accent: "amber" },
  { key: "31-60",    label: "31–60 days",    min: 31, max: 60,  accent: "orange" },
  { key: "61-90",    label: "61–90 days",    min: 61, max: 90,  accent: "red" },
  { key: "90+",      label: "More than 90",  min: 91, max: Infinity, accent: "rose" },
];

const accentMap = {
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-400", ring: "ring-emerald-400/40", hover: "hover:border-emerald-300" },
  amber:   { border: "border-amber-200",   bg: "bg-amber-50",   text: "text-amber-600",   dot: "bg-amber-400",   ring: "ring-amber-400/40",   hover: "hover:border-amber-300" },
  orange:  { border: "border-orange-200",  bg: "bg-orange-50",  text: "text-orange-600",  dot: "bg-orange-400",  ring: "ring-orange-400/40",  hover: "hover:border-orange-300" },
  red:     { border: "border-red-200",     bg: "bg-red-50",     text: "text-red-600",     dot: "bg-red-400",     ring: "ring-red-400/40",     hover: "hover:border-red-300" },
  rose:    { border: "border-rose-200",    bg: "bg-rose-50",    text: "text-rose-600",    dot: "bg-rose-400",    ring: "ring-rose-400/40",    hover: "hover:border-rose-300" },
};

function ageDays(inv) {
  const ts = inv.due_date || inv.created;
  if (!ts) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(ts * 1000)));
}

export default function AccountsReceivableAgingTab({ invoices, isLoading }) {
  const [selectedBucketKey, setSelectedBucketKey] = useState(BUCKETS[1].key);

  // Unpaid invoices only: open, draft, uncollectible (exclude paid + void)
  const unpaid = useMemo(
    () => invoices.filter(inv => inv.status === "open" || inv.status === "draft" || inv.status === "uncollectible"),
    [invoices]
  );

  const buckets = useMemo(() => {
    return BUCKETS.map(def => {
      const items = unpaid
        .filter(inv => {
          const a = ageDays(inv);
          return a >= def.min && a <= def.max;
        })
        .sort((a, b) => ageDays(b) - ageDays(a) || (b.amount_due || 0) - (a.amount_due || 0));
      const total = items.reduce((s, inv) => s + (inv.amount_due || inv.amount || 0), 0);
      const totalProperties = items.reduce((s, inv) => s + (inv.quantity || 1), 0);
      return { ...def, items, total, totalProperties };
    });
  }, [unpaid]);

  const grandTotal = useMemo(() => buckets.reduce((s, b) => s + b.total, 0), [buckets]);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">Loading aging report…</div>;
  }

  const selected = buckets.find(b => b.key === selectedBucketKey) || buckets[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#C9A96E]" />
          <span className="text-sm font-medium text-gray-700">Accounts Receivable Aging</span>
          <span className="text-xs text-gray-400">· Unpaid invoices by age</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Total Outstanding</span>
          <div className="text-lg font-bold text-gray-900">
            ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Bucket grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {buckets.map((bucket) => {
          const acc = accentMap[bucket.accent];
          const isSelected = selectedBucketKey === bucket.key;
          const hasItems = bucket.items.length > 0;
          return (
            <div key={bucket.key} className="relative">
              <div
                onClick={() => setSelectedBucketKey(bucket.key)}
                className={`rounded-xl border p-4 transition-all cursor-pointer min-h-[120px] ${
                  hasItems ? `${acc.border} bg-white ${acc.hover}` : "border-gray-200 bg-gray-50"
                } ${isSelected ? `ring-2 ${acc.ring}` : "hover:shadow-md"}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className={`w-3 h-3 ${hasItems ? acc.text : "text-gray-300"}`} />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{bucket.label}</span>
                </div>
                <div className={`text-lg font-bold ${hasItems ? "text-gray-900" : "text-gray-300"}`}>
                  ${bucket.total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {bucket.items.length} invoice{bucket.items.length !== 1 ? "s" : ""} · {bucket.totalProperties} {bucket.totalProperties === 1 ? "property" : "properties"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">Aging is measured from each invoice's due date (falling back to the created date). Click a bucket to see the unpaid invoices in it below.</p>

      {/* Invoice details table for selected bucket */}
      {selected.items.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">{selected.label}</span>
              <ChevronDown className="w-3 h-3 text-gray-300" />
            </div>
            <div className="text-xs text-gray-500">
              {selected.items.length} invoices · {selected.totalProperties} properties · ${selected.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Partner</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice #</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Age (days)</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount Due</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Properties</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selected.items.map((inv) => {
                  const age = ageDays(inv);
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-2.5 font-medium text-gray-900">{inv.partner_name || "—"}</td>
                      <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{inv.number || inv.id}</td>
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                        {inv.created ? format(new Date(inv.created * 1000), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                        {inv.due_date ? format(new Date(inv.due_date * 1000), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{age}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">
                        ${(inv.amount_due || inv.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-2.5 text-right text-gray-600">{inv.quantity || 1}</td>
                      <td className="px-5 py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyles[inv.status] || "bg-gray-100 text-gray-500"}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-sm text-gray-400">
          No unpaid invoices in this age bucket.
        </div>
      )}
    </div>
  );
}