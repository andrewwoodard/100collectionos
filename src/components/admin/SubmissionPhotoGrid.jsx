import React, { useState, useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

export default function SubmissionPhotoGrid({ photoUrls = [], propertyName = "Property" }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const next = useCallback(() => setLightboxIndex(i => (i + 1) % photoUrls.length), [photoUrls.length]);
  const prev = useCallback(() => setLightboxIndex(i => (i - 1 + photoUrls.length) % photoUrls.length), [photoUrls.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightboxIndex, closeLightbox, next, prev]);

  if (!photoUrls || photoUrls.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <h3 className="text-sm font-semibold text-[#0D1B2A] mb-4">Photos (0)</h3>
        <div className="flex flex-col items-center justify-center py-12 text-slate-300">
          <ImageIcon className="w-10 h-10 mb-3" />
          <p className="text-sm">No photos submitted</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-[#0D1B2A] mb-4 px-2">Photos ({photoUrls.length})</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {photoUrls.map((url, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className="aspect-square rounded-lg overflow-hidden bg-slate-100 group relative"
            >
              <img
                src={url}
                alt={`${propertyName} - Photo ${i + 1}`}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium">
            {lightboxIndex + 1} / {photoUrls.length}
          </div>

          {/* Prev */}
          {photoUrls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 transition-colors"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {/* Image */}
          <img
            src={photoUrls[lightboxIndex]}
            alt={`${propertyName} - Photo ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {photoUrls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 transition-colors"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
        </div>
      )}
    </>
  );
}