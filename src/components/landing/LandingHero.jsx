import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ApplyImage from "@/components/apply/ApplyImage";

// Full-viewport cinematic hero for the public landing page. Reuses the
// /apply rotation/perf pattern: only slide 0 mounts on first paint (LCP,
// eager + high priority), each next slide mounts 4s into the current one so
// it is warm by the 6s crossfade, and rotation pauses when the tab is hidden.
const ROTATION_MS = 6000;
const PRELOAD_AHEAD_MS = 4000;
const FALLBACK_HERO =
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&auto=format&fit=crop&q=80";

export default function LandingHero({ images, altTexts }) {
  const slides = images && images.length > 0 ? images : [FALLBACK_HERO];
  const alts =
    altTexts && altTexts.length > 0
      ? altTexts
      : slides.map(() => "The 100 Collection");

  const [idx, setIdx] = useState(0);
  // Only mounted slides render an <img>; starts with just slide 0 so first
  // paint only fetches the LCP image. Grows as future slides are scheduled.
  const [mounted, setMounted] = useState(() => new Set(slides.length ? [0] : []));
  const intervalRef = useRef(null);
  const preloadTimerRef = useRef(null);

  // Schedule the next slide to mount PRELOAD_AHEAD_MS into the current slide.
  useEffect(() => {
    if (slides.length <= 1) return undefined;
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
    const nextIdx = (idx + 1) % slides.length;
    preloadTimerRef.current = setTimeout(() => {
      setMounted((prev) =>
        prev.has(nextIdx) ? prev : new Set(prev).add(nextIdx)
      );
    }, PRELOAD_AHEAD_MS);
    return () => {
      if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
    };
  }, [idx, slides.length]);

  // Rotate every ROTATION_MS; pause when the tab is hidden.
  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const start = () => {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(
          () => setIdx((i) => (i + 1) % slides.length),
          ROTATION_MS
        );
      }
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    if (!document.hidden) start();
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slides.length]);

  const handleSignIn = () => base44.auth.redirectToLogin("/portal/dashboard");

  return (
    <section className="relative h-screen min-h-[600px] w-full overflow-hidden bg-[#0D1B2A]">
      {slides.map(
        (src, i) =>
          mounted.has(i) && (
            <div
              key={`${src}-${i}`}
              className={`absolute inset-0 transition-opacity ease-in-out duration-[1200ms] ${
                i === idx ? "opacity-100" : "opacity-0"
              }`}
            >
              <ApplyImage
                src={src}
                alt={alts[i] || "The 100 Collection"}
                aspect="16/9"
                widths={[800, 1280, 1920]}
                quality={i === 0 ? 80 : 70}
                eager={i === 0}
                priority={i === 0}
                className="w-full h-full"
                imgClassName="w-full h-full object-cover"
              />
            </div>
          )
      )}

      {/* Bottom-up navy gradient overlay for legibility over any photo */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0D1B2A] via-[#0D1B2A]/40 to-[#0D1B2A]/10" />

      {/* Nav, transparent over hero */}
      <nav className="absolute top-0 left-0 right-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="font-serif text-lg tracking-wide text-[#C9A96E]">
            The 100 Collection
          </Link>
          <button
            onClick={handleSignIn}
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C9A96E]/90 hover:text-[#C9A96E] transition-colors"
          >
            Partner Sign In
          </button>
        </div>
      </nav>

      {/* Centered hero content */}
      <div className="relative h-full max-w-4xl mx-auto px-6 flex flex-col items-center justify-center text-center">
        <div className="text-[12px] font-semibold text-[#C9A96E] uppercase tracking-[0.34em] mb-7">
          The 100 Collection
        </div>
        <h1
          className="font-serif text-white leading-[1.05] tracking-[-0.01em]"
          style={{ fontSize: "clamp(40px, 7vw, 80px)" }}
        >
          By reputation. By invitation. By The 100 Collection.
        </h1>
        <p className="mt-7 max-w-2xl text-[#FAFAF8]/85 text-lg sm:text-xl font-light leading-relaxed">
          A curated network of premier vacation rental brands and the
          distinctive homes they manage.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-5">
          <Link
            to="/apply"
            className="group inline-flex items-center gap-2 bg-[#0D1B2A] border border-[#C9A96E] text-[#C9A96E] px-9 py-3.5 rounded-sm text-sm font-semibold uppercase tracking-[0.12em] hover:bg-[#C9A96E] hover:text-[#0D1B2A] transition-colors"
          >
            Apply to Join <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={handleSignIn}
            className="text-[#FAFAF8]/80 hover:text-white text-sm font-light tracking-wide transition-colors"
          >
            Existing partner? Sign in <span className="text-[#C9A96E]">→</span>
          </button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <span className="text-[10px] text-white/55 uppercase tracking-[0.22em]">
          Explore the Collection
        </span>
        <ChevronDown className="w-4 h-4 text-white/55 animate-bounce" />
      </div>
    </section>
  );
}