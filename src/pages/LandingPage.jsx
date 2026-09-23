import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useApplyPageMedia } from "@/hooks/useApplyPageMedia";
import LandingHero from "@/components/landing/LandingHero";
import LandingFeaturedProperties from "@/components/landing/LandingFeaturedProperties";
import ClosingImage from "@/components/apply/ClosingImage";

const STATS = [
  { value: "91+", label: "Partners" },
  { value: "79+", label: "Destinations" },
  { value: "One", label: "Curated Collection" },
];

const MAIN_SITE = "https://www.theonehundredcollection.com";

export default function LandingPage() {
  usePageMeta("landing");
  const media = useApplyPageMedia();

  const heroImages =
    media.hero_rotation_urls && media.hero_rotation_urls.length
      ? media.hero_rotation_urls
      : null;
  const heroAlts = media.hero_rotation_alt_texts;
  const closingImage = media.closing_editorial_url;
  const closingQuote =
    media.closing_editorial_quote || "Every home is a story worth telling.";

  return (
    <div className="min-h-screen bg-white font-sans">
      <LandingHero images={heroImages} altTexts={heroAlts} />

      {/* Stats strip */}
      <section className="bg-[#FAFAF8] border-t border-[#E8DDD0]">
        <div className="max-w-4xl mx-auto px-6 py-14 grid grid-cols-3 gap-6 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="font-serif text-3xl sm:text-4xl text-[#0D1B2A]">
                {s.value}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#B0A090] mt-1.5">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Editorial paragraph */}
      <section className="bg-[#FAFAF8] pt-10 pb-24 px-6">
        <div className="max-w-[600px] mx-auto text-center">
          <h2 className="font-serif text-3xl sm:text-4xl text-[#0D1B2A] leading-tight mb-6">
            The most distinctive vacation rentals in America.
          </h2>
          <p className="text-[#2A2A2A] text-lg leading-relaxed">
            The 100 Collection is a curated network of premier vacation rental
            brands and the distinctive homes they manage. Every partner is
            chosen for what makes them exceptional. Every home is presented like
            a feature story, not a listing.
          </p>
        </div>
      </section>

      {/* Featured properties */}
      <LandingFeaturedProperties media={media} />

      {/* CTA repeat */}
      <section className="bg-[#FAFAF8] py-24 px-6 text-center border-t border-[#E8DDD0]">
        <h2 className="font-serif text-4xl sm:text-5xl text-[#0D1B2A] mb-9">
          Join The Collection.
        </h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link
            to="/apply"
            className="inline-flex items-center gap-2 bg-[#0D1B2A] border border-[#C9A96E] text-[#C9A96E] px-9 py-3.5 rounded-sm text-sm font-semibold uppercase tracking-[0.12em] hover:bg-[#C9A96E] hover:text-[#0D1B2A] transition-colors"
          >
            Apply to Join <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href={MAIN_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#0D1B2A] underline decoration-[#C9A96E] decoration-1 underline-offset-4 hover:text-[#A68B4B] text-sm tracking-wide transition-colors"
          >
            Learn more
          </a>
        </div>
      </section>

      {/* Closing editorial image + quote */}
      {closingImage && (
        <ClosingImage
          image={closingImage}
          alt="The 100 Collection"
          quote={closingQuote}
        />
      )}

      {/* Footer */}
      <footer className="bg-[#0D1B2A] py-10 px-6 text-center">
        <div className="font-serif text-lg text-[#C9A96E] mb-2">
          The 100 Collection
        </div>
        <div className="text-[#FAFAF8]/55 text-xs">
          Questions?{" "}
          <a
            href="mailto:hello@theonehundredcollection.com"
            className="text-[#C9A96E]/90 hover:text-[#C9A96E] transition-colors"
          >
            hello@theonehundredcollection.com
          </a>
        </div>
      </footer>
    </div>
  );
}