import React, { useState } from "react";

// Lazy image with a blur-up reveal: a soft tinted placeholder shows until the
// photo loads, so slow connections never see a blank gap.
export default function FadeImage({ src, alt = "", className = "", imgClassName = "", eager = false }) {
  const [loaded, setLoaded] = useState(false);

  if (!src) return <div className={`${className} bg-[#0D1B2A]/10`} />;

  return (
    <div className={`${className} overflow-hidden bg-[#0D1B2A]/10`}>
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-all duration-700 ${
          loaded ? "opacity-100 blur-0" : "opacity-0 blur-md"
        } ${imgClassName}`}
      />
    </div>
  );
}