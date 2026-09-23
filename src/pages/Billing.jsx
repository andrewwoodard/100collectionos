import React, { useState, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Search, CreditCard, DollarSign, ExternalLink, Loader2, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import ForecastRevenueTab from "@/components/billing/ForecastRevenueTab";
import PaidRevenueTab from "@/components/billing/PaidRevenueTab";
import AccountsReceivableAgingTab from "@/components/billing/AccountsReceivableAgingTab";

const statusStyles = {
  paid:           "bg-green-50 text-green-700 border-green-200",
  open:           "bg-blue-50 text-blue-700 border-blue-200",
  draft:          "bg-gray-100 text-gray-500 border-gray-200",
  void:           "bg-gray-100 text-gray-400 border-gray-200",
  uncollectible:  "bg-red-50 text-red-600 border-red-200",
};

export default function Billing() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("non_void");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [sortField, setSortField] = useState("created");
  const [sortDir, setSortDir] = useState("desc");
  const printRef = useRef(null);

  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const w = window.open("", "_blank", "width=1000,height=700");
    if (!w) return;
    const statusLabel = statusFilter === "non_void" ? "All (excl. Void)" : statusFilter === "all" ? "All Statuses" : statusFilter;
    w.document.write(`<!DOCTYPE html><html><head><title>Billing — Invoices</title>
      <style>
        * { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
        h1 { font-size: 18px; color: #111827; margin: 0 0 4px; font-weight: 700; }
        .meta { font-size: 11px; color: #94A3B8; margin: 0 0 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; color: #6B7280; border-bottom: 1px solid #E5E7EB; padding: 8px 12px; background: #F9FAFB; }
        td { padding: 8px 12px; border-bottom: 1px solid #F3F4F6; color: #374151; }
        .mono { font-family: ui-monospace, Menlo, monospace; }
        .cap { text-transform: capitalize; }
        .right { text-align: right; }
      </style></head><body>
      <h1>Billing — Invoices</h1>
      <p class="meta">Partner: ${partnerFilter === "all" ? "All" : partnerFilter} &middot; Status: ${statusLabel} &middot; ${new Date().toLocaleString()}</p>
      ${node.outerHTML}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["stripe-all-invoices"],
    queryFn: async () => {
      const res = await base44.functions.invoke("stripeAllInvoices", {});
      return {
        invoices: res.data?.invoices || [],
        subscriptions: res.data?.subscriptions || [],
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const invoices = useMemo(() => {
    const seen = new Set();
    return (data?.invoices || []).filter(inv => { if (seen.has(inv.id)) return false; seen.add(inv.id); return true; });
  }, [data]);

  const subscriptions = useMemo(() => data?.subscriptions || [], [data]);

  const partners = useMemo(() => {
    const names = [...new Set(invoices.map(i => i.partner_name).filter(Boolean))].sort();
    return names;
  }, [invoices]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const filtered = useMemo(() => {
    const list = invoices.filter(inv => {
      if (statusFilter === "non_void" && inv.status === "void") return false;
      if (statusFilter !== "all" && statusFilter !== "non_void" && inv.status !== statusFilter) return false;
      if (partnerFilter !== "all" && inv.partner_name !== partnerFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (inv.partner_name || "").toLowerCase().includes(q) ||
          (inv.number || "").toLowerCase().includes(q) ||
          (inv.partner_email || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let aVal, bVal;
      if (sortField === "created") { aVal = a.created || 0; bVal = b.created || 0; }
      else if (sortField === "amount_paid") { aVal = a.amount_paid || 0; bVal = b.amount_paid || 0; }
      else if (sortField === "amount_due") { aVal = a.amount_due || 0; bVal = b.amount_due || 0; }
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [invoices, statusFilter, partnerFilter, search, sortField, sortDir]);

  const totals = useMemo(() => ({
    totalPaid: invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount_paid || 0), 0),
    totalOpen: invoices.filter(i => i.status === "open").reduce((s, i) => s + (i.amount_due || 0), 0),
    count: invoices.length,
  }), [invoices]);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Billing</h2>
          <p className="text-sm text-gray-500 mt-0.5">Live invoices from Stripe across all partners</p>
        </div>
        {isLoading && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
      </div>

      <Tabs defaultValue="invoices" className="w-full">
        <TabsList className="bg-white border border-gray-200">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="forecast">Forecast Revenue</TabsTrigger>
          <TabsTrigger value="paid">Paid by Month</TabsTrigger>
          <TabsTrigger value="ar-aging">A/R Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-5 mt-4 focus-visible:outline-none">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-500" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">Total Paid</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">${totals.totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">Open / Due</span>
              </div>
              <div className="text-2xl font-bold text-blue-700">${totals.totalOpen.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">Total Invoices</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{totals.count}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search partner, invoice #…" className="pl-9 bg-white" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={partnerFilter} onValueChange={setPartnerFilter}>
              <SelectTrigger className="w-48 bg-white"><SelectValue placeholder="All Partners" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Partners</SelectItem>
                {partners.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="non_void">All (excl. Void)</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="void">Void</SelectItem>
                <SelectItem value="uncollectible">Uncollectible</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-400 self-center whitespace-nowrap">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</span>
            <button onClick={handlePrint} disabled={isLoading || filtered.length === 0}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>

          {/* Table */}
          <div ref={printRef} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading Stripe invoices…</div>
            ) : isError ? (
              <div className="py-16 text-center text-sm text-red-500">Failed to load invoices from Stripe.</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No invoices found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice #</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Partner</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort("created")}>
                      Date {sortIcon("created")}
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort("amount_paid")}>
                      Amount Paid {sortIcon("amount_paid")}
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort("amount_due")}>
                      Amount Due {sortIcon("amount_due")}
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{inv.number || inv.id}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{inv.partner_name || "—"}</td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {inv.created ? format(new Date(inv.created * 1000), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        ${(inv.amount_paid || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {inv.amount_due > 0 ? `$${inv.amount_due.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyles[inv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {inv.hosted_invoice_url && (
                          <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-500 transition-colors" title="View in Stripe">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="forecast" className="mt-4 focus-visible:outline-none">
          <ForecastRevenueTab invoices={invoices} subscriptions={subscriptions} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="paid" className="mt-4 focus-visible:outline-none">
          <PaidRevenueTab invoices={invoices} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="ar-aging" className="mt-4 focus-visible:outline-none">
          <AccountsReceivableAgingTab invoices={invoices} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}