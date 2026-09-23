import React from "react";
import { Plus, X } from "lucide-react";

const INPUT_CLS = "w-full px-4 py-3 bg-white border border-[#D9C8B4] rounded-lg text-[#1a1a1a] text-sm placeholder-[#B0A090] focus:outline-none focus:border-[#C9A96E] focus:ring-2 focus:ring-[#C9A96E]/20 transition-all";
const MAX_PROPERTIES = 15;

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newPropertyRow() {
  return { id: uid(), property_name: "", listing_url: "", notes: "" };
}

export default function SubmittedPropertiesFields({ properties, onChange, showErrors }) {
  const update = (id, field, value) => {
    onChange(properties.map(p => (p.id === id ? { ...p, [field]: value } : p)));
  };
  const remove = (id) => {
    onChange(properties.filter(p => p.id !== id));
  };
  const add = () => {
    if (properties.length < MAX_PROPERTIES) {
      onChange([...properties, newPropertyRow()]);
    }
  };

  const atCap = properties.length >= MAX_PROPERTIES;
  const validCount = properties.filter(p => p.listing_url.trim()).length;

  return (
    <div>
      <label className="text-[11px] font-semibold text-[#8B7355] uppercase tracking-widest mb-1.5 block">
        Properties You'd Like Us to Consider
      </label>
      <p className="text-sm text-[#8B7355] leading-relaxed mb-4">
        Add each property you'd like The 100 Collection to review. Include a listing URL from wherever your property is currently listed (VRBO, Airbnb, your own site, etc.)
      </p>

      <div className="space-y-3">
        {properties.map((prop, idx) => {
          const urlMissing = showErrors && !prop.listing_url.trim();
          return (
            <div key={prop.id}>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 sm:items-center">
                <input
                  value={prop.property_name}
                  onChange={e => update(prop.id, "property_name", e.target.value)}
                  className={INPUT_CLS + " sm:flex-1"}
                  placeholder="e.g. Sunset Villa"
                />
                <input
                  value={prop.listing_url}
                  onChange={e => update(prop.id, "listing_url", e.target.value)}
                  className={INPUT_CLS + " sm:flex-[1.3] " + (urlMissing ? "border-red-300 focus:border-red-400 focus:ring-red-400/20" : "")}
                  placeholder="https://vrbo.com/..."
                />
                <input
                  value={prop.notes}
                  onChange={e => update(prop.id, "notes", e.target.value)}
                  className={INPUT_CLS + " sm:flex-1"}
                  placeholder="Any details we should know"
                />
                <button
                  type="button"
                  onClick={() => remove(prop.id)}
                  className="flex-shrink-0 w-9 h-9 mx-auto flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove property"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {urlMissing && (
                <p className="text-xs text-red-500 mt-1 ml-1">Listing URL is required for each property</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <p className="text-xs text-[#B0A090]">
          You've added {validCount} {validCount === 1 ? "property" : "properties"}
        </p>
        {atCap ? (
          <div className="w-full mt-1 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-700 leading-relaxed">
              You can add up to {MAX_PROPERTIES} properties in one application. For more, please reach out to us directly at{" "}
              <a href="mailto:partnerships@theonehundredcollection.com" className="text-[#C9A96E] hover:underline">partnerships@theonehundredcollection.com</a>
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C9A96E] hover:text-[#b8935a] transition-colors"
          >
            <Plus className="w-4 h-4" /> Add another property
          </button>
        )}
      </div>
    </div>
  );
}