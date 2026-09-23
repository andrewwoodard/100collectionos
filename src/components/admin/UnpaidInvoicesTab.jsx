import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, Receipt, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export default function UnpaidInvoicesTab() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["stripe-all-invoices"],
    queryFn: async () => {
      const res = await base44.functions.invoke("stripeAllInvoices", {});
      return res.data?.invoices || [];
    },
  });

  // Only currently unpaid (open) invoices
  const open = invoices.filter((inv) => inv.status === "open");

  // Group by partner
  const byPartner = {};
  open.forEach((inv) => {
    const key = inv.partner_id || inv.partner_email || inv.partner_name;
    if (!byPartner[key]) {
      byPartner[key] = {
        partner_name: inv.partner_name || "—",
        partner_email: inv.partner_email || "—",
        customer_id: inv.customer_id,
        open_count: 0,
        total_due: 0,
        last_sent: 0,
        last_invoice: null,
      };
    }
    const p = byPartner[key];
    p.open_count++;
    p.total_due += inv.amount_due || inv.total || 0;
    if ((inv.created || 0) > p.last_sent) {
      p.last_sent = inv.created || 0;
      p.last_invoice = inv;
    }
  });

  const rows = Object.values(byPartner).sort((a, b) => b.total_due - a.total_due);
  const grandTotal = rows.reduce((s, r) => s + r.total_due, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading unpaid invoices…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <Receipt className="w-8 h-8 text-slate-200 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">No partners with unpaid open invoices.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {rows.length} partner{rows.length !== 1 ? "s" : ""} with unpaid invoices
        </p>
        <div className="text-sm">
          <span className="text-slate-400">Total outstanding: </span>
          <span className="font-semibold text-red-600">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-slate-100">
              {["Partner", "Email", "Open Invoices", "Amount Due", "Last Invoice Sent", ""].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.partner_email + r.customer_id} className="hover:bg-slate-50/50">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0D1B2A]/5 flex items-center justify-center text-[#0D1B2A] font-semibold text-xs">
                      {r.partner_name?.[0] || "?"}
                    </div>
                    <span className="font-medium text-sm text-[#0D1B2A]">{r.partner_name}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-slate-500">{r.partner_email}</td>
                <td className="px-5 py-4">
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{r.open_count}</span>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-red-600">
                  ${r.total_due.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-4 text-sm text-slate-600">
                  {r.last_sent ? format(new Date(r.last_sent * 1000), "MMM d, yyyy") : "—"}
                </td>
                <td className="px-5 py-4">
                  {r.last_invoice?.hosted_invoice_url && (
                    <a href={r.last_invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" title="View latest invoice">
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 hover:text-blue-500" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}