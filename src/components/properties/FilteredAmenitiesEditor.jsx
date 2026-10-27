import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  FILTERED_AMENITIES,
  normalizeFilteredAmenities,
} from "@/lib/filteredAmenities";

/**
 * Admin editor for curated filter amenities on Property Detail.
 * Keys are stable for the public site; pet-friendly can include a policy URL.
 */
export default function FilteredAmenitiesEditor({
  value = [],
  petPolicyUrl = "",
  saving = false,
  onSave,
}) {
  const [keys, setKeys] = useState(() => normalizeFilteredAmenities(value));
  const [policyUrl, setPolicyUrl] = useState(petPolicyUrl || "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setKeys(normalizeFilteredAmenities(value));
    setPolicyUrl(petPolicyUrl || "");
    setDirty(false);
  }, [value, petPolicyUrl]);

  const toggle = (key) => {
    setKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      setDirty(true);
      return next;
    });
  };

  const save = async () => {
    if (!onSave) return;
    await onSave({
      filtered_amenities: keys,
      pet_policy_url: keys.includes("pet_friendly") ? String(policyUrl || "").trim() || null : null,
    });
    setDirty(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTERED_AMENITIES.map((a) => {
          const selected = keys.includes(a.key);
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => toggle(a.key)}
              title={a.description || a.label}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                selected
                  ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {keys.includes("pet_friendly") && (
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">
            Pet policy URL (shown with Pet-friendly — fees vary)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={policyUrl}
              onChange={(e) => {
                setPolicyUrl(e.target.value);
                setDirty(true);
              }}
              placeholder="https://partner-site.com/pet-policy"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
            />
            {policyUrl ? (
              <a
                href={policyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-[#C9A96E]"
                title="Open policy"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-[#0D1B2A] hover:bg-[#1a2d42] disabled:opacity-50 px-3 py-1.5 rounded-md"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {saving ? "Saving…" : "Save filter amenities"}
        </button>
        {!dirty && keys.length > 0 && (
          <span className="text-[11px] text-slate-400">{keys.length} selected</span>
        )}
        {dirty && <span className="text-[11px] text-amber-600">Unsaved changes</span>}
      </div>
    </div>
  );
}
