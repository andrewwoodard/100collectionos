import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Link as LinkIcon, X } from "lucide-react";

function exportCSV(rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "finance_alerts.csv"; a.click();
  URL.revokeObjectURL(url);
}

const FLAG_COLORS = {
  "Not Invoiced": "bg-red-50 text-red-700 border-red-200",
  "Invoiced – Not in Stripe": "bg-amber-50 text-amber-700 border-amber-200",
  "Stripe – Not Invoiced": "bg-blue-50 text-blue-700 border-blue-200",
  "OK": "bg-green-50 text-green-600 border-green-200",
};

export default function FinanceAlerts() {
  const [sheetId, setSheetId] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [sheetTab, setSheetTab] = useState("Sheet1");
  const [sheetNameCol, setSheetNameCol] = useState("0");
  const [sheetStatusCol, setSheetStatusCol] = useState("1");
  const [sheetRows, setSheetRows] = useState(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const { data: partners = [], isLoading, refetch } = useQuery({
    queryKey: ["financePartners"],
    queryFn: () => base44.entities.PartnerOnboarding.filter({}, "partner_name", 1000),
  });

  const handleLoadSheet = async () => {
    setSheetError("");
    setLoadingSheet(true);
    // Extract spreadsheet ID from URL or raw ID
    const match = sheetInput.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const id = match ? match[1] : sheetInput.trim();
    if (!id) { setSheetError("Please enter a valid Google Sheet URL or ID."); setLoadingSheet(false); return; }
    const res = await base44.functions.invoke("googleSheetsProxy", { action: "getSheetData", spreadsheetId: id, sheetName: sheetTab });
    if (res.data?.error) { setSheetError(res.data.error); setLoadingSheet(false); return; }
    setSheetId(id);
    setSheetRows(res.data?.values || []);
    setLoadingSheet(false);
  };

  const stripeMap = useMemo(() => {
    if (!sheetRows || sheetRows.length < 2) return {};
    const nameIdx = parseInt(sheetNameCol, 10);
    const statusIdx = parseInt(sheetStatusCol, 10);
    const map = {};
    sheetRows.slice(1).forEach(row => {
      const name = row[nameIdx]?.toString().trim().toLowerCase();
      const status = row[statusIdx]?.toString().trim();
      if (name) map[name] = status;
    });
    return map;
  }, [sheetRows, sheetNameCol, sheetStatusCol]);

  const sheetHeaders = sheetRows?.[0] || [];

  const alerts = useMemo(() => {
    return partners.map(p => {
      const invoiced = p.licensing_fees_invoiced;
      const name = p.partner_name?.toLowerCase().trim();
      const stripeStatus = stripeMap[name];
      const hasStripeData = Object.keys(stripeMap).length > 0;

      let flag = "OK";
      let detail = "";

      if (!invoiced || invoiced === "No" || invoiced === "-") {
        flag = "Not Invoiced";
        detail = "Licensing fees have not been invoiced yet.";
      } else if (hasStripeData && !stripeStatus) {
        flag = "Invoiced – Not in Stripe";
        detail = "Marked invoiced in system but not found in Stripe/bank sheet.";
      } else if (hasStripeData && stripeStatus && (invoiced === "No" || !invoiced)) {
        flag = "Stripe – Not Invoiced";
        detail = `Found in Stripe (${stripeStatus}) but not marked invoiced internally.`;
      } else if (invoiced === "Yes" || invoiced === "Paid") {
        flag = "OK";
        detail = stripeStatus ? `Stripe: ${stripeStatus}` : "Invoiced internally.";
      } else {
        flag = "OK";
        detail = invoiced;
      }

      return {
        id: p.id,
        partner_name: p.partner_name,
        licensing_fee_deal: p.licensing_fee_deal || "—",
        licensing_fees_invoiced: invoiced || "—",
        stripe_status: stripeStatus || (hasStripeData ? "Not Found" : "—"),
        flag,
        detail,
      };
    });
  }, [partners, stripeMap]);

  const filtered = useMemo(() => {
    if (statusFilter === "All") return alerts;
    if (statusFilter === "Issues") return alerts.filter(a => a.flag !== "OK");
    return alerts.filter(a => a.flag === statusFilter);
  }, [alerts, statusFilter]);

  const issueCount = alerts.filter(a => a.flag !== "OK").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Finance Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Compare licensing fee invoicing against Stripe / bank records</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm px-3 py-2 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => exportCSV(filtered)} className="flex items-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Alert summary */}
      {issueCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">{issueCount} partner{issueCount !== 1 ? "s" : ""} flagged with potential fee discrepancies.</p>
        </div>
      )}
      {issueCount === 0 && !isLoading && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-800 font-medium">All partners look good — no discrepancies detected.</p>
        </div>
      )}

      {/* Google Sheet Connector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <LinkIcon className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Connect Stripe / Bank Google Sheet (optional)</h3>
        </div>
        <p className="text-xs text-gray-400">Paste a Google Sheet URL or ID containing partner names and Stripe/payment status to detect discrepancies.</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={sheetInput}
            onChange={e => setSheetInput(e.target.value)}
            placeholder="Google Sheet URL or ID"
            className="flex-1 min-w-[260px] border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A96E]"
          />
          <input
            type="text"
            value={sheetTab}
            onChange={e => setSheetTab(e.target.value)}
            placeholder="Tab name (e.g. Sheet1)"
            className="w-36 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A96E]"
          />
          <button onClick={handleLoadSheet} disabled={loadingSheet} className="flex items-center gap-2 bg-[#C9A96E] hover:bg-[#A68B4B] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-colors">
            {loadingSheet ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Load Sheet"}
          </button>
          {sheetId && (
            <button onClick={() => { setSheetId(""); setSheetRows(null); setSheetInput(""); }} className="p-2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {sheetError && <p className="text-xs text-red-500">{sheetError}</p>}
        {sheetRows && (
          <div className="flex flex-wrap gap-4 pt-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Partner Name Column</label>
              <select value={sheetNameCol} onChange={e => setSheetNameCol(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs outline-none">
                {(sheetHeaders.length ? sheetHeaders : ["Col A", "Col B", "Col C", "Col D"]).map((h, i) => (
                  <option key={i} value={i}>{h || `Col ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Stripe Status Column</label>
              <select value={sheetStatusCol} onChange={e => setSheetStatusCol(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs outline-none">
                {(sheetHeaders.length ? sheetHeaders : ["Col A", "Col B", "Col C", "Col D"]).map((h, i) => (
                  <option key={i} value={i}>{h || `Col ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-green-600 self-center">✓ Sheet loaded — {sheetRows.length - 1} rows</p>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {["All", "Issues", "Not Invoiced", "Invoiced – Not in Stripe", "Stripe – Not Invoiced", "OK"].map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${statusFilter === f ? "bg-[#0F172A] text-white border-[#0F172A]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
          >
            {f}
            {f === "Issues" && issueCount > 0 && <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{issueCount}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-7 h-7 border-4 border-slate-200 border-t-[#C9A96E] rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Partner", "Fee Deal", "Invoiced (Internal)", "Stripe Status", "Flag", "Detail"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No records match the current filter.</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.partner_name}</td>
                  <td className="px-4 py-3 text-gray-600">{row.licensing_fee_deal}</td>
                  <td className="px-4 py-3 text-gray-600">{row.licensing_fees_invoiced}</td>
                  <td className="px-4 py-3 text-gray-600">{row.stripe_status}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${FLAG_COLORS[row.flag] || "bg-gray-50 text-gray-500 border-gray-200"}`}>
                      {row.flag}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}