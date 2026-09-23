import React from "react";
import { BookOpen, Users, Bell } from "lucide-react";
import ApplyImage from "./ApplyImage";

const PILLARS = [
  {
    icon: BookOpen,
    title: "Editorial presentation",
    body: "A magazine-quality feature written by our team",
  },
  {
    icon: Users,
    title: "Curated guests",
    body: "Bookings from travelers who value what you've built",
  },
  {
    icon: Bell,
    title: "Concierge support",
    body: "A team that treats your home like their own",
  },
];

// Homeowner editorial shell: aspirational hero and belonging copy.
// No partner logos or social proof on this track.
export default function HomeownerEditorial({ heroImage }) {
  return (
    <>
      <section className="relative h-[55vh] min-h-[400px] w-full overflow-hidden bg-[#0D1B2A]">
        <ApplyImage
          src={heroImage}
          alt=""
          aspect="16/9"
          widths={[800, 1280, 1920]}
          quality={80}
          eager
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D1B2A]/70 via-transparent to-[#0D1B2A]/20" />
        <div className="relative h-full flex items-end justify-center pb-14 px-6">
          <h2 className="font-serif text-white text-4xl sm:text-5xl text-center">A place in the Collection</h2>
        </div>
      </section>

      <section className="bg-[#FAFAF8] pt-14 pb-6">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-base text-[#5B4A36] leading-[1.9]">
            The 100 Collection is a curated network of the most distinctive homes in
            America. Every home tells a story of the family that built it, the guests
            who return every year, and the memories that make it feel like more than a
            rental. We're building something rare, and we'd love to hear about your home.
          </p>
        </div>

        <div className="max-w-4xl mx-auto px-6 mt-14 grid grid-cols-1 sm:grid-cols-3 gap-10">
          {PILLARS.map((p) => (
            <div key={p.title} className="text-center">
              <div className="w-11 h-11 mx-auto mb-4 rounded-full border border-[#C9A96E]/40 flex items-center justify-center">
                <p.icon className="w-5 h-5 text-[#C9A96E]" />
              </div>
              <div className="font-serif text-lg text-[#0D1B2A] mb-1.5">{p.title}</div>
              <p className="text-sm text-[#8B7355] leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}