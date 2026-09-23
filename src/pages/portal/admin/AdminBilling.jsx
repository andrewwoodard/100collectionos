import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PortalLayout from "../../../components/portal/PortalLayout";
import { DollarSign, Printer } from "lucide-react";

const PAY_STATUSES = ["all", "open", "unpaid", "invoiced", "paid", "overdue"];
const OPEN_STATUSES = ["unpaid", "invoiced", "overdue"];

export default function AdminBilling({ embedded = false }) {
  const [filter, setFilter] = useState("all");
  const qc = useQueryClient();
  const printRef = useRef(null);

  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const label = filter === "all" ? "All" : filter === "open" ? "Open Invoices" : filter;
    w.document.write(`<!DOCTYPE html><html><head><title>Billing & Licensing — ${label}</title>
      <style>
        * { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
        h1 { font-size: 18px; color: #0D1B2A; margin: 0 0 4px; font-weight: 600; }
        .meta { font-size: 11px; color: #94A3B8; margin: 0 0 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; color: #64748B; border-bottom: 1px solid #E2E8F0; padding: 8px 12px; }
        td { padding: 8px 12px; border-bottom: 1px solid #F1F5F9; color: #334155; }
        .cap { text-transform: capitalize; }
      </style></head><body>
      <h1>Billing & Licensing</h1>
      <p class="meta">Filter: ${label} &middot; ${new Date().toLocaleString()}</p>
      ${node.outerHTML}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const { data: licenses = [] } = useQuery({
    queryKey: ["all-licenses"],
    queryFn: () => base44.entities.LicenseRecord.list("-created_date", 200),
  });

  // Fetch all partners to build sub-brand → parent name rollup map
  const { data: allPartners = [] } = useQuery({
    queryKey: ["all-partners-billing"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
  });

  // Map: sub-brand partner_name → parent partner_name (for billing rollup)
  const subBrandToParentName = useMemo(() => {
    const idToName = {};
    for (const p of allPartners) idToName[p.id] = p.partner_name;
    const map = {};
    for (const p of allPartners) {
      if (p.parent_partner_id && idToName[p.parent_partner_id]) {
        map[p.partner_name] = idToName[p.parent_partner_id];
      }
    }
    return map;
  }, [allPartners]);

  // Roll up: replace sub-brand partner_name with parent's name for display
  const rolledUpLicenses = useMemo(() =>
    licenses.map(l => ({
      ...l,
      partner_name: subBrandToParentName[l.partner_name] || l.partner_name,
    })),
    [licenses, subBrandToParentName]
  );

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LicenseRecord.update(id, data),
    onSuccess: () => qc.invalidateQueries(["all-licenses"]),
  });

  const filtered = rolledUpLicenses.filter(l =>
    filter === "all" ? true :
    filter === "open" ? OPEN_STATUSES.includes(l.payment_status) :
    l.payment_status === filter
  );
  const totalRevenue = rolledUpLicenses.filter(l => l.payment_status === "paid").reduce((s, l) => s + (l.annual_fee || 0), 0);
  const totalOutstanding = rolledUpLicenses.filter(l => l.payment_status !== "paid").reduce((s, l) => s + (l.annual_fee || 0), 0);

  const inner = (
    <div>
      {!embedded && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Billing & Licensing</h1>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, sub: "Paid licenses" },
          { label: "Outstanding", value: `$${totalOutstanding.toLocaleString()}`, sub: "Unpaid / invoiced" },
          { label: "Active Licenses", value: licenses.filter(l => l.license_status === "active").length, sub: "Properties licensed" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="text-xl font-light text-[#0D1B2A] mb-1">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className="text-[10px] text-slate-300 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {PAY_STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all capitalize ${filter === s ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {s === "all" ? "All" : s === "open" ? "Open Invoices" : s}
            </button>
          ))}
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-all">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>

      <div ref={printRef} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-100">
              {["Property", "Partner", "License #", "Annual Fee", "Payment", "License Status", "Actions"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center">
                <DollarSign className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">No billing records</p>
              </td></tr>
            ) : filtered.map(l => (
              <tr key={l.id} className="hover:bg-slate-50/50">
                <td className="px-5 py-4 font-medium text-sm text-[#0D1B2A]">{l.property_name}</td>
                <td className="px-5 py-4 text-sm text-slate-600">{l.partner_name}</td>
                <td className="px-5 py-4 text-xs text-slate-500 font-mono">{l.license_number || "—"}</td>
                <td className="px-5 py-4 text-sm font-medium text-[#0D1B2A]">{l.annual_fee ? `$${l.annual_fee.toLocaleString()}` : "—"}</td>
                <td className="px-5 py-4">
                  <select value={l.payment_status} onChange={e => updateMut.mutate({ id: l.id, data: { payment_status: e.target.value, ...(e.target.value === "paid" ? { paid_date: new Date().toISOString().split("T")[0] } : {}) } })}
                    className={`text-xs px-2 py-1 rounded-lg border focus:outline-none capitalize font-medium ${
                      l.payment_status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      l.payment_status === "overdue" ? "bg-red-50 text-red-700 border-red-200" :
                      l.payment_status === "invoiced" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-slate-50 text-slate-600 border-slate-200"
                    }`}>
                    {["unpaid", "invoiced", "paid", "overdue"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-5 py-4">
                  <select value={l.license_status} onChange={e => updateMut.mutate({ id: l.id, data: { license_status: e.target.value, ...(e.target.value === "active" ? { license_start_date: new Date().toISOString().split("T")[0] } : {}) } })}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white focus:outline-none capitalize text-slate-600">
                    {["pending", "active", "expired", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-5 py-4 text-xs text-slate-400">{l.paid_date || "—"}</td>
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