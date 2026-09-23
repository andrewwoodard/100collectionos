import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Download, Loader2, RefreshCw, Sheet } from "lucide-react";

export default function SheetViewerModal({ open, onOpenChange, document: doc }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(doc?.google_sheet_tab || "Sheet1");
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    if (open && doc?.google_sheet_id) {
      loadMetadata();
      loadData(doc.google_sheet_tab || "Sheet1");
    }
  }, [open, doc]);

  const loadMetadata = async () => {
    const res = await base44.functions.invoke("googleSheetsProxy", { action: "getMetadata", spreadsheetId: doc.google_sheet_id });
    if (res.data.metadata) setMetadata(res.data.metadata);
  };

  const loadData = async (tab) => {
    setLoading(true); setError("");
    const res = await base44.functions.invoke("googleSheetsProxy", { action: "getSheetData", spreadsheetId: doc.google_sheet_id, sheetName: tab });
    setLoading(false);
    if (res.data.error) { setError(res.data.error); return; }
    setData(res.data.values || []);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    loadData(tab);
  };

  const sheets = metadata?.sheets?.map(s => s.properties?.title) || [activeTab];
  const headers = data?.[0] || [];
  const rows = data?.slice(1) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sheet className="w-5 h-5 text-green-600" />
              {doc?.title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => loadData(activeTab)}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={doc?.google_sheet_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Sheets
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`https://docs.google.com/spreadsheets/d/${doc?.google_sheet_id}/export?format=xlsx`} download>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                </a>
              </Button>
            </div>
          </div>

          {/* Tab bar */}
          {sheets.length > 1 && (
            <div className="flex gap-1 mt-3 overflow-x-auto">
              {sheets.map(s => (
                <button
                  key={s}
                  onClick={() => handleTabChange(s)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors whitespace-nowrap
                    ${activeTab === s ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading sheet data...
            </div>
          )}
          {error && <p className="text-sm text-red-500 text-center py-8">{error}</p>}
          {!loading && !error && data && (
            <div className="overflow-auto rounded-lg border border-gray-100">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="w-8 px-2 py-2 text-center text-gray-400 border-r border-gray-100 font-normal sticky left-0 bg-gray-50">#</th>
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-semibold text-gray-700 border-r border-b border-gray-100 whitespace-nowrap min-w-24">{h || ""}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-gray-50 transition-colors">
                      <td className="px-2 py-1.5 text-center text-gray-300 border-r border-gray-100 sticky left-0 bg-white">{ri + 1}</td>
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-3 py-1.5 border-r border-b border-gray-50 text-gray-700 whitespace-nowrap max-w-48 truncate">
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={headers.length + 1} className="text-center py-8 text-gray-400">No data in this sheet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}