import React, { useState } from "react";
import { Plus, Trash2, Check, X, Bed } from "lucide-react";

/**
 * Editable list of sleeping arrangement bedrooms stored inside the
 * `internal_notes` JSON blob on the Supabase propertiesbase44 row.
 *
 * Props:
 *  - parsedNotes: the parsed internal_notes object (or null)
 *  - onSave: (newInternalNotesString) => Promise — persists the full JSON string
 */
export default function EditableSleepingArrangements({ parsedNotes, onSave }) {
  const bedrooms = parsedNotes?.sleepingArrangements?.bedrooms;
  if (!Array.isArray(bedrooms)) return null;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">Sleeping Arrangements</p>
      <SleepingArrangementsEditor
        bedrooms={bedrooms}
        parsedNotes={parsedNotes}
        onSave={onSave}
      />
    </div>
  );
}

function SleepingArrangementsEditor({ bedrooms, parsedNotes, onSave }) {
  const [items, setItems] = useState(
    bedrooms.map((br) => ({
      name: br.name || "",
      features: Array.isArray(br.features) ? [...br.features] : [],
    }))
  );
  const [saving, setSaving] = useState(false);

  const updateName = (i, name) => {
    setItems((prev) => prev.map((b, idx) => (idx === i ? { ...b, name } : b)));
  };

  const updateFeatures = (i, text) => {
    const features = text
      .split("\n")
      .map((f) => f.replace(/^\s*•\s*/, "").trim())
      .filter(Boolean);
    setItems((prev) => prev.map((b, idx) => (idx === i ? { ...b, features } : b)));
  };

  const addBedroom = () => {
    setItems((prev) => [...prev, { name: "", features: [] }]);
  };

  const removeBedroom = (i) => {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    const updated = {
      ...parsedNotes,
      sleepingArrangements: {
        ...(parsedNotes?.sleepingArrangements || {}),
        bedrooms: items,
        total: {
          ...(parsedNotes?.sleepingArrangements?.total || {}),
          bedrooms: items.length,
        },
      },
    };
    try {
      await onSave(JSON.stringify(updated, null, 2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {items.map((br, i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <Bed className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              value={br.name}
              onChange={(e) => updateName(i, e.target.value)}
              placeholder={`Bedroom ${i + 1} name`}
              className="flex-1 text-sm font-medium text-gray-800 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-[#C9A96E] focus:outline-none px-0 py-0.5"
            />
            <button
              onClick={() => removeBedroom(i)}
              className="text-gray-300 hover:text-red-500 p-1"
              title="Remove bedroom"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={br.features.join("\n")}
            onChange={(e) => updateFeatures(i, e.target.value)}
            placeholder="One feature per line (e.g. King bed)"
            rows={Math.max(1, br.features.length || 1)}
            className="w-full text-xs text-gray-600 bg-white border border-gray-200 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-[#C9A96E]/40"
          />
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={addBedroom}
          className="flex items-center gap-1 text-xs text-[#C9A96E] hover:text-[#A68B4B] font-medium px-2 py-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add Bedroom
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium px-2 py-1 disabled:opacity-50 ml-auto"
        >
          <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Arrangements"}
        </button>
      </div>
    </div>
  );
}