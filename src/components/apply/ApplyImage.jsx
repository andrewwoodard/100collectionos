import React, { useState } from "react";
import { optimizedImageUrl, srcSet } from "@/lib/optimizedImageUrl";

// Optimized image for /apply pages. Combines, in one component:
//  - brand-navy skeleton (#0D1B2A) while the photo loads — no white flash
//  - explicit width/height from the container aspect ratio → no CLS
//  - responsive `w`-descriptor srcset at the supplied widths
//  - WebP <source> with JPEG fallback via <picture>
//  - native lazy-loading by default; hero opts into eager + high priority
//  - blur-up reveal once onLoad fires
//
// `aspect` is a "W/H" string (e.g. "4/3", "16/9") used only to set the
// width/height attributes that reserve layout space; CSS controls real size.
export default function ApplyImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  aspect = "4/3",
  widths = [400, 600, 900],
  quality = 70,
  eager = false,
  priority = false,
}) {
  const [loaded, setLoaded] = useState(false);

  if (!src) {
    return <div className={`${className} bg-[#0D1B2A]`} aria-hidden="true" />;
  }

  const [aw, ah] = parseAspect(aspect);
  const webpSrcSet = srcSet(src, widths, { quality, format: "webp" });
  const jpgSrcSet = srcSet(src, widths, { quality });
  const fallbackSrc = optimizedImageUrl(src, { quality });

  return (
    <div className={`${className} overflow-hidden bg-[#0D1B2A]`}>
      <picture>
        {webpSrcSet && <source type="image/webp" srcSet={webpSrcSet} />}
        {jpgSrcSet && <source type="image/jpeg" srcSet={jpgSrcSet} />}
        <img
          src={fallbackSrc}
          alt={alt}
          width={aw}
          height={ah}
          loading={eager ? "eager" : "lazy"}
          // React 18 passes unknown lowercase attrs through to the DOM.
          fetchpriority={priority ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-700 ${
            loaded ? "opacity-100 blur-0" : "opacity-0 blur-md"
          } ${imgClassName}`}
        />
      </picture>
    </div>
  );
}

function parseAspect(aspect) {
  if (typeof aspect !== "string") return [4, 3];
  const parts = aspect.split("/").map((p) => parseInt(p, 10));
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts;
  return [4, 3];
}