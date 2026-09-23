import React from "react";
import { SEGMENTS } from "./joinContent";

// Inline segmentation: three subtle pill tabs that act as a filter, not a fork.
// Selecting one updates the value props and form below via React state.
export default function JoinSegmentation({ segment, onSelect }) {
  return (
    <section className="bg-[#FAFAF8] py-16">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="font-serif text-2xl sm:text-3xl text-[#0D1B2A] mb-2">
          Which best describes you?
        </h2>
        <p className="text-sm text-[#8B7355] mb-8">
          Select your path to see how belonging works for you.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {SEGMENTS.map((s) => {
            const Icon = s.icon;
            const active = segment === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-medium transition-all ${
                  active
                    ? "bg-[#0D1B2A] text-white border-[#0D1B2A] shadow-sm"
                    : "bg-white text-[#0D1B2A] border-[#E8DDD0] hover:border-[#C9A96E] hover:text-[#C9A96E]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {s.label}
              </button>
            );
          })}
        </div>
        {!segment && (
          <p className="mt-6 text-xs text-[#B0A090] italic">
            Select above to see how it works for you.
          </p>
        )}
      </div>
    </section>
  );
}