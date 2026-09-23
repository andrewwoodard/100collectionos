import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, ArrowLeftRight, Plus, Loader2, FileText, Wand2, Pencil, Save, X, LayoutList, Tag, DollarSign, Receipt, AlertCircle, MoreHorizontal, CreditCard, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import LicenseEditModal from "@/components/licenses/LicenseEditModal";

const LICENSE_STATUS_CONFIG = {
  active:            { label: "Active",            cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending:           { label: "Pending",           cls: "bg-slate-100 text-slate-600 border-slate-200" },
  expired:           { label: "Expired",           cls: "bg-red-50 text-red-700 border-red-200" },
  cancelled:         { label: "Cancelled",         cls: "bg-gray-100 text-gray-500 border-gray-200" },
  pending_transfer:  { label: "Pending Transfer",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

const NEXT_STATUSES = {
  pending:          ["active", "cancelled"],
  active:           ["pending_transfer", "cancelled"],
  pending_transfer: ["active", "cancelled"],
  expired:          ["active"],
  cancelled:        ["active"],
};

const inputCls = "w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white";

function EditableRow({ l, onChange, draft, onSave, onCancel, isBulk, properties }) {
  return (
    <tr className="bg-[#C9A96E]/5">
      <td className="px-5 py-2">
        <select
          value={draft.property_id || ""}
          onChange={e => {
            const prop = properties?.find(p => p.id === e.target.value);
            onChange("property_id", e.target.value);
            onChange("property_name", prop?.property_name || "");
          }}
          className={inputCls}
        >
          <option value="">Select property…</option>
          {(properties || []).map(p => (
            <option key={p.id} value={p.id}>{p.property_name}</option>
          ))}
        </select>
      </td>
      <td className="px-5 py-2">
        <input value={draft.license_number} onChange={e => onChange("license_number", e.target.value)} placeholder="LIC-2024-001" className={inputCls} />
      </td>
      <td className="px-5 py-2">
        <select value={draft.license_status} onChange={e => onChange("license_status", e.target.value)} className={inputCls}>
          {Object.entries(LICENSE_STATUS_CONFIG).map(([val, { label }]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </td>
      <td className="px-5 py-2">
        <div className="space-y-1">
          <input type="number" value={draft.annual_fee} onChange={e => onChange("annual_fee", e.target.value)} placeholder="495" className={inputCls} />
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={!!draft.is_deal} onChange={e => onChange("is_deal", e.target.checked)} className="rounded" />
            Special deal
          </label>
          {draft.is_deal && (
            <input value={draft.deal_notes || ""} onChange={e => onChange("deal_notes", e.target.value)} placeholder="e.g. $0 launch promo" className={inputCls} />
          )}
        </div>
      </td>
      <td className="px-5 py-2">
        <input type="date" value={draft.license_start_date} onChange={e => onChange("license_start_date", e.target.value)} className={inputCls} />
      </td>
      <td className="px-5 py-2">
        <input type="date" value={draft.license_end_date} onChange={e => onChange("license_end_date", e.target.value)} className={inputCls} />
      </td>
      <td className="px-5 py-2">
        {isBulk ? (
          <span className="text-xs text-gray-400 italic">editing</span>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={onSave} title="Save" className="p-1 rounded hover:bg-emerald-50 text-emerald-600 transition-colors">
              <Save className="w-4 h-4" />
            </button>
            <button onClick={onCancel} title="Cancel" className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function LicensesTab({ partner, properties, partnerId, stripeData }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(new Set());
  const [attributing, setAttributing] = useState({}); // creditIndex -> propertyId being selected
  const [editingLicense, setEditingLicense] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLicense, setNewLicense] = useState({ property_id: "", license_number: "", annual_fee: "", license_start_date: "", license_end_date: "" });
  const [creating, setCreating] = useState(false);
  const [autoPopulating, setAutoPopulating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { data: licenses = [], isLoading } = useQuery({
    queryKey: ["partner-licenses", partnerId],
    queryFn: () => base44.entities.LicenseRecord.filter({ partner_id: partnerId }),
    enabled: !!partnerId,
  });

  // Initialise bulk drafts whenever we enter bulk mode
  useEffect(() => {
    if (bulkMode) {
      const drafts = {};
      licenses.forEach(l => {
        drafts[l.id] = {
          property_id: l.property_id || "",
          property_name: l.property_name || "",
          license_number: l.license_number || "",
          license_status: l.license_status || "pending",
          annual_fee: l.annual_fee ?? "",
          is_deal: l.is_deal || false,
          deal_notes: l.deal_notes || "",
          license_start_date: l.license_start_date || "",
          license_end_date: l.license_end_date || "",
        };
      });
      setBulkDrafts(drafts);
    }
  }, [bulkMode, licenses]);

  const updateBulkField = (id, field, value) => {
    setBulkDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveAll = async () => {
    setBulkSaving(true);
    await Promise.all(
      licenses.map(l => {
        const d = bulkDrafts[l.id];
        if (!d) return Promise.resolve();
        return base44.entities.LicenseRecord.update(l.id, {
          ...d,
          annual_fee: d.annual_fee !== "" ? Number(d.annual_fee) : undefined,
        });
      })
    );
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setBulkSaving(false);
    setBulkMode(false);
  };

  const cancelBulk = () => {
    setBulkMode(false);
    setBulkDrafts({});
  };

  const saveEdit = async (license, draft) => {
    setSaving(prev => new Set(prev).add(license.id));
    await base44.entities.LicenseRecord.update(license.id, {
      ...draft,
      property_id: draft.property_id || undefined,
      annual_fee: draft.annual_fee !== "" ? Number(draft.annual_fee) : undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setSaving(prev => { const n = new Set(prev); n.delete(license.id); return n; });
    setEditingId(null);
    setEditDraft(null);
  };

  const startEdit = (l) => {
    setEditingId(l.id);
    setEditDraft({
      property_id: l.property_id || "",
      property_name: l.property_name || "",
      license_number: l.license_number || "",
      license_status: l.license_status || "pending",
      annual_fee: l.annual_fee ?? "",
      is_deal: l.is_deal || false,
      deal_notes: l.deal_notes || "",
      license_start_date: l.license_start_date || "",
      license_end_date: l.license_end_date || "",
    });
  };

  const updateStatus = async (license, newStatus) => {
    setSaving(prev => new Set(prev).add(license.id));
    await base44.entities.LicenseRecord.update(license.id, { license_status: newStatus });
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setSaving(prev => { const n = new Set(prev); n.delete(license.id); return n; });
  };

  const updatePaymentStatus = async (license, newStatus) => {
    setSaving(prev => new Set(prev).add(license.id));
    const updates = { payment_status: newStatus };
    if (newStatus === "paid" && !license.paid_date) {
      updates.paid_date = new Date().toISOString().split("T")[0];
    }
    await base44.entities.LicenseRecord.update(license.id, updates);
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setSaving(prev => { const n = new Set(prev); n.delete(license.id); return n; });
  };

  const saveLicenseEdit = async (id, data) => {
    await base44.entities.LicenseRecord.update(id, data);
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setEditingLicense(null);
  };

  const deleteLicense = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      await base44.entities.LicenseRecord.delete(pendingDelete.id);
      toast({ title: "License deleted", description: `${pendingDelete.license_number || pendingDelete.property_name || "License"} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Could not delete license";
      toast({ title: "Could not delete license", description: msg, variant: "destructive" });
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  };

  const createLicense = async () => {
    if (!newLicense.property_id) return;
    setCreating(true);
    const prop = properties.find(p => p.id === newLicense.property_id);
    await base44.entities.LicenseRecord.create({
      ...newLicense,
      annual_fee: newLicense.annual_fee ? Number(newLicense.annual_fee) : undefined,
      partner_id: partnerId,
      partner_name: partner.partner_name,
      property_name: prop?.property_name || "",
      submission_id: prop?.id || "",
      license_status: "pending",
      payment_status: "unpaid",
    });
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setNewLicense({ property_id: "", license_number: "", annual_fee: "", license_start_date: "", license_end_date: "" });
    setShowCreateForm(false);
    setCreating(false);
  };

  const tsToDate = (ts) => ts ? new Date(ts * 1000).toISOString().split("T")[0] : undefined;

  // Compute per-invoice index for a slot based on its position in credit_slots
  const getLicenseNumberForSlot = (slot) => {
    if (!slot?.invoice_number) return undefined;
    const allSlots = stripeData?.credit_slots || [];
    const sameInvoice = allSlots.filter(s => s.invoice_id === slot.invoice_id);
    const idx = sameInvoice.indexOf(slot);
    return `${slot.invoice_number}-${idx + 1}`;
  };

  const attributeCredit = async (propertyId, slot) => {
    const prop = properties.find(p => p.id === propertyId);
    if (!prop) return;
    const existing = licenses.find(l => l.property_id === propertyId || l.property_name === prop.property_name);
    const today = new Date().toISOString().split("T")[0];
    const licenseStart = slot ? tsToDate(slot.period_start) : today;
    const licenseEnd = slot ? tsToDate(slot.period_end) : undefined;
    const licenseNumber = getLicenseNumberForSlot(slot);
    const annualFee = slot?.unit_price ?? undefined;
    const invoiceDate = slot?.invoice_date || undefined;
    const paidDate = slot?.paid_date || today;
    if (existing) {
      await base44.entities.LicenseRecord.update(existing.id, {
        license_status: "active",
        payment_status: "paid",
        paid_date: existing.paid_date || paidDate,
        invoice_date: existing.invoice_date || invoiceDate,
        license_start_date: existing.license_start_date || licenseStart,
        license_end_date: existing.license_end_date || licenseEnd,
        stripe_invoice_id: existing.stripe_invoice_id || slot?.invoice_id,
        ...(licenseNumber && !existing.license_number ? { license_number: licenseNumber } : {}),
        ...(annualFee != null && existing.annual_fee == null ? { annual_fee: annualFee } : {}),
      });
    } else {
      const propId = String(prop.id || "");
      await base44.entities.LicenseRecord.create({
        partner_id: partnerId,
        partner_name: partner.partner_name,
        ...(propId ? { property_id: propId } : {}),
        property_name: prop.property_name,
        submission_id: propId || `prop-${prop.property_name}-${Date.now()}`,
        license_status: "active",
        payment_status: "paid",
        paid_date: paidDate,
        invoice_date: invoiceDate,
        license_start_date: licenseStart,
        license_end_date: licenseEnd,
        stripe_invoice_id: slot?.invoice_id,
        ...(licenseNumber ? { license_number: licenseNumber } : {}),
        ...(annualFee != null ? { annual_fee: annualFee } : {}),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
  };

  const autoPopulate = async () => {
    setAutoPopulating(true);
    const existingPropertyIds = new Set(licenses.map(l => l.property_id).filter(Boolean));
    const existingPropertyNames = new Set(licenses.map(l => l.property_name).filter(Boolean));
    const missing = properties.filter(p =>
      !existingPropertyIds.has(p.id) && !existingPropertyNames.has(p.property_name)
    );
    if (missing.length > 0) {
      await Promise.all(missing.map(prop =>
        base44.entities.LicenseRecord.create({
          partner_id: partnerId,
          partner_name: partner.partner_name,
          property_id: prop.id,
          property_name: prop.property_name,
          submission_id: prop.id,
          license_status: "pending",
          payment_status: "unpaid",
        })
      ));
      queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    }
    setAutoPopulating(false);
  };

  // Use credit_slots if available, fallback to count
  const creditSlots = stripeData?.credit_slots || [];
  const totalCredits = creditSlots.length || (stripeData?.property_credits ?? 0);
  const attributedCount = licenses.filter(l =>
    l.license_status === "active" && l.payment_status === "paid"
  ).length;
  const unattributedCount = Math.max(0, totalCredits - attributedCount);
  const unattributedSlots = creditSlots.slice(attributedCount); // slots not yet attributed

  return (
    <div className="space-y-4">

      {/* Stripe Credits Section */}
      {totalCredits > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">
                  Stripe Property Licences
                </span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                {attributedCount} / {totalCredits} attributed
              </span>
            </div>
            {unattributedCount === 0 && (
              <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> All credits attributed
              </span>
            )}
          </div>

          {unattributedCount > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-blue-700">
                {unattributedCount} licence{unattributedCount > 1 ? "s" : ""} paid in Stripe but not yet linked to a property. Select a property for each to create/activate its license.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {Array.from({ length: unattributedCount }).map((_, i) => {
                  const slot = unattributedSlots[i] || null;
                  const periodLabel = slot
                    ? `${new Date(slot.period_start * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} → ${new Date(slot.period_end * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : null;
                  return (
                    <div key={i} className="flex items-center gap-2 bg-white rounded-lg border border-blue-200 px-3 py-2">
                      <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="shrink-0">
                        <div className="text-xs text-gray-700 font-medium">Credit #{attributedCount + i + 1}</div>
                        {periodLabel && <div className="text-xs text-gray-400">{periodLabel}</div>}
                      </div>
                      <select
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                        value={attributing[i] || ""}
                        onChange={e => setAttributing(prev => ({ ...prev, [i]: e.target.value }))}
                      >
                        <option value="">Select property to attribute…</option>
                        {properties.map(p => (
                          <option key={p.id} value={p.id}>{p.property_name}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!attributing[i]}
                        onClick={async () => {
                          await attributeCredit(attributing[i], slot);
                          setAttributing(prev => { const n = { ...prev }; delete n[i]; return n; });
                        }}
                        className="shrink-0 bg-blue-600 text-white hover:bg-blue-700 text-xs px-3 py-1 h-auto"
                      >
                        Attribute
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">License Records</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {bulkMode ? "Edit all rows below, then click Save All" : "Click the pencil icon on any row to edit it inline"}
          </p>
        </div>
        <div className="flex gap-2">
          {bulkMode ? (
            <>
              <Button size="sm" variant="outline" onClick={cancelBulk} disabled={bulkSaving}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
              </Button>
              <Button size="sm" onClick={saveAll} disabled={bulkSaving} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {bulkSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save All
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={autoPopulate} disabled={autoPopulating || properties.length === 0}
                className="border-[#C9A96E] text-[#C9A96E] hover:bg-[#C9A96E]/10">
                {autoPopulating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
                Auto-Populate
              </Button>
              {licenses.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setBulkMode(true)}
                  className="border-blue-300 text-blue-600 hover:bg-blue-50">
                  <LayoutList className="w-3.5 h-3.5 mr-1.5" /> Bulk Edit
                </Button>
              )}
              <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)} className="bg-[#0D1B2A] text-white hover:bg-[#1a2f47]">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add License
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Create Form */}
      {!bulkMode && showCreateForm && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">New License</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Property *</label>
              <select value={newLicense.property_id} onChange={e => setNewLicense(p => ({ ...p, property_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white">
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.property_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">License Number</label>
              <input value={newLicense.license_number} onChange={e => setNewLicense(p => ({ ...p, license_number: e.target.value }))}
                placeholder="e.g. LIC-2024-001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Annual Fee ($)</label>
              <input type="number" value={newLicense.annual_fee} onChange={e => setNewLicense(p => ({ ...p, annual_fee: e.target.value }))}
                placeholder="e.g. 1500"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Start Date</label>
              <input type="date" value={newLicense.license_start_date} onChange={e => setNewLicense(p => ({ ...p, license_start_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
            <Button size="sm" onClick={createLicense} disabled={!newLicense.property_id || creating} className="bg-[#0D1B2A] text-white hover:bg-[#1a2f47]">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Create License
            </Button>
          </div>
        </div>
      )}

      {/* Licenses Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : licenses.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No licenses yet. Click "Auto-Populate" to generate one per property, or "Add License" to create manually.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                {["Property", "License #", "Status", "Annual Fee", "Payment", "Start Date", "End Date", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {licenses.map(l => {
                // Bulk edit mode: all rows editable
                if (bulkMode && bulkDrafts[l.id]) {
                  return (
                    <EditableRow
                      key={l.id}
                      l={l}
                      draft={bulkDrafts[l.id]}
                      onChange={(field, value) => updateBulkField(l.id, field, value)}
                      isBulk={true}
                      properties={properties}
                    />
                  );
                }

                // Single row edit mode
                if (editingId === l.id && editDraft) {
                  return (
                    <EditableRow
                      key={l.id}
                      l={l}
                      draft={editDraft}
                      onChange={(field, value) => setEditDraft(d => ({ ...d, [field]: value }))}
                      onSave={() => saveEdit(l, editDraft)}
                      onCancel={() => { setEditingId(null); setEditDraft(null); }}
                      isBulk={false}
                      properties={properties}
                    />
                  );
                }

                const cfg = LICENSE_STATUS_CONFIG[l.license_status] || LICENSE_STATUS_CONFIG.pending;
                const nextStatuses = NEXT_STATUSES[l.license_status] || [];
                const isSaving = saving.has(l.id);

                return (
                  <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{l.property_name}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono">{l.license_number || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <span>{l.annual_fee != null ? `$${Number(l.annual_fee).toLocaleString()}` : "—"}</span>
                        {l.is_deal && (
                          <span title={l.deal_notes || "Special deal"} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 cursor-help">
                            <Tag className="w-3 h-3" /> Deal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {l.is_deal ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-400 border-gray-200">N/A</span>
                      ) : l.payment_status ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          l.payment_status === "paid" ? "bg-green-50 text-green-700 border-green-200" :
                          l.payment_status === "invoiced" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          l.payment_status === "overdue" ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-orange-50 text-orange-700 border-orange-200"
                        }`}>{l.payment_status}</span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{l.license_start_date || "—"}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{l.license_end_date || "—"}</td>
                    <td className="px-5 py-3">
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(l)} title="Edit" className="p-1 rounded hover:bg-blue-50 text-blue-500 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {nextStatuses.includes("active") && (
                            <button onClick={() => updateStatus(l, "active")} title="Set Active"
                              className="p-1 rounded hover:bg-emerald-50 text-emerald-600 transition-colors">
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {nextStatuses.includes("pending_transfer") && (
                            <button onClick={() => updateStatus(l, "pending_transfer")} title="Mark Pending Transfer"
                              className="p-1 rounded hover:bg-amber-50 text-amber-600 transition-colors">
                              <ArrowLeftRight className="w-4 h-4" />
                            </button>
                          )}
                          {nextStatuses.includes("cancelled") && (
                            <button onClick={() => updateStatus(l, "cancelled")} title="Cancel License"
                              className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors">
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors" title="Payment / Invoice">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setEditingLicense(l)}>
                                <Receipt className="w-4 h-4 mr-2" /> Edit / Link Invoice
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => updatePaymentStatus(l, "paid")} disabled={l.payment_status === "paid"}>
                                <DollarSign className="w-4 h-4 mr-2 text-green-600" /> Mark as Paid
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updatePaymentStatus(l, "invoiced")} disabled={l.payment_status === "invoiced"}>
                                <CheckCircle className="w-4 h-4 mr-2 text-blue-600" /> Mark as Invoiced
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updatePaymentStatus(l, "overdue")} disabled={l.payment_status === "overdue"}>
                                <AlertCircle className="w-4 h-4 mr-2 text-red-500" /> Mark as Overdue
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updatePaymentStatus(l, "unpaid")} disabled={l.payment_status === "unpaid"}>
                                Mark as Unpaid
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                onClick={() => setPendingDelete(l)}
                                disabled={deletingId === l.id}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete License
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingLicense && (
        <LicenseEditModal
          license={editingLicense}
          onClose={() => setEditingLicense(null)}
          onSave={saveLicenseEdit}
        />
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this license record?</DialogTitle>
            <DialogDescription>
              This permanently removes the license for{" "}
              <span className="font-medium">{pendingDelete?.property_name || "this property"}</span>
              {pendingDelete?.license_number && (
                <> (<span className="font-mono">{pendingDelete.license_number}</span>)</>
              )} from the system. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={!!deletingId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteLicense} disabled={!!deletingId}>
              {deletingId ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}