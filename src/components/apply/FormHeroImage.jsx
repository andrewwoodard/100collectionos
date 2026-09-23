import React from "react";
import ApplyImage from "./ApplyImage";

// Optional large photo above an application form. Renders nothing when
// no admin hero has been set in the Apply Page Media panel. Below the fold
// → lazy-loaded.
export default function FormHeroImage({ image, alt }) {
  if (!image) return null;
  return (
    <section className="relative h-[38vh] min-h-[280px] w-full overflow-hidden bg-[#0D1B2A]">
      <ApplyImage
        src={image}
        alt={alt || "The 100 Collection"}
        aspect="16/9"
        widths={[800, 1280, 1920]}
        quality={70}
        className="absolute inset-0"
      />
    </section>
  );
}