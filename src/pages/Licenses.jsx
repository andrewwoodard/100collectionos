import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Navigate } from "react-router-dom";
import {
  Search, RefreshCw, Loader2, ExternalLink, CheckCircle2, Gift,
  AlertCircle, DollarSign, Tag, Link2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import AssignLicenseModal from "@/components/portal/AssignLicenseModal";

export default function Licenses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [linkedFilter, setLinkedFilter] = useState("all"); // all | linked | unlinked
  const [assignSlot, setAssignSlot] = useState(null); // slot to assign

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["stripe-license-credits"],
    queryFn: async () => {
      const res = await base44.functions.invoke("stripeLicenseCredits", {});
      return res.data;
    },
    staleTime: 60_000,
  });

  const slots = data?.slots || [];

  const partners = useMemo(() => {
    return [...new Set(slots.map(s => s.partner_name).filter(Boolean))].sort();
  }, [slots]);

  const filtered = useMemo(() => {
    return slots.filter(s => {
      if (partnerFilter !== "all" && s.partner_name !== partnerFilter) return false;
      if (linkedFilter === "linked" && !s.property_name) return false;
      if (linkedFilter === "unlinked" && s.property_name) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (s.partner_name || "").toLowerCase().includes(q) ||
          (s.property_name || "").toLowerCase().includes(q) ||
          (s.license_number || "").toLowerCase().includes(q) ||
          (s.stripe_invoice_number || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [slots, partnerFilter, linkedFilter, search]);

  const totals = useMemo(() => ({
    total: slots.length,
    linked: slots.filter(s => !!s.property_name).length,
    unlinked: slots.filter(s => !s.property_name).length,
    annualRevenue: slots.filter(s => s.is_active).reduce((sum, s) => sum + (Number(s.annual_fee) || 0), 0),
  }), [slots]);

  if (user && user.role !== "admin" && user.role !== "billing") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Licenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Stripe invoice credits — each paid slot and the property it's applied to
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-blue-600 border-blue-200 hover:bg-blue-50"
        >
          {isFetching
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Refresh from Stripe
        </Button>
      </div>

      {/* Summary cards */}
      <div className="px-8 py-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Credits</div>
          <div className="text-2xl font-bold text-gray-900">{totals.total}</div>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Linked to Property</div>
          <div className="text-2xl font-bold text-green-600">{totals.linked}</div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Unused Credits</div>
          <div className="text-2xl font-bold text-blue-600">{totals.unlinked}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Annual Revenue</div>
          <div className="text-2xl font-bold text-gray-900">${totals.annualRevenue.toLocaleString()}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-8 pb-4 flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search partner, property, invoice…"
            className="pl-9 w-72 text-sm"
          />
        </div>
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-48 text-sm"><SelectValue placeholder="All Partners" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {partners.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={linkedFilter} onValueChange={setLinkedFilter}>
          <SelectTrigger className="w-44 text-sm"><SelectValue placeholder="All Slots" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Slots</SelectItem>
            <SelectItem value="linked">Linked to property</SelectItem>
            <SelectItem value="unlinked">Unused credits</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-400 ml-auto">
          {filtered.length} slot{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="px-8 pb-10">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Loading Stripe invoice data…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No license slots match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Partner</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">License #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Annual Fee</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Property Linked</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period End</th>
                  <th className="px-5 py-3"></th>
                  </tr>
                  </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s, i) => (
                  <tr key={`${s.stripe_invoice_id}-${s.license_number}-${i}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">{s.partner_name}</td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{s.license_number}</td>
                    <td className="px-5 py-3">
                      {s.stripe_invoice_url ? (
                        <a
                          href={s.stripe_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-mono"
                        >
                          {s.stripe_invoice_number}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-gray-400">{s.stripe_invoice_number || "—"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {s.is_deal
                        ? <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"><Tag className="w-3 h-3" /> Deal</span>
                        : s.annual_fee != null ? `$${Number(s.annual_fee).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{s.invoice_date || "—"}</td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{s.paid_date || "—"}</td>
                    <td className="px-5 py-3">
                      {s.property_name ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {s.property_name}
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                            <Gift className="w-3.5 h-3.5" />
                            Unassigned
                          </span>
                          {s.line_description && (
                            <div className="text-xs text-gray-400 italic max-w-[200px] truncate" title={s.line_description}>
                              {s.line_description}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                      {s.period_end ? (
                        <span className={s.is_active ? "text-gray-500" : "text-red-500"}>
                          {s.is_active ? "" : "⚠ "}{s.period_end}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {!s.property_name && s.license_record_id && (
                        <button
                          onClick={() => setAssignSlot({ id: s.license_record_id, license_number: s.license_number, partner_name: s.partner_name })}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                        >
                          <Link2 className="w-3.5 h-3.5" /> Assign
                        </button>
                      )}
                    </td>
                    </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {assignSlot && (
        <AssignLicenseModal
          license={assignSlot}
          onClose={() => setAssignSlot(null)}
          onSuccess={() => { setAssignSlot(null); queryClient.invalidateQueries({ queryKey: ["stripe-license-credits"] }); }}
        />
      )}
    </div>
  );
}