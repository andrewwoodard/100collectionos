import React from "react";

const STAGE_COLORS = ["#0D1B2A", "#1e3a5f", "#C9A96E", "#8b5cf6", "#10b981"];

export default function FunnelChart({ stages, total }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Apply Funnel</h3>
        <span className="text-xs text-gray-400">{total} unique sessions</span>
      </div>
      <div className="space-y-3">
        {stages.map((s, i) => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700">{s.label}</span>
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-gray-900">{s.count}</span>
                {i > 0 && <span className="ml-2 text-gray-400">({s.stepPct}% of prev)</span>}
              </span>
            </div>
            <div className="h-7 bg-gray-50 rounded-md overflow-hidden">
              <div
                className="h-full rounded-md transition-all duration-500"
                style={{ width: `${Math.max(2, (s.count / max) * 100)}%`, background: STAGE_COLORS[i] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}