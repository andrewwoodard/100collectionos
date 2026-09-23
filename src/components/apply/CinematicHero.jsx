import React, { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import ApplyImage from "./ApplyImage";

// Full-bleed cinematic hero. Rotates through partner property photography
// with a slow crossfade every 6 seconds.
//
// First-paint performance strategy (reversed from the old "preload all" model):
//  - On mount, ONLY slide 0 is mounted and loaded (eager + high fetchpriority).
//    It is the LCP element; nothing else competes with it on first paint.
//  - A slide only mounts once it's been "scheduled" — initially just slide 0,
//    then each next slide 4 seconds into the current one (PRELOAD_AHEAD_MS),
//    so it's warm by the 6-second rotation tick without blocking first paint.
//  - The rotation only starts once slide 0 has fired onLoad.
//  - Rotation pauses when the tab is hidden (Page Visibility API).
//  - Images stack absolutely over a fixed-height navy container, so different
//    native aspect ratios never cause layout shift — only opacity crossfades.
const ROTATION_MS = 6000;
const PRELOAD_AHEAD_MS = 4000;

export default function CinematicHero({
  images,
  altTexts,
  heading = "By reputation. By invitation. By The 100 Collection.",
  eyebrow = "Partner Application",
  scrollHint = "Choose your path",
  subheading,
}) {
  const slides = images && images.length > 0 ? images : [];
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(() => new Set());
  // Only mounted slides render an <img>; starts with just slide 0 so first
  // paint only fetches the LCP image. Grows as future slides are scheduled.
  const [mounted, setMounted] = useState(() => new Set(slides.length ? [0] : []));
  const intervalRef = useRef(null);
  const preloadTimerRef = useRef(null);

  const markLoaded = (i) =>
    setLoaded((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });

  // Schedule the next slide to mount + load PRELOAD_AHEAD_MS into the current
  // slide. Runs on mount (schedules slide 1) and whenever idx changes.
  useEffect(() => {
    if (slides.length <= 1) return undefined;
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
    const nextIdx = (idx + 1) % slides.length;
    preloadTimerRef.current = setTimeout(() => {
      setMounted((prev) => {
        if (prev.has(nextIdx)) return prev;
        const next = new Set(prev);
        next.add(nextIdx);
        return next;
      });
    }, PRELOAD_AHEAD_MS);
    return () => {
      if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
    };
  }, [idx, slides.length]);

  // Start rotating once slide 0 is loaded (and there's more than one).
  const firstLoaded = loaded.has(0) || slides.length <= 1;

  useEffect(() => {
    if (!firstLoaded || slides.length <= 1) return undefined;
    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => setIdx((i) => (i + 1) % slides.length), ROTATION_MS);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    if (!document.hidden) start();
    const handleVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [firstLoaded, slides.length]);

  return (
    <section className="relative h-[85vh] min-h-[540px] w-full overflow-hidden bg-[#0D1B2A]">
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
                alt={(altTexts && altTexts[i]) || "The 100 Collection"}
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

      {/* Legibility gradient, bottom-up */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0D1B2A]/85 via-[#0D1B2A]/15 to-[#0D1B2A]/35" />

      <div className="relative h-full max-w-4xl mx-auto px-6 flex flex-col items-center justify-center text-center">
        <h1
          className="font-serif text-white leading-[1.06] tracking-[-0.01em] max-w-4xl"
          style={{ fontSize: "clamp(40px, 6.2vw, 76px)" }}
        >
          {heading}
        </h1>
        {eyebrow && (
          <div className="mt-8 text-[11px] font-semibold text-[#C9A96E] uppercase tracking-[0.3em]">
            {eyebrow}
          </div>
        )}
        {subheading && (
          <p className="mt-6 max-w-2xl text-white/80 text-lg sm:text-xl font-light leading-relaxed">
            {subheading}
          </p>
        )}
      </div>

      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <span className="text-[10px] text-white/60 uppercase tracking-[0.22em]">{scrollHint}</span>
        <ChevronDown className="w-4 h-4 text-white/60 animate-bounce" />
      </div>
    </section>
  );
}