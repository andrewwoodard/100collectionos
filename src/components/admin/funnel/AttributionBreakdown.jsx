import React from "react";

// Bar chart of attribution sources with per-source completion rate.
// Helps answer "which content sources actually drive completions".
export default function AttributionBreakdown({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Attribution Sources</h3>
        <p className="text-sm text-gray-400">No attribution data yet.</p>
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Attribution Sources</h3>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.source}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700 truncate max-w-[60%]">{d.source}</span>
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-gray-900">{d.total}</span>
                <span className="ml-2 text-gray-400">{d.completionRate}% complete</span>
              </span>
            </div>
            <div className="h-5 bg-gray-50 rounded-md overflow-hidden flex">
              <div className="h-full bg-[#10b981]" style={{ width: `${(d.completed / max) * 100}%` }} title={`${d.completed} submitted`} />
              <div className="h-full bg-[#C9A96E]/40" style={{ width: `${((d.total - d.completed) / max) * 100}%` }} title={`${d.total - d.completed} not submitted`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-4 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#10b981] inline-block" />Submitted</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#C9A96E]/40 inline-block" />Not submitted</span>
      </div>
    </div>
  );
}