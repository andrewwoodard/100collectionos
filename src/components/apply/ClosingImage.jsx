import React from "react";
import ApplyImage from "./ApplyImage";

// Full-width editorial closing image with a serif quote overlay. Below the
// fold → lazy-loaded, hero-grade widths, quality 70.
export default function ClosingImage({ image, alt, quote }) {
  return (
    <section className="relative h-[60vh] min-h-[420px] w-full overflow-hidden bg-[#0D1B2A]">
      <ApplyImage
        src={image}
        alt={alt || "The 100 Collection"}
        aspect="16/9"
        widths={[800, 1280, 1920]}
        quality={70}
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-[#0D1B2A]/45" />
      <div className="relative h-full flex items-center justify-center px-6">
        <p className="font-serif text-white text-3xl sm:text-5xl text-center leading-tight max-w-3xl">
          {quote || "Every home is a story worth telling."}
        </p>
      </div>
    </section>
  );
}