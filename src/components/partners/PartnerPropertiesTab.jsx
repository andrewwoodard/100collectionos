import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import StatusBadge from "../shared/StatusBadge";
import EmptyState from "../shared/EmptyState";
import { Building2, CheckCircle2, Gift, Pencil, Plus, Sparkles, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import PropertyFormModal from "../properties/PropertyFormModal";
import AddPropertyWithAiModal from "../properties/AddPropertyWithAiModal";

function LicenceSelector({ prop, lic, isChanging, isSaving, unusedLicenseRecords, stripeLicenses, availableStripeSlots, onApply, onCancel }) {
  const [selected, setSelected] = useState("");
  const options = isChanging ? stripeLicenses : unusedLicenseRecords;

  return (
    <div className="flex items-center gap-2">
      <select
        className="text-xs border border-blue-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[180px]"
        value={selected}
        onChange={e => setSelected(e.target.value)}
      >
        <option value="">{isChanging ? "Change licence…" : "Apply licence…"}</option>
        {options.map((c, i) => (
          <option key={c.id} value={c.id}>
            {c.property_name && c.id !== lic?.id ? `↩ ${c.property_name}` : `Licence ${i + 1}`}
            {c.paid_date ? ` (${c.paid_date})` : ""}
          </option>
        ))}
        {/* Show Stripe slot option when there are no unused records but Stripe has credits */}
        {!isChanging && unusedLicenseRecords.length === 0 && availableStripeSlots > 0 && (
          <option value="__new__">Apply from Stripe ({availableStripeSlots} available)</option>
        )}
      </select>
      <Button
        size="sm"
        disabled={!selected || isSaving}
        onClick={() => onApply(selected)}
        className="text-xs h-7 px-2.5 bg-blue-600 text-white hover:bg-blue-700"
      >
        {isSaving ? "…" : "Apply"}
      </Button>
      {isChanging && (
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function PartnerPropertiesTab({ properties, partnerId, partner, stripeData, base44PartnerId }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // propertyId -> true if in "change" mode
  const [changing, setChanging] = useState({});
  const [saving, setSaving] = useState(new Set());
  const [removing, setRemoving] = useState(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const handleAiCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-properties", partnerId, partner?.partner_name] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
    queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    queryClient.invalidateQueries({ queryKey: ["properties-b44"] });
  };

  const handleAddProperty = async (formData) => {
    const payload = {
      ...formData,
      partner_id: base44PartnerId || formData.partner_id || null,
      partner_name: partner?.partner_name || formData.partner_name || null,
    };
    const newProp = await base44.entities.Property.create(payload);
    // Push to Supabase so it also appears on the admin Properties page (non-fatal).
    base44.functions.invoke("syncPropertyToSupabase", { action: "sync_property", id: newProp.id }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["partner-properties", partnerId, partner?.partner_name] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
    queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    queryClient.invalidateQueries({ queryKey: ["properties-b44"] });
    toast({ title: "Property added", description: payload.property_name });
  };

  const removeLicense = async (prop, lic) => {
    if (!lic?.id) return;
    setRemoving(prev => new Set(prev).add(prop.id));
    try {
      await base44.entities.LicenseRecord.update(lic.id, {
        property_id: "",
        property_name: "",
        license_status: "pending",
      });
      await queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    } finally {
      setRemoving(prev => { const n = new Set(prev); n.delete(prop.id); return n; });
    }
  };

  const { data: licenses = [] } = useQuery({
    queryKey: ["partner-licenses", partnerId],
    queryFn: () => base44.entities.LicenseRecord.filter({ partner_id: partnerId }),
    enabled: !!partnerId,
  });

  // Fetch draft PropertySubmissions so in-progress portal drafts show in the table
  // even though no Property entity exists yet (Property is only created on approval).
  const partnerName = partner?.partner_name;
  const { data: draftSubmissions = [] } = useQuery({
    queryKey: ["partner-draft-submissions", partnerName],
    queryFn: async () => {
      if (!partnerName) return [];
      const subs = await base44.entities.PropertySubmission.filter({ partner_name: partnerName });
      return subs.filter(s => s.status === "draft");
    },
    enabled: !!partnerName,
  });

  // Normalise draft submissions into the same row shape as Property entities
  const draftRows = draftSubmissions.map(s => ({
    id: s.id,
    property_name: s.property_name,
    market: s.market,
    property_type: s.property_type,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    status: s.status,
    _isDraftSubmission: true,
  }));
  const allRows = [...draftRows, ...properties];

  // All stripe-backed licences (assigned or not)
  const stripeLicenses = licenses.filter(l => l.stripe_invoice_id);
  // Unused = stripe-backed but no property linked
  const unusedLicenseRecords = stripeLicenses.filter(l => !l.property_id && !l.property_name?.trim());

  // Total paid licences from Stripe (the authoritative count)
  const stripeCredits = stripeData?.property_credits ?? 0;
  const creditSlots = stripeData?.credit_slots || [];
  // Already attributed licence records
  const attributedCount = licenses.filter(l => l.license_status === "active" && l.payment_status === "paid").length;
  // How many more can be applied directly from Stripe credits (no record yet)
  const availableStripeSlots = Math.max(0, stripeCredits - attributedCount);
  // Next unattributed slot (for __new__ creation)
  const nextSlot = creditSlots[attributedCount] || null;

  // A property can have a licence applied if there are unused records OR remaining Stripe slots
  const canApplyNew = unusedLicenseRecords.length > 0 || availableStripeSlots > 0;

  // For a given property, find its linked license (if any)
  const licenseForProperty = (prop) =>
    licenses.find(l =>
      (l.property_id && l.property_id.trim() && String(l.property_id) === String(prop.id)) ||
      (l.property_name && l.property_name.trim() && l.property_name === prop.property_name)
    );

  const applyLicense = async (prop, licenseId) => {
    setSaving(prev => new Set(prev).add(prop.id));
    const today = new Date().toISOString().split("T")[0];

    // If the property already has a licence record, unlink it first
    const existing = licenseForProperty(prop);
    if (existing && existing.id !== licenseId) {
      await base44.entities.LicenseRecord.update(existing.id, {
        property_name: null,
      });
    }

    if (licenseId === "__new__") {
      // Create a brand new LicenseRecord from a Stripe credit slot
      const propId = String(prop.id || "");
      const submissionId = propId || `prop-${prop.property_name}-${Date.now()}`;
      // Use the next available slot for invoice number and fee
      const slot = nextSlot;
      let licenseNumber;
      if (slot?.invoice_number) {
        const sameInvoiceSlots = creditSlots.filter(s => s.invoice_id === slot.invoice_id);
        const slotIdx = sameInvoiceSlots.indexOf(slot);
        licenseNumber = `${slot.invoice_number}-${slotIdx + 1}`;
      }
      await base44.entities.LicenseRecord.create({
        partner_id: partnerId,
        partner_name: partner?.partner_name,
        ...(propId ? { property_id: propId } : {}),
        property_name: prop.property_name,
        submission_id: submissionId,
        license_status: "active",
        payment_status: "paid",
        paid_date: slot?.paid_date || today,
        invoice_date: slot?.invoice_date || undefined,
        stripe_invoice_id: slot?.invoice_id || undefined,
        ...(licenseNumber ? { license_number: licenseNumber } : {}),
        ...(slot?.unit_price != null ? { annual_fee: slot.unit_price } : {}),
      });
    } else {
      const lic = licenses.find(l => l.id === licenseId);
      if (!lic) { setSaving(prev => { const n = new Set(prev); n.delete(prop.id); return n; }); return; }
      const propId = String(prop.id || "");
      await base44.entities.LicenseRecord.update(licenseId, {
        ...(propId ? { property_id: propId } : {}),
        property_name: prop.property_name,
        license_status: "active",
        payment_status: "paid",
        paid_date: lic.paid_date || today,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setSaving(prev => { const n = new Set(prev); n.delete(prop.id); return n; });
    setChanging(prev => { const n = { ...prev }; delete n[prop.id]; return n; });
  };

  if (allRows.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add a property for this partner directly, or it will appear here once linked."
          actionLabel="Add Property"
          onAction={() => setAddModalOpen(true)}
        />
        <PropertyFormModal
          open={addModalOpen}
          onOpenChange={setAddModalOpen}
          property={null}
          presetPartnerId={base44PartnerId}
          partners={base44PartnerId && partner?.partner_name ? [{ id: base44PartnerId, partner_name: partner.partner_name }] : []}
          onSave={handleAddProperty}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button onClick={() => setAiModalOpen(true)} variant="outline" className="border-[#C9A96E] text-[#A68B4B] hover:bg-[#FAF6EE]">
          <Sparkles className="w-4 h-4 mr-1.5" /> Add with AI
        </Button>
        <Button onClick={() => setAddModalOpen(true)} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
          <Plus className="w-4 h-4 mr-1.5" /> Add Property
        </Button>
      </div>
      {(unusedLicenseRecords.length > 0 || availableStripeSlots > 0) && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700">
          <Gift className="w-4 h-4 shrink-0" />
          <span>
            <strong>{unusedLicenseRecords.length + availableStripeSlots}</strong> licence{(unusedLicenseRecords.length + availableStripeSlots) !== 1 ? "s" : ""} available — apply them to properties below.
          </span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Market</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Beds / Baths</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Property Licence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {allRows.map(prop => {
              const isDraft = prop._isDraftSubmission;
              const lic = isDraft ? null : licenseForProperty(prop);
              const hasLicence = !!lic;
              const isSaving = saving.has(prop.id);
              const isRemoving = removing.has(prop.id);
              const isChanging = changing[prop.id];

              return (
                <tr key={prop.id} className={`hover:bg-gray-50 transition-colors ${isDraft || prop.status === "draft" ? "bg-amber-50/40" : ""}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {isDraft ? (
                      <Link
                        to={`/admin/hub?tab=submissions&submissionId=${prop.id}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {prop.property_name}
                      </Link>
                    ) : (
                      <Link
                        to={createPageUrl("PropertyDetail") + `?id=${prop.id}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {prop.property_name}
                      </Link>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{prop.market || "—"}</td>
                  <td className="px-5 py-3 text-gray-500 capitalize">{prop.property_type?.replace(/_/g, " ") || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {prop.bedrooms || prop.bathrooms
                      ? `${prop.bedrooms ?? "—"} BD / ${prop.bathrooms ?? "—"} BA`
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={prop.status} />
                  </td>
                  <td className="px-5 py-3">
                    {hasLicence && !isChanging ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Licence Applied
                          {lic.license_number ? ` #${lic.license_number}` : ""}
                        </span>
                        {canApplyNew && (
                          <button
                            onClick={() => setChanging(prev => ({ ...prev, [prop.id]: true }))}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                            title="Change licence"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeLicense(prop, lic)}
                          disabled={isRemoving}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove licence from property"
                        >
                          {isRemoving ? <span className="text-xs text-gray-400">…</span> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : isChanging || (!hasLicence && canApplyNew) ? (
                      <LicenceSelector
                        prop={prop}
                        lic={lic}
                        isChanging={isChanging}
                        isSaving={isSaving}
                        unusedLicenseRecords={unusedLicenseRecords}
                        stripeLicenses={stripeLicenses}
                        availableStripeSlots={availableStripeSlots}
                        onApply={(licenseId) => applyLicense(prop, licenseId)}
                        onCancel={() => setChanging(prev => { const n = { ...prev }; delete n[prop.id]; return n; })}
                      />
                    ) : isDraft ? (
                      <span className="text-xs text-amber-600 italic">Draft submission</span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No licences available</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PropertyFormModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        property={null}
        presetPartnerId={base44PartnerId}
        partners={base44PartnerId && partner?.partner_name ? [{ id: base44PartnerId, partner_name: partner.partner_name }] : []}
        onSave={handleAddProperty}
      />
      <AddPropertyWithAiModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        partners={base44PartnerId && partner?.partner_name ? [{ id: base44PartnerId, partner_name: partner.partner_name, market: partner.market }] : []}
        presetPartnerId={base44PartnerId}
        onCreated={handleAiCreated}
        />
        </div>
        );
        }