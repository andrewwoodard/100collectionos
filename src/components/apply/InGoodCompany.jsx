import React from "react";
import { ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ApplyImage from "./ApplyImage";

// VRM social proof: "In good company" partner strip plus featured Collection
// property cards. Shown only on the property manager track.
export default function InGoodCompany({ partnerStrip, featuredProperties, fallbackImage }) {
  const featured = Array.isArray(featuredProperties) ? featuredProperties : [];
  return (
    <section className="bg-[#FAFAF8] pt-16 pb-4">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-3">
            Where premier managers grow with us
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#0D1B2A]">In good company</h2>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-3 mb-14">
          {partnerStrip.map((p, i) => (
            <React.Fragment key={p.name}>
              {i > 0 && <span className="hidden md:inline-block w-px h-4 bg-[#E8DDD0]" aria-hidden="true" />}
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => base44.analytics.track({ eventName: "apply_partner_strip_click", properties: { partner_name: p.name } })}
                  className="group/name inline-flex items-center gap-1 font-serif text-lg text-[#0D1B2A]/80 whitespace-nowrap cursor-pointer hover:text-[#0D1B2A] hover:underline decoration-[#C9A96E] decoration-1 underline-offset-4"
                >
                  {p.name}
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover/name:opacity-100 transition-opacity" aria-hidden="true" />
                </a>
              ) : (
                <span className="font-serif text-lg text-[#0D1B2A]/80 whitespace-nowrap">{p.name}</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {featured.length > 0 && (
          <div className="max-w-3xl mx-auto">
            <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[#B0A090] mb-6">
              Featured in the Collection
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {featured.map((f) => {
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
                      <div className="font-serif text-lg text-[#0D1B2A] leading-snug">{f.propertyName}</div>
                      {f.partnerName && <div className="text-xs text-[#A68B4B] mt-0.5">{f.partnerName}</div>}
                      {f.market && <div className="text-xs text-[#8B7355] mt-0.5">{f.market}</div>}
                    </div>
                  </>
                );
                if (f.url) {
                  return (
                    <a
                      key={`${f.partnerName}-${f.propertyName}`}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => base44.analytics.track({ eventName: "apply_featured_property_click", properties: { property_name: f.propertyName } })}
                      className="group bg-white border border-[#E8DDD0] rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-[#C9A96E] transition-all block"
                    >
                      {card}
                    </a>
                  );
                }
                return (
                  <div
                    key={`${f.partnerName}-${f.propertyName}`}
                    className="bg-white border border-[#E8DDD0] rounded-xl overflow-hidden shadow-sm"
                  >
                    {card}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}