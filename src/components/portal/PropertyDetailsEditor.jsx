import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Pencil, Save, X, Loader2, Bed, Bath, Users, Home as HomeIcon, MapPin } from "lucide-react";
import { toast } from "sonner";

const PROPERTY_TYPES = [
  { value: "villa", label: "Villa" },
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "apartment", label: "Apartment" },
  { value: "estate", label: "Estate" },
  { value: "cabin", label: "Cabin" },
  { value: "other", label: "Other" },
];

/**
 * Inline editor for partner-editable property details:
 *  - Property type, bedrooms, bathrooms, half baths, sleeps, address
 *
 * Edits are saved directly to both Base44 (Property entity) and Supabase
 * (propertiesbase44 table) via the updatePropertyContent backend function.
 */
export default function PropertyDetailsEditor({
  property,
  basePropertyId,
  supabaseRowId,
  supabaseUrl,
  onUpdated,
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [propertyType, setPropertyType] = useState(
    property?.property_type || property?.house_type || ""
  );
  const [bedrooms, setBedrooms] = useState(property?.bedrooms ?? "");
  const [bathrooms, setBathrooms] = useState(property?.bathrooms ?? "");
  const [halfBathrooms, setHalfBathrooms] = useState(property?.half_bathrooms ?? "");
  const [sleeps, setSleeps] = useState(property?.sleeps ?? "");
  const [address, setAddress] = useState(
    property?.address || property?.location_full || ""
  );

  const startEdit = () => {
    setPropertyType(property?.property_type || property?.house_type || "");
    setBedrooms(property?.bedrooms ?? "");
    setBathrooms(property?.bathrooms ?? "");
    setHalfBathrooms(property?.half_bathrooms ?? "");
    setSleeps(property?.sleeps ?? "");
    setAddress(property?.address || property?.location_full || "");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("updatePropertyContent", {
        basePropertyId: basePropertyId || undefined,
        supabaseRowId: supabaseRowId || undefined,
        supabaseUrl: supabaseUrl || undefined,
        fields: {
          property_type: propertyType,
          bedrooms: bedrooms === "" ? null : Number(bedrooms),
          bathrooms: bathrooms === "" ? null : Number(bathrooms),
          half_bathrooms: halfBathrooms === "" ? null : Number(halfBathrooms),
          sleeps: sleeps === "" ? null : Number(sleeps),
          address,
        },
      });

      if (res.data?.error) {
        toast.error(res.data.error);
        return;
      }

      toast.success("Details saved and synced.");
      setEditing(false);
      onUpdated?.();
    } catch (e) {
      console.error("[PropertyDetailsEditor] save failed", e);
      toast.error(e?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30";

  // Display values
  const dPropertyType = property?.property_type || property?.house_type;
  const dBedrooms = property?.bedrooms;
  const dBathrooms = property?.bathrooms;
  const dHalfBaths = property?.half_bathrooms;
  const dSleeps = property?.sleeps;
  const dAddress = property?.address || property?.location_full;
  const dMarket = property?.market || property?.location_city;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
      <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
        <h3 className="text-sm font-semibold text-[#0D1B2A]">Property Details</h3>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs font-medium text-[#C9A96E] hover:text-[#A68B4B] transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit Details
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
                Property Type
              </label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className={inputCls}
              >
                <option value="">Select type</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputCls}
                placeholder="Street address or descriptive location"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
                Bedrooms
              </label>
              <input
                type="number"
                min="0"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
                Bathrooms
              </label>
              <input
                type="number"
                min="0"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
                Half Baths
              </label>
              <input
                type="number"
                min="0"
                value={halfBathrooms}
                onChange={(e) => setHalfBathrooms(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
                Sleeps
              </label>
              <input
                type="number"
                min="0"
                value={sleeps}
                onChange={(e) => setSleeps(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex items-center gap-1.5 border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-[#0D1B2A] text-white text-sm font-medium px-5 py-2 rounded-xl hover:bg-[#1a2e45] disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {dAddress && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Location</p>
              <p className="text-sm text-[#0D1B2A] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-300" /> {dAddress}
              </p>
            </div>
          )}
          {dPropertyType && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Property Type</p>
              <p className="text-sm text-[#0D1B2A] capitalize flex items-center gap-1">
                <HomeIcon className="w-3.5 h-3.5 text-slate-300" /> {dPropertyType}
              </p>
            </div>
          )}
          {dMarket && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Market</p>
              <p className="text-sm text-[#0D1B2A]">{dMarket}</p>
            </div>
          )}
          <div className="flex gap-6 flex-wrap">
            {dBedrooms != null && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Bedrooms</p>
                <p className="text-sm text-[#0D1B2A] flex items-center gap-1"><Bed className="w-3.5 h-3.5 text-slate-300" /> {dBedrooms}</p>
              </div>
            )}
            {dBathrooms != null && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Bathrooms</p>
                <p className="text-sm text-[#0D1B2A] flex items-center gap-1"><Bath className="w-3.5 h-3.5 text-slate-300" /> {dBathrooms}</p>
              </div>
            )}
            {dHalfBaths != null && dHalfBaths > 0 && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Half Baths</p>
                <p className="text-sm text-[#0D1B2A]">{dHalfBaths}</p>
              </div>
            )}
            {dSleeps != null && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Sleeps</p>
                <p className="text-sm text-[#0D1B2A] flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-300" /> {dSleeps}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}