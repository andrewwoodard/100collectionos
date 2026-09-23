import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "../shared/EmptyState";
import { BarChart3, ExternalLink, Loader2 } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PaidByMonthSection({ invoices, loading, billingEmail }) {
  const { chartData, tableData, totalPaid } = useMemo(() => {
    const paid = (invoices || []).filter(inv => inv.status === "paid");
    const now = new Date();
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        fullLabel: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        amount: 0,
        count: 0,
        invoices: [],
      });
    }
    const bucketMap = new Map(buckets.map(b => [b.key, b]));
    for (const inv of paid) {
      if (!inv.created) continue;
      const d = new Date(inv.created * 1000);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const b = bucketMap.get(key);
      if (!b) continue;
      const amt = inv.amount_paid ?? inv.total ?? 0;
      b.amount += amt;
      b.count += 1;
      b.invoices.push(inv);
    }
    const totalPaid = buckets.reduce((s, b) => s + b.amount, 0);
    return { chartData: buckets, tableData: buckets, totalPaid };
  }, [invoices]);

  if (!billingEmail) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No Stripe billing email"
        description="Add a Stripe billing email to this partner to see paid invoice history."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading paid invoices...
      </div>
    );
  }

  if (totalPaid === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No paid invoices"
        description="No paid Stripe invoices in the last 12 months for this partner."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 flex items-center gap-6 text-sm">
        <span className="font-semibold text-green-800 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" /> Paid (Last 12 Months)
        </span>
        <span className="text-gray-600">
          Total received: <strong className="text-green-700">${(totalPaid / 100).toFixed(2)}</strong>
        </span>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="text-xs font-medium text-gray-500 mb-3">Billing received by month</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => [`$${(v / 100).toFixed(2)}`, "Received"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Bar dataKey="amount" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="text-xs">Month</TableHead>
              <TableHead className="text-xs">Invoices</TableHead>
              <TableHead className="text-xs">Total Received</TableHead>
              <TableHead className="text-xs">Invoice #</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...tableData].reverse().map(b => (
              <TableRow key={b.key}>
                <TableCell className="text-sm font-medium">{b.fullLabel}</TableCell>
                <TableCell className="text-sm text-gray-600">{b.count || "—"}</TableCell>
                <TableCell className="text-sm font-semibold text-green-700">
                  {b.amount > 0 ? `$${(b.amount / 100).toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-xs font-mono text-gray-500">
                  {b.invoices.map(i => i.number || i.id?.slice(-8)).join(", ") || "—"}
                </TableCell>
                <TableCell>
                  {b.invoices[0]?.hosted_invoice_url && (
                    <a href={b.invoices[0].hosted_invoice_url} target="_blank" rel="noopener noreferrer" title="View invoice">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}