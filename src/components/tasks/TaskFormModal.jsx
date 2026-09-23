import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRIORITIES = ["low", "medium", "high", "urgent"];
const STATUSES = ["not_started", "in_progress", "blocked", "complete"];
const TYPES = ["onboarding", "document", "billing", "media", "operations", "general"];

export default function TaskFormModal({ open, onOpenChange, partners = [], properties = [], onSave, task }) {
  const [form, setForm] = useState(task || {
    title: "", description: "", partner_id: "", property_id: "",
    assigned_to: "", due_date: "", priority: "medium", status: "not_started", task_type: "general",
  });
  const [saving, setSaving] = useState(false);

  const update = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleSave = async () => {
    setSaving(true);
    const partner = partners.find(p => p.id === form.partner_id);
    const property = properties.find(p => p.id === form.property_id);
    await onSave({ ...form, partner_name: partner?.partner_name || "", property_name: property?.property_name || "" });
    setForm({ title: "", description: "", partner_id: "", property_id: "", assigned_to: "", due_date: "", priority: "medium", status: "not_started", task_type: "general" });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Title *</Label><Input value={form.title} onChange={e => update("title", e.target.value)} /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => update("description", e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={v => update("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.task_type} onValueChange={v => update("task_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
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
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Assigned To</Label><Input value={form.assigned_to} onChange={e => update("assigned_to", e.target.value)} /></div>
            <div><Label className="text-xs">Due Date</Label><Input type="date" value={form.due_date} onChange={e => update("due_date", e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.title || saving} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            {saving ? "Saving..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}