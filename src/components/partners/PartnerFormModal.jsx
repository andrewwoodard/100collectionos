import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import MarketSelect from "../shared/MarketSelect";

const STATUSES = ["lead", "vetting", "approved", "onboarding", "live", "live_non_renewed", "paused", "inactive"];
const PARTNER_TYPES = ["property_manager", "owner", "developer", "hospitality_group", "other"];
const CONTRACT_STATUSES = ["none", "draft", "sent", "signed", "expired"];
const ONBOARDING_STAGES = ["approved", "agreement_sent", "agreement_signed", "billing_setup", "asset_collection", "property_info_received", "photography_received", "listing_build", "qa_review", "live"];
const BILLING_STATUSES = ["not_setup", "active", "overdue", "paused"];

const defaultData = {
  partner_name: "", company_name: "", primary_contact_name: "", primary_contact_email: "",
  primary_contact_phone: "", market: "", region: "", partner_type: "owner",
  status: "lead", contract_status: "none", assigned_internal_owner: "",
  start_date: "", renewal_date: "", go_live_date: "", notes: "", parent_partner_id: "", member_since: "",
  onboarding_stage: "approved", billing_status: "not_setup", automated_billing: false, tags: [],
};

export default function PartnerFormModal({ open, onOpenChange, partner, onSave }) {
  const [form, setForm] = useState(defaultData);
  const [saving, setSaving] = useState(false);

  // Fetch all partners to compute eligible parents for the parent dropdown
  const { data: allPartners = [] } = useQuery({
    queryKey: ["all-partners-parent-picker"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
    enabled: open,
  });

  // Eligible parents: top-level partners (no parent_partner_id), excluding
  // the current partner and any partners that are children of the current
  // partner (cycle prevention). Also, if the current partner already has
  // children, it cannot have a parent set (two-level max).
  const currentPartnerId = partner?.id;
  const currentHasChildren = useMemo(
    () => !!currentPartnerId && allPartners.some(p => p.parent_partner_id && p.parent_partner_id === currentPartnerId),
    [allPartners, currentPartnerId]
  );
  const currentChildrenCount = useMemo(
    () => currentPartnerId ? allPartners.filter(p => p.parent_partner_id === currentPartnerId).length : 0,
    [allPartners, currentPartnerId]
  );

  // Eligible parents = top-level partners (no parent of their own), excluding the
  // current partner. A top-level partner that already has sub-brands is still a
  // valid parent — the two-level rule only forbids giving a *child* its own
  // children, which can't happen here because candidates must be top-level.
  const eligibleParents = useMemo(() => {
    return allPartners.filter(p =>
      !p.parent_partner_id &&
      p.id !== currentPartnerId
    );
  }, [allPartners, currentPartnerId]);

  useEffect(() => {
    if (partner) {
      setForm({ ...defaultData, ...partner, tags: Array.isArray(partner.tags) ? partner.tags : [] });
    } else {
      setForm(defaultData);
    }
  }, [partner, open]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onOpenChange(false);
  };

  const update = (field, val) => setForm(f => ({ ...f, [field]: val }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{partner ? "Edit Partner" : "Add Partner"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Partner Name *</Label>
              <Input value={form.partner_name} onChange={e => update("partner_name", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Company Name</Label>
              <Input value={form.company_name} onChange={e => update("company_name", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact Name</Label>
              <Input value={form.primary_contact_name} onChange={e => update("primary_contact_name", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Contact Email</Label>
              <Input value={form.primary_contact_email} onChange={e => update("primary_contact_email", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.primary_contact_phone} onChange={e => update("primary_contact_phone", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Market</Label>
              <MarketSelect value={form.market} onChange={v => update("market", v)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Region</Label>
              <Input value={form.region} onChange={e => update("region", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Partner Type</Label>
              <Select value={form.partner_type} onValueChange={v => update("partner_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTNER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Contract Status</Label>
              <Select value={form.contract_status} onValueChange={v => update("contract_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Onboarding Stage</Label>
              <Select value={form.onboarding_stage} onValueChange={v => update("onboarding_stage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ONBOARDING_STAGES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Billing Status</Label>
              <Select value={form.billing_status} onValueChange={v => update("billing_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Assigned Owner</Label>
            <Input value={form.assigned_internal_owner} onChange={e => update("assigned_internal_owner", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => update("start_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Go Live Date</Label>
              <Input type="date" value={form.go_live_date || ""} onChange={e => update("go_live_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Renewal Date</Label>
              <Input type="date" value={form.renewal_date || ""} onChange={e => update("renewal_date", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={Array.isArray(form.tags) ? form.tags.join(", ") : ""}
              onChange={e => update("tags", e.target.value ? e.target.value.split(",").map(t => t.trim()).filter(Boolean) : [])}
              placeholder="e.g. VIP, Early Adopter, Enterprise"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="automated_billing"
              checked={!!form.automated_billing}
              onChange={e => update("automated_billing", e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="automated_billing" className="text-xs">Automated Billing (Stripe auto-charges for license renewals)</Label>
          </div>
          <div>
            <Label className="text-xs">Partner Since (real join date)</Label>
            <Input type="date" value={form.member_since || ""} onChange={e => update("member_since", e.target.value)} />
            <p className="text-[10px] text-gray-400 mt-1">The actual date they joined The 100 Collection, if known. Leave blank if you're not sure — the portal won't display anything until this is filled.</p>
          </div>
          <div>
            <Label className="text-xs">Parent Partner</Label>
            <Select
              value={form.parent_partner_id || "none"}
              onValueChange={v => update("parent_partner_id", v === "none" ? "" : v)}
              disabled={currentHasChildren}
            >
              <SelectTrigger><SelectValue placeholder="None (top-level partner)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top-level partner)</SelectItem>
                {eligibleParents.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentHasChildren ? (
              <p className="text-[10px] text-amber-600 mt-1">This partner has {currentChildrenCount} sub-brand(s). Unlink them first to convert this partner into a sub-brand.</p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-1">Set a parent PMC to make this partner a sub-brand. Its properties will roll up into the parent's portal.</p>
            )}
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.partner_name || saving} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            {saving ? "Saving..." : (partner ? "Update" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}