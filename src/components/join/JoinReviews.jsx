import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Reviews section on /join. Shows featured PartnerReviews for the selected
// segment (segment 'all' is universal). Hides entirely when zero reviews
// match, so the page never shows an empty state.
export default function JoinReviews({ segment }) {
  const { data: reviews = [] } = useQuery({
    queryKey: ["partner-reviews-featured"],
    queryFn: () => base44.entities.PartnerReview.filter({ is_featured: true }, "display_order", 50),
  });

  const visible = reviews
    .filter((r) => !r.segment || r.segment === "all" || r.segment === segment)
    .slice(0, 3);

  if (visible.length === 0) return null;

  return (
    <section className="bg-white py-20 border-t border-[#E8DDD0]">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl sm:text-4xl text-[#0D1B2A]">In their words.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {visible.map((r) => (
            <div key={r.id} className="flex flex-col">
              <div className="font-serif text-5xl leading-none text-[#C9A96E] mb-1 select-none">“</div>
              <p className="font-serif italic text-xl text-[#0D1B2A] leading-snug mb-6">{r.quote}</p>
              <div className="border-t border-[#E8DDD0] pt-4 flex items-center gap-3">
                {r.attribution_photo_url ? (
                  <img
                    src={r.attribution_photo_url}
                    alt={r.attribution_name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#FBF6EF] flex items-center justify-center text-[#C9A96E] font-semibold text-sm">
                    {r.attribution_name?.[0] || "?"}
                  </div>
                )}
                <div>
                  <div className="text-sm font-semibold text-[#0D1B2A]">{r.attribution_name}</div>
                  <div className="text-xs text-[#8B7355]">
                    {r.attribution_role}
                    {r.attribution_company ? `, ${r.attribution_company}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}