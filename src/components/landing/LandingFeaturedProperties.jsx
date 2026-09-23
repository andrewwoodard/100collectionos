import React from "react";
import { base44 } from "@/api/base44Client";
import ApplyImage from "@/components/apply/ApplyImage";

// Featured Collection properties strip for the public landing page.
// Pulls the three admin-curated featured_property_* slots from ApplyPageMedia
// (same source as /apply) and renders them as editorial cards that link to
// the property's page on theonehundredcollection.com in a new tab.
function buildFeatured(media) {
  return [1, 2, 3]
    .map((n) => ({
      url: media[`featured_property_${n}_url`],
      name: media[`featured_property_${n}_name`],
      partnerName: media[`featured_property_${n}_partner_name`],
      market: media[`featured_property_${n}_market`],
      photo: media[`featured_property_${n}_photo_url`],
      alt: media[`featured_property_${n}_photo_alt`],
    }))
    .filter((f) => f.url || f.name);
}

export default function LandingFeaturedProperties({ media }) {
  const featured = buildFeatured(media);
  if (featured.length === 0) return null;

  return (
    <section className="bg-[#FAFAF8] pt-16 pb-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-9">
          <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-3">
            In the Collection
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#0D1B2A]">
            Homes worth the story
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
          {featured.map((f) => {
            const card = (
              <>
                {f.photo ? (
                  <ApplyImage
                    src={f.photo}
                    alt={f.alt || f.name || "The 100 Collection"}
                    aspect="4/3"
                    widths={[400]}
                    quality={70}
                    className="w-full aspect-[4/3]"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] bg-[#0D1B2A] flex items-center justify-center px-4">
                    <span className="font-serif text-center text-white/90 text-lg leading-snug">
                      {f.name || "The 100 Collection"}
                    </span>
                  </div>
                )}
                <div className="p-4">
                  <div className="font-serif text-lg text-[#0D1B2A] leading-snug">
                    {f.name}
                  </div>
                  {f.partnerName && (
                    <div className="text-xs text-[#A68B4B] mt-0.5">
                      {f.partnerName}
                    </div>
                  )}
                  {f.market && (
                    <div className="text-xs text-[#8B7355] mt-0.5">{f.market}</div>
                  )}
                </div>
              </>
            );
            if (f.url) {
              return (
                <a
                  key={`${f.partnerName}-${f.name}`}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    base44.analytics.track({
                      eventName: "landing_featured_property_click",
                      properties: { property_name: f.name },
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
                key={`${f.partnerName}-${f.name}`}
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