import React from "react";
import { WHAT_NEXT } from "./joinContent";

// Per-segment 3-step "what happens next" timeline.
export default function JoinWhatNext({ segment }) {
  const steps = segment && WHAT_NEXT[segment] ? WHAT_NEXT[segment] : [];
  if (!steps.length) return null;

  return (
    <section className="bg-[#FAFAF8] py-16">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-3">
            What happens next
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl text-[#0D1B2A]">
            From application to belonging
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="relative bg-white border border-[#E8DDD0] rounded-2xl p-6 shadow-sm"
              >
                <div className="absolute top-5 right-5 font-serif text-3xl text-[#E8DDD0]">
                  {i + 1}
                </div>
                <div className="w-10 h-10 bg-[#FBF6EF] rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-[#C9A96E]" />
                </div>
                <div className="text-base font-semibold text-[#0D1B2A] mb-1">{s.title}</div>
                <div className="text-sm text-[#8B7355] leading-relaxed">{s.body}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}