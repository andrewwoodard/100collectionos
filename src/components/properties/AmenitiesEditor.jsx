import React, { useState } from "react";
import { Plus, X } from "lucide-react";

const AMENITY_OPTIONS = [
  "Private Pool", "Hot Tub", "Chef's Kitchen", "Ocean View", "Mountain View",
  "Private Beach", "Home Theater", "Gym", "Sauna", "Tennis Court", "Game Room",
  "EV Charger", "Fast WiFi", "Air Conditioning", "Fireplace", "BBQ",
  "Outdoor Dining", "Concierge", "Elevator", "Pet Friendly",
];

const norm = (s) => (s || "").toLowerCase().trim();

export default function AmenitiesEditor({ value = [], onChange }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const amenities = Array.isArray(value) ? value : [];
  const selectedSet = new Set(amenities.map(norm));
  const standardSet = new Set(AMENITY_OPTIONS.map(norm));
  const customAmenities = amenities.filter((a) => !standardSet.has(norm(a)));

  const toggleAmenity = (a) => {
    if (selectedSet.has(norm(a))) {
      onChange(amenities.filter((x) => norm(x) !== norm(a)));
    } else {
      onChange([...amenities, a]);
    }
  };

  const addCustom = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Amenity name cannot be empty");
      return;
    }
    if (trimmed.length > 40) {
      setError("Amenity name is too long (max 40 characters)");
      return;
    }
    if (selectedSet.has(norm(trimmed))) {
      setError("That amenity is already in your list");
      return;
    }
    onChange([...amenities, trimmed]);
    setInput("");
    setError("");
  };

  const removeCustom = (a) => {
    onChange(amenities.filter((x) => x !== a));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {AMENITY_OPTIONS.map((a) => {
          const selected = selectedSet.has(norm(a));
          return (
            <button
              key={a}
              type="button"
              onClick={() => toggleAmenity(a)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                selected
                  ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {a}
            </button>
          );
        })}
        {customAmenities.map((a) => (
          <span
            key={a}
            className="group inline-flex items-center gap-1 text-xs italic px-3 py-1.5 rounded-full border border-[#C9A96E]/40 bg-[#C9A96E]/5 text-[#8B6F3A]"
          >
            {a}
            <span className="text-[9px] uppercase tracking-wider text-[#C9A96E]/60 not-italic opacity-0 group-hover:opacity-100 transition-opacity">
              custom
            </span>
            <button
              type="button"
              onClick={() => removeCustom(a)}
              className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-[#C9A96E]/20 text-[#C9A96E] transition-all opacity-0 group-hover:opacity-100"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add a custom amenity..."
            maxLength={60}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
          />
          <button
            type="button"
            onClick={addCustom}
            className="flex items-center gap-1 text-sm font-medium text-[#C9A96E] hover:text-[#A68B4B] px-3 py-2 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}