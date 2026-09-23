import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["setup_fee", "monthly", "commission", "photography", "marketing", "other"];
const STATUSES = ["draft", "sent", "paid", "overdue", "void"];

export default function BillingFormModal({ open, onOpenChange, partners = [], onSave }) {
  const [form, setForm] = useState({
    partner_id: "", invoice_number: "", billing_type: "monthly", amount: "",
    invoice_date: "", due_date: "", status: "draft", billing_contact: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const update = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleSave = async () => {
    setSaving(true);
    const partner = partners.find(p => p.id === form.partner_id);
    await onSave({ ...form, partner_name: partner?.partner_name || "", amount: Number(form.amount) || 0 });
    setForm({ partner_id: "", invoice_number: "", billing_type: "monthly", amount: "", invoice_date: "", due_date: "", status: "draft", billing_contact: "", notes: "" });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Partner *</Label>
            <Select value={form.partner_id} onValueChange={v => update("partner_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Invoice #</Label><Input value={form.invoice_number} onChange={e => update("invoice_number", e.target.value)} /></div>
            <div><Label className="text-xs">Amount</Label><Input type="number" value={form.amount} onChange={e => update("amount", e.target.value)} placeholder="0.00" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.billing_type} onValueChange={v => update("billing_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent>
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
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Invoice Date</Label><Input type="date" value={form.invoice_date} onChange={e => update("invoice_date", e.target.value)} /></div>
            <div><Label className="text-xs">Due Date</Label><Input type="date" value={form.due_date} onChange={e => update("due_date", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Billing Contact</Label><Input value={form.billing_contact} onChange={e => update("billing_contact", e.target.value)} /></div>
          <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.partner_id || saving} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            {saving ? "Saving..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}