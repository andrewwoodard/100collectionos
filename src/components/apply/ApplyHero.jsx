import React from "react";

export default function ApplyHero({ eyebrow, heading, subheading }) {
  return (
    <div className="relative bg-[#0D1B2A] overflow-hidden">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 50%, #C9A96E 0%, transparent 60%), radial-gradient(circle at 70% 20%, #C9A96E 0%, transparent 50%)",
        }}
      />
      <div className="relative max-w-3xl mx-auto px-6 pt-16 pb-20 text-center">
        {eyebrow && (
          <div className="inline-block text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] border border-[#C9A96E]/30 rounded-full px-4 py-1.5 mb-8">
            {eyebrow}
          </div>
        )}
        <h1 className="text-4xl sm:text-5xl font-medium text-white mb-6 leading-tight font-serif" style={{ letterSpacing: "-0.01em" }}>
          {heading}
        </h1>
        <p className="text-[#9AAAB8] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">{subheading}</p>
      </div>
    </div>
  );
}