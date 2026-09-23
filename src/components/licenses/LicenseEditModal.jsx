import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LicenseEditModal({ license, onClose, onSave }) {
  const [form, setForm] = useState({
    license_number: license.license_number || "",
    payment_status: license.payment_status || "unpaid",
    invoice_date: license.invoice_date || "",
    paid_date: license.paid_date || "",
    annual_fee: license.annual_fee ?? "",
    license_start_date: license.license_start_date || "",
    license_end_date: license.license_end_date || "",
    notes: license.notes || "",
  });

  const handleSave = () => {
    onSave(license.id, {
      ...form,
      annual_fee: form.annual_fee !== "" ? Number(form.annual_fee) : undefined,
    });
  };

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit License — {license.property_name}</DialogTitle>
          <p className="text-sm text-gray-500">{license.partner_name}</p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">License Number</Label>
            <Input value={form.license_number} onChange={e => set("license_number", e.target.value)} placeholder="LIC-2024-001" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Annual Fee ($)</Label>
            <Input type="number" value={form.annual_fee} onChange={e => set("annual_fee", e.target.value)} placeholder="e.g. 1500" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Payment Status</Label>
            <Select value={form.payment_status} onValueChange={v => set("payment_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Invoice Date</Label>
            <Input type="date" value={form.invoice_date} onChange={e => set("invoice_date", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Paid Date</Label>
            <Input type="date" value={form.paid_date} onChange={e => set("paid_date", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">License Start</Label>
            <Input type="date" value={form.license_start_date} onChange={e => set("license_start_date", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">License End</Label>
            <Input type="date" value={form.license_end_date} onChange={e => set("license_end_date", e.target.value)} />
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any invoice references, notes…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="bg-[#0D1B2A] text-white hover:bg-[#1a2f47]">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}