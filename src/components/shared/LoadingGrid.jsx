import React from "react";

export default function LoadingGrid({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array(count).fill(0).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="animate-shimmer h-3 w-20 rounded mb-3" />
          <div className="animate-shimmer h-7 w-16 rounded mb-2" />
          <div className="animate-shimmer h-2 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}