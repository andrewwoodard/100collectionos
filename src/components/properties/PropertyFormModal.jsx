import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MarketSelect from "../shared/MarketSelect";

const TYPES = ["villa", "apartment", "house", "condo", "estate", "cabin", "other"];
const STATUSES = ["draft", "active", "paused", "inactive"];

const defaultData = {
  property_name: "", partner_id: "", partner_name: "", market: "", address: "",
  property_type: "villa", bedrooms: "", bathrooms: "", half_bathrooms: "", sleeps: "", status: "draft",
  listing_url: "", internal_notes: "", launch_date: "",
};

export default function PropertyFormModal({ open, onOpenChange, property, partners = [], onSave, presetPartnerId }) {
  const [form, setForm] = useState(defaultData);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(property ? { ...defaultData, ...property } : { ...defaultData, partner_id: presetPartnerId || "" });
  }, [property, open]);

  const handleSave = async () => {
    setSaving(true);
    const selectedPartner = partners.find(p => p.id === form.partner_id);
    await onSave({
      ...form,
      partner_name: selectedPartner?.partner_name || form.partner_name,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      half_bathrooms: form.half_bathrooms ? Number(form.half_bathrooms) : undefined,
      sleeps: form.sleeps ? Number(form.sleeps) : undefined,
    });
    setSaving(false);
    onOpenChange(false);
  };

  const update = (field, val) => setForm(f => ({ ...f, [field]: val }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{property ? "Edit Property" : "Add Property"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Property Name *</Label>
            <Input value={form.property_name} onChange={e => update("property_name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Partner</Label>
            <Select value={form.partner_id || ""} onValueChange={v => update("partner_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Market</Label><MarketSelect value={form.market} onChange={v => update("market", v)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
            <div>
              <Label className="text-xs">Property Type</Label>
              <Select value={form.property_type} onValueChange={v => update("property_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Address</Label><Input value={form.address} onChange={e => update("address", e.target.value)} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><Label className="text-xs">Bedrooms</Label><Input type="number" value={form.bedrooms} onChange={e => update("bedrooms", e.target.value)} /></div>
            <div><Label className="text-xs">Bathrooms</Label><Input type="number" value={form.bathrooms} onChange={e => update("bathrooms", e.target.value)} /></div>
            <div><Label className="text-xs">Half Baths</Label><Input type="number" value={form.half_bathrooms} onChange={e => update("half_bathrooms", e.target.value)} /></div>
            <div><Label className="text-xs">Sleeps</Label><Input type="number" value={form.sleeps} onChange={e => update("sleeps", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Launch Date</Label><Input type="date" value={form.launch_date} onChange={e => update("launch_date", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Listing URL</Label><Input value={form.listing_url} onChange={e => update("listing_url", e.target.value)} /></div>
          <div><Label className="text-xs">Internal Notes</Label><Textarea value={form.internal_notes} onChange={e => update("internal_notes", e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.property_name || saving} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            {saving ? "Saving..." : (property ? "Update" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}