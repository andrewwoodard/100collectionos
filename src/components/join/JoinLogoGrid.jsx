import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// "Trusted by partners" logo grid. Real partner managers / hospitality groups
// only, returned by the getJoinLogoPartners backend function sorted by total
// property portfolio (desc) then name (asc) so marquee partners appear first.
// Test/sample partners are excluded server-side. Logos show greyscale by
// default and color on hover; partners without a logo fall back to a serif
// name so the grid stays filled.
export default function JoinLogoGrid() {
  const { data } = useQuery({
    queryKey: ["join-logo-partners"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getJoinLogoPartners", {});
      return res.data?.partners || [];
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });

  const visible = Array.isArray(data) ? data : [];
  if (visible.length === 0) return null;

  return (
    <section className="bg-white py-16 border-t border-[#E8DDD0]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="font-serif text-2xl sm:text-3xl text-[#0D1B2A]">
            Trusted by partners across America.
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-8 items-center">
          {visible.map((p) => (
            <div key={p.partner_name} className="flex items-center justify-center h-16">
              {p.logo_url ? (
                <img
                  src={p.logo_url}
                  alt={p.partner_name}
                  className="max-w-[120px] max-h-12 object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
                />
              ) : (
                <span className="font-serif text-lg text-[#8B7355] text-center leading-tight px-2">
                  {p.partner_name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}