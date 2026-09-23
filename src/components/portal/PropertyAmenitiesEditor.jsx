import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AmenitiesEditor from "@/components/properties/AmenitiesEditor";

/**
 * Inline editor for partner-editable property amenities.
 * Saves directly to both Base44 (Property.amenities) and Supabase
 * (categories + prop_categories) via the updatePropertyContent backend
 * function — no approval workflow required.
 */
export default function PropertyAmenitiesEditor({
  property,
  basePropertyId,
  supabaseRowId,
  supabaseUrl,
  onUpdated,
}) {
  const initial = Array.isArray(property?.amenities) ? property.amenities : [];
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amenities, setAmenities] = useState(initial);

  const startEdit = () => {
    setAmenities(Array.isArray(property?.amenities) ? property.amenities : []);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("updatePropertyContent", {
        basePropertyId: basePropertyId || undefined,
        supabaseRowId: supabaseRowId || undefined,
        supabaseUrl: supabaseUrl || undefined,
        fields: { amenities },
      });

      if (res.data?.error) {
        toast.error(res.data.error);
        return;
      }

      toast.success("Amenities saved and synced.");
      setEditing(false);
      onUpdated?.();
    } catch (e) {
      console.error("[PropertyAmenitiesEditor] save failed", e);
      toast.error(e?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const displayAmenities = Array.isArray(property?.amenities) ? property.amenities : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
      <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
        <h3 className="text-sm font-semibold text-[#0D1B2A]">Amenities</h3>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs font-medium text-[#C9A96E] hover:text-[#A68B4B] transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit Amenities
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <AmenitiesEditor value={amenities} onChange={setAmenities} />
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
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        displayAmenities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {displayAmenities.map((a, i) => (
              <span key={i} className="text-xs bg-slate-50 text-[#0D1B2A] px-3 py-1.5 rounded-full">{a}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">No amenities listed yet</p>
        )
      )}
    </div>
  );
}