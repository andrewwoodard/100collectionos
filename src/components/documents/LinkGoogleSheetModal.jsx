import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { Sheet, Loader2, AlertCircle } from "lucide-react";

function extractSheetId(urlOrId) {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId.trim();
}

export default function LinkGoogleSheetModal({ open, onOpenChange, partners = [], properties = [], folders = [], defaultFolderId, onSave }) {
  const [url, setUrl] = useState("");
  const [form, setForm] = useState({ title: "", partner_id: "", property_id: "", folder_id: "", status: "draft" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState(null);
  const [selectedTab, setSelectedTab] = useState("");

  const update = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleFetch = async () => {
    setError(""); setMetadata(null);
    const id = extractSheetId(url);
    if (!id) { setError("Invalid Google Sheets URL or ID"); return; }
    setLoading(true);
    const res = await base44.functions.invoke("googleSheetsProxy", { action: "getMetadata", spreadsheetId: id });
    setLoading(false);
    if (res.data.error) { setError(res.data.error); return; }
    const meta = res.data.metadata;
    setMetadata(meta);
    setForm(f => ({ ...f, title: f.title || meta.properties?.title || "" }));
    setSelectedTab(meta.sheets?.[0]?.properties?.title || "Sheet1");
  };

  const handleSave = async () => {
    const id = extractSheetId(url);
    const partner = partners.find(p => p.id === form.partner_id);
    const property = properties.find(p => p.id === form.property_id);
    await onSave({
      ...form,
      doc_type: "google_sheet",
      google_sheet_id: id,
      google_sheet_url: `https://docs.google.com/spreadsheets/d/${id}`,
      google_sheet_tab: selectedTab,
      folder_id: form.folder_id || defaultFolderId || null,
      partner_name: partner?.partner_name || "",
      property_name: property?.property_name || "",
      file_url: `https://docs.google.com/spreadsheets/d/${id}`,
    });
    setUrl(""); setForm({ title: "", partner_id: "", property_id: "", folder_id: "", status: "draft" });
    setMetadata(null); setError("");
    onOpenChange(false);
  };

  const sheets = metadata?.sheets?.map(s => s.properties?.title) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sheet className="w-5 h-5 text-green-600" /> Link Google Sheet
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Google Sheets URL or ID *</Label>
            <div className="flex gap-2 mt-1">
              <Input value={url} onChange={e => { setUrl(e.target.value); setMetadata(null); }} placeholder="Paste Google Sheets URL..." />
              <Button onClick={handleFetch} disabled={!url.trim() || loading} variant="outline" className="flex-shrink-0">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
              </Button>
            </div>
            {error && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{error}</p>}
          </div>

          {metadata && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                ✓ Connected: <strong>{metadata.properties?.title}</strong>
              </div>
              <div><Label className="text-xs">Title *</Label><Input value={form.title} onChange={e => update("title", e.target.value)} /></div>
              {sheets.length > 1 && (
                <div>
                  <Label className="text-xs">Default Tab</Label>
                  <Select value={selectedTab} onValueChange={setSelectedTab}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{sheets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">Partner</Label>
                <Select value={form.partner_id} onValueChange={v => update("partner_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {folders.length > 0 && (
                <div>
                  <Label className="text-xs">Folder</Label>
                  <Select value={form.folder_id || defaultFolderId || ""} onValueChange={v => update("folder_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select folder (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>No folder</SelectItem>
                      {folders.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!metadata || !form.title} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">Link Sheet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}