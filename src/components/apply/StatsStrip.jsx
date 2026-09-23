import React from "react";

const STATS = [
  { value: "91+", label: "Partners" },
  { value: "79+", label: "Destinations" },
  { value: "One", label: "Curated Collection" },
];

export default function StatsStrip() {
  return (
    <div className="border-t border-[#E8DDD0]">
      <div className="max-w-4xl mx-auto px-6 py-14 grid grid-cols-3 gap-6 text-center">
        {STATS.map((s) => (
          <div key={s.label}>
            <div className="font-serif text-3xl sm:text-4xl text-[#0D1B2A]">{s.value}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#B0A090] mt-1.5">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}