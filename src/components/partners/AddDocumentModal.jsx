import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { sb } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Loader2, Upload } from "lucide-react";

const DOC_TYPES = [
  "contract", "addendum", "tax_doc", "onboarding_form", "invoice",
  "brand_guidelines", "photography_release", "miscellaneous", "msa", "nda",
  "vendor_agreement", "receipt", "financial_statement", "marketing_asset",
  "sop", "reference", "hr_doc", "insurance_doc", "crm_export",
];
const STATUSES = ["draft", "sent", "signed", "archived"];
const VISIBILITIES = ["internal", "partner_visible", "public"];

export default function AddDocumentModal({ open, onOpenChange, partnerId, partnerName, onAdded }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("contract");
  const [status, setStatus] = useState("draft");
  const [visibility, setVisibility] = useState("internal");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle(""); setDocType("contract"); setStatus("draft");
    setVisibility("internal"); setNotes(""); setFile(null);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast({ variant: "destructive", title: "Title is required" }); return; }
    if (!file) { toast({ variant: "destructive", title: "Choose a file to attach" }); return; }
    setSaving(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      let uploadedBy = "";
      try { uploadedBy = (await base44.auth.me())?.email || ""; } catch (e) { /* non-fatal */ }
      await sb.create("documents", {
        title: title.trim(),
        file_url,
        doc_type: docType,
        status,
        visibility,
        notes: notes.trim() || undefined,
        partner_id: partnerId,
        partner_name: partnerName,
        uploaded_by: uploadedBy || undefined,
      });
      toast({ title: "Document added", description: title.trim() });
      onAdded?.();
      reset();
      onOpenChange?.(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to add document", description: e?.message || "Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Management Agreement 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VISIBILITIES.map((v) => (
                <SelectItem key={v} value={v} className="capitalize">{v.replace(/_/g, " ")}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">File</Label>
            <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-gray-200 px-3 py-2.5 hover:bg-gray-50">
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600 truncate flex-1">{file ? file.name : "Choose a file"}</span>
              <Input id="doc-file" type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-notes">Notes</Label>
            <Textarea id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional internal notes" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={saving}>Cancel</Button></DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Save document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}