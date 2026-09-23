import React from "react";
import { base44 } from "@/api/base44Client";
import ApplyImage from "@/components/apply/ApplyImage";

// "Featured in the Collection" on /join — 3 curator-picked properties from the
// ApplyPageMedia singleton (with auto-pull backfill handled upstream by
// useApplyShowcase), each linking to its page on theonehundredcollection.com.
// Card treatment mirrors the featured grid on /apply/property-manager.
export default function JoinFeaturedProperties({ featured }) {
  const items = Array.isArray(featured) ? featured.slice(0, 3) : [];
  if (items.length === 0) return null;

  return (
    <section className="bg-[#FAFAF8] py-16 border-t border-[#E8DDD0]">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-3">
            Featured in the Collection
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#0D1B2A]">
            Homes worth the journey.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {items.map((f) => {
            const card = (
              <>
                {f.heroImage ? (
                  <ApplyImage
                    src={f.heroImage}
                    alt={f.alt || f.propertyName}
                    aspect="4/3"
                    widths={[400]}
                    quality={70}
                    className="w-full aspect-[4/3]"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] bg-[#0D1B2A] flex items-center justify-center px-4">
                    <span className="font-serif text-center text-white/90 text-lg leading-snug">
                      {f.propertyName}
                    </span>
                  </div>
                )}
                <div className="p-4">
                  <div className="font-serif text-lg text-[#0D1B2A] leading-snug">
                    {f.propertyName}
                  </div>
                  {f.partnerName && (
                    <div className="text-xs text-[#A68B4B] mt-0.5">{f.partnerName}</div>
                  )}
                  {f.market && <div className="text-xs text-[#8B7355] mt-0.5">{f.market}</div>}
                </div>
              </>
            );
            if (f.url) {
              return (
                <a
                  key={`${f.propertyName}-${f.market || "x"}`}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    base44.analytics.track({
                      eventName: "join_featured_property_click",
                      properties: { property_name: f.propertyName },
                    })
                  }
                  className="group bg-white border border-[#E8DDD0] rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-[#C9A96E] transition-all block"
                >
                  {card}
                </a>
              );
            }
            return (
              <div
                key={`${f.propertyName}-${f.market || "x"}`}
                className="bg-white border border-[#E8DDD0] rounded-xl overflow-hidden shadow-sm"
              >
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}