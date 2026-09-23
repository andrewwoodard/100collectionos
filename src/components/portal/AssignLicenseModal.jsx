import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle, Loader2, X, AlertCircle } from "lucide-react";

export default function AssignLicenseModal({ license, onClose, onSuccess }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const { data: properties = [] } = useQuery({
    queryKey: ["assign-properties", license.partner_name],
    queryFn: async () => {
      const all = await base44.entities.Property.filter({ partner_name: license.partner_name });
      return all.filter(p => !p.archived_at);
    },
    enabled: !!license.partner_name,
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["partner-licenses-for-assign", license.partner_name],
    queryFn: () => base44.entities.LicenseRecord.filter({ partner_name: license.partner_name }),
    enabled: !!license.partner_name,
  });

  // Properties that don't already have a license assigned (excluding already-assigned ones)
  const usedPropertyIds = licenses
    .filter(l => l.id !== license.id && l.property_id)
    .map(l => l.property_id);

  const eligibleProperties = properties.filter(p => !usedPropertyIds.includes(p.id));

  const handleAssign = async () => {
    if (!selectedPropertyId) return;
    setLoading(true);
    const prop = properties.find(p => p.id === selectedPropertyId);
    await base44.entities.LicenseRecord.update(license.id, {
      property_id: selectedPropertyId,
      property_name: prop?.property_name || "",
      license_status: "active",
      payment_status: "paid",
      license_start_date: new Date().toISOString().split("T")[0],
    });
    setLoading(false);
    setDone(true);
    setTimeout(() => { onSuccess(); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-[#0D1B2A]">Assign License to Property</h2>
            <p className="text-xs text-slate-400 mt-0.5">License #{license.license_number || "—"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {eligibleProperties.length === 0 ? (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">No properties available</p>
                <p className="text-xs mt-1">All properties already have licenses assigned. Submit a new property to use this license.</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Select Property</div>
              <select
                value={selectedPropertyId}
                onChange={e => setSelectedPropertyId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#0D1B2A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
              >
                <option value="">Choose a property…</option>
                {eligibleProperties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.property_name}{p.market ? ` · ${p.market}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs text-slate-500">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Assigning will activate this license and link it permanently to the selected property.
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedPropertyId || loading || done || eligibleProperties.length === 0}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#C9A96E] text-white text-sm font-medium hover:bg-[#b8935a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {done ? (
              <><CheckCircle className="w-4 h-4" /> Assigned!</>
            ) : loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Assigning…</>
            ) : (
              "Assign License"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}