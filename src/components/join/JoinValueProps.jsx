import React from "react";
import { VALUE_PROPS } from "./joinContent";

// Tailored value prop cards for the selected segment. VRM renders four cards
// (2x2 grid); homeowner renders three (3-col); existing partner renders two.
export default function JoinValueProps({ segment }) {
  const cards = segment && VALUE_PROPS[segment] ? VALUE_PROPS[segment] : [];
  if (!cards.length) return null;
  const gridCls = cards.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <section className="bg-[#FAFAF8] pb-16">
      <div className="max-w-5xl mx-auto px-6">
        <div className={`grid grid-cols-1 ${gridCls} gap-5`}>
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="bg-white border border-[#E8DDD0] rounded-2xl p-7 shadow-sm transition-all hover:shadow-md hover:border-[#C9A96E]/40"
              >
                <div className="w-10 h-10 bg-[#FBF6EF] rounded-xl flex items-center justify-center mb-5">
                  <Icon className="w-5 h-5 text-[#C9A96E]" />
                </div>
                <div className="text-base font-semibold text-[#0D1B2A] mb-2">{c.title}</div>
                <div className="text-sm text-[#8B7355] leading-relaxed">{c.body}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}