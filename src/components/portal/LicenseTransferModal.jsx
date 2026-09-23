import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowRight, AlertCircle, CheckCircle, Loader2, X } from "lucide-react";

export default function LicenseTransferModal({ license, partnerEmail, onClose, onSuccess }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Fetch partner's properties and licenses
  const { data: properties = [] } = useQuery({
    queryKey: ["transfer-properties", partnerEmail],
    queryFn: () => base44.entities.Property.filter({ partner_name: license.partner_name }),
    enabled: !!license.partner_name,
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["all-licenses", license.partner_name],
    queryFn: () => base44.entities.LicenseRecord.filter({ partner_name: license.partner_name }),
    enabled: !!license.partner_name,
  });

  // Get property IDs that already have licenses
  const licensedPropertyIds = licenses.map(l => l.property_id);

  // Filter for properties without licenses, excluding current property
  const eligibleProperties = properties.filter(
    p => p.id !== license.property_id && !licensedPropertyIds.includes(p.id)
  );

  const handleTransfer = async () => {
    if (!selectedPropertyId) return;
    setLoading(true);
    await base44.functions.invoke("transferLicense", {
      license_id: license.id,
      new_property_id: selectedPropertyId,
      reason,
    });
    setLoading(false);
    setDone(true);
    setTimeout(() => { onSuccess(); onClose(); }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-[#0D1B2A]">Transfer License</h2>
            <p className="text-xs text-slate-400 mt-0.5">Reassign this license to a different property</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* From property */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">From</div>
            <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-[#0D1B2A]">{license.property_name}</div>
                <div className="text-xs text-slate-400">License #{license.license_number || "N/A"} · Active</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-[#C9A96E]" />
          </div>

          {/* To property */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">To (New Property)</div>
            {eligibleProperties.length === 0 ? (
              <div className="bg-orange-50 rounded-xl px-4 py-3 text-sm space-y-2">
                <div className="flex items-start gap-2 text-orange-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">No properties available for transfer</p>
                    <p className="text-xs mt-1">All existing properties already have licenses. Please submit a new property from the Partner Portal before transferring this license.</p>
                  </div>
                </div>
              </div>
            ) : (
              <select
                value={selectedPropertyId}
                onChange={e => setSelectedPropertyId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#0D1B2A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
              >
                <option value="">Select a property...</option>
                {eligibleProperties.map(p => (
                  <option key={p.id} value={p.id}>{p.property_name} {p.market ? `· ${p.market}` : ""}</option>
                ))}
              </select>
            )}
          </div>

          {/* Reason */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reason <span className="font-normal text-slate-400">(optional)</span></div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Lost management on original property..."
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#0D1B2A] resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>This will reassign the license and log the transfer in the audit trail. The original property will no longer hold this license.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={!selectedPropertyId || loading || done}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#C9A96E] text-white text-sm font-medium hover:bg-[#b8935a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {done ? (
              <><CheckCircle className="w-4 h-4" /> Transferred!</>
            ) : loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Transferring...</>
            ) : (
              <>Transfer License</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}