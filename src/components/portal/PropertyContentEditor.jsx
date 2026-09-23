import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Inline editor for partner-editable property content:
 *  - About This Property (short_summary + description)
 *  - Why The 100 Collection (why_100_collection)
 *  - Unique Features (unique_features)
 *
 * Edits are saved directly to both Base44 (Property entity) and Supabase
 * (propertiesbase44 table) via the updatePropertyContent backend function —
 * no approval workflow required.
 */
export default function PropertyContentEditor({
  property,
  basePropertyId,
  supabaseRowId,
  supabaseUrl,
  onUpdated,
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [shortSummary, setShortSummary] = useState(
    property?.short_summary || property?.excerpt || ""
  );
  const [description, setDescription] = useState(
    property?.description || property?.text || ""
  );
  const [why100, setWhy100] = useState(
    property?.why_100_collection || property?.why_onehundred || ""
  );
  const [uniqueFeatures, setUniqueFeatures] = useState(
    property?.unique_features || property?.unique_feature || ""
  );

  const startEdit = () => {
    setShortSummary(property?.short_summary || property?.excerpt || "");
    setDescription(property?.description || property?.text || "");
    setWhy100(property?.why_100_collection || property?.why_onehundred || "");
    setUniqueFeatures(property?.unique_features || property?.unique_feature || "");
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
          short_summary: shortSummary,
          description,
          why_100_collection: why100,
          unique_features: uniqueFeatures,
        },
      });

      if (res.data?.error) {
        toast.error(res.data.error);
        return;
      }

      toast.success("Changes saved and synced.");
      setEditing(false);
      onUpdated?.();
    } catch (e) {
      console.error("[PropertyContentEditor] save failed", e);
      toast.error(e?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 resize-none";

  const displaySummary = property?.short_summary || property?.excerpt;
  const displayDescription = property?.description || property?.text;
  const displayWhy100 = property?.why_100_collection || property?.why_onehundred;
  const displayUnique = property?.unique_features || property?.unique_feature;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
      <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
        <h3 className="text-sm font-semibold text-[#0D1B2A]">Property Content</h3>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs font-medium text-[#C9A96E] hover:text-[#A68B4B] transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit Content
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-5">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
              Short Summary
            </label>
            <textarea
              value={shortSummary}
              onChange={(e) => setShortSummary(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="A one to two sentence highlight of the property."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
              About This Property
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className={inputCls}
              placeholder="The full long-form description guests see on the property page."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
              Why The 100 Collection
            </label>
            <textarea
              value={why100}
              onChange={(e) => setWhy100(e.target.value)}
              rows={4}
              className={inputCls}
              placeholder="Why this property fits The 100 Collection curation standards."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">
              Unique Features
            </label>
            <textarea
              value={uniqueFeatures}
              onChange={(e) => setUniqueFeatures(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="What makes this property distinctive."
            />
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
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <h4 className="text-xs font-semibold text-[#C9A96E] uppercase tracking-wide mb-1.5">
              Short Summary
            </h4>
            {displaySummary ? (
              <p className="text-sm text-slate-600 leading-relaxed">{displaySummary}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">Not added yet</p>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[#C9A96E] uppercase tracking-wide mb-1.5">
              About This Property
            </h4>
            {displayDescription ? (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {displayDescription}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">No description available yet</p>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[#C9A96E] uppercase tracking-wide mb-1.5">
              Why The 100 Collection
            </h4>
            {displayWhy100 ? (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {displayWhy100}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">Not added yet</p>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[#C9A96E] uppercase tracking-wide mb-1.5">
              Unique Features
            </h4>
            {displayUnique ? (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {displayUnique}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">Not added yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}