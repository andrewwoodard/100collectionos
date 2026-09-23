import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { Upload } from "lucide-react";

const DOC_TYPES = ["contract", "addendum", "tax_doc", "onboarding_form", "invoice", "brand_guidelines", "photography_release", "miscellaneous"];
const STATUSES = ["draft", "sent", "signed", "archived"];

export default function DocumentFormModal({ open, onOpenChange, partners = [], properties = [], folders = [], defaultFolderId = null, onSave }) {
  const [form, setForm] = useState({ title: "", doc_type: "contract", status: "draft", partner_id: "", property_id: "", folder_id: "", expiration_date: "", notes: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleSave = async () => {
    setSaving(true);
    let file_url = "";
    if (file) {
      const res = await base44.integrations.Core.UploadFile({ file });
      file_url = res.file_url;
    }
    const partner = partners.find(p => p.id === form.partner_id);
    const property = properties.find(p => p.id === form.property_id);
    await onSave({
      ...form,
      file_url,
      folder_id: form.folder_id || defaultFolderId || null,
      partner_name: partner?.partner_name || "",
      property_name: property?.property_name || "",
    });
    setForm({ title: "", doc_type: "contract", status: "draft", partner_id: "", property_id: "", folder_id: "", expiration_date: "", notes: "" });
    setFile(null);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Title *</Label><Input value={form.title} onChange={e => update("title", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.doc_type} onValueChange={v => update("doc_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Partner</Label>
            <Select value={form.partner_id} onValueChange={v => update("partner_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Property</Label>
            <Select value={form.property_id} onValueChange={v => update("property_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
              <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}</SelectContent>
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
          <div><Label className="text-xs">Expiration Date</Label><Input type="date" value={form.expiration_date} onChange={e => update("expiration_date", e.target.value)} /></div>
          <div>
            <Label className="text-xs">File</Label>
            <div className="mt-1 border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-[#C9A96E] transition-colors">
              <input type="file" onChange={e => setFile(e.target.files[0])} className="hidden" id="doc-upload" />
              <label htmlFor="doc-upload" className="cursor-pointer">
                <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-500">{file ? file.name : "Click to upload"}</p>
              </label>
            </div>
          </div>
          <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.title || saving} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            {saving ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}