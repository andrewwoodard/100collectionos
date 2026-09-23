import React, { useState, useRef } from "react";
import { Check, X, Upload, Camera, Loader2, ChevronLeft } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";
import { uploadPropertyImage } from "@/lib/propertyImagesBlob";

// Photo review grid shown after AI extraction. Lets the partner confirm which
// scraped photos actually belong to the target property before saving.
// Slug-matched photos are pre-checked with a green badge; others are pre-unchecked
// with a yellow badge so the partner opts in.
export default function PhotoReviewGrid({ initialPhotos, onContinue, onBack }) {
  const [items, setItems] = useState(() =>
    (initialPhotos || []).map((p, i) => ({
      id: `photo-${i}`,
      url: p.url,
      confidence: p.confidence || "low",
      slugMatch: p.slugMatch || false,
      checked: true,
      removed: false,
    }))
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const replaceFileInputRef = useRef(null);

  const visibleItems = items.filter(i => !i.removed);
  const checkedCount = visibleItems.filter(i => i.checked).length;

  const toggleCheck = (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
    setError(null);
  };

  const removeItem = (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, removed: true, checked: false } : i));
    setError(null);
  };

  const handleContinue = () => {
    const selected = items.filter(i => !i.removed && i.checked).map(i => i.url);
    if (selected.length === 0) {
      setError("Please select at least one photo or upload your own.");
      return;
    }
    onContinue(selected);
  };

  const handleFiles = async (files, mode) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const uploadedUrls = [];
    for (const file of Array.from(files)) {
      try {
        const compressed = await compressImage(file);
        uploadedUrls.push(await uploadPropertyImage(compressed));
      } catch (e) {
        console.error("Upload failed:", e);
      }
    }
    setUploading(false);

    if (uploadedUrls.length === 0) {
      setError("We couldn't upload those photos. Please try again.");
      return;
    }

    if (mode === "replace") {
      onContinue(uploadedUrls);
    } else {
      const newItems = uploadedUrls.map((url, i) => ({
        id: `upload-${Date.now()}-${i}`,
        url,
        confidence: "high",
        slugMatch: true,
        checked: true,
        removed: false,
      }));
      setItems(prev => [...prev, ...newItems]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#0D1B2A] rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Camera className="w-7 h-7 text-[#C9A96E]" />
        </div>
        <h2 className="text-xl font-light text-[#0D1B2A] mb-1">Review Your Photos</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          We found {visibleItems.length} photos on your listing. Uncheck any that aren't the right property, or upload your own.
        </p>
      </div>

      {/* Photo grid */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {visibleItems.map(item => (
            <div
              key={item.id}
              className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
                item.checked ? "border-[#C9A96E]" : "border-slate-200"
              }`}
            >
              <div className="aspect-square bg-slate-100">
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              </div>

              {/* Checkbox */}
              <button
                onClick={() => toggleCheck(item.id)}
                className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-sm ${
                  item.checked
                    ? "bg-[#C9A96E] text-white"
                    : "bg-white/90 text-slate-400 hover:bg-white hover:text-[#C9A96E]"
                }`}
              >
                {item.checked && <Check className="w-4 h-4" />}
              </button>

              {/* Remove button */}
              <button
                onClick={() => removeItem(item.id)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 text-slate-500 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Confidence badge */}
              {item.slugMatch ? (
                <div className="absolute bottom-2 right-2 bg-emerald-500/90 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> Likely a match
                </div>
              ) : (
                <div className="absolute bottom-2 right-2 bg-amber-400/90 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="text-[11px] leading-none">!</span> Might be another property
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Inline error */}
      {error && (
        <div className="text-center text-sm text-red-500 mb-4">{error}</div>
      )}

      {/* Upload additional photos */}
      <div className="flex justify-center mb-6">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading..." : "Upload additional photos"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files, "additional"); e.target.value = ""; }}
        />
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
        <button
          onClick={handleContinue}
          disabled={uploading}
          className="w-full sm:w-auto text-sm bg-[#0D1B2A] text-white px-6 py-3 rounded-xl hover:bg-[#1a2e45] transition-colors disabled:opacity-50"
        >
          Continue with {checkedCount > 0 ? `${checkedCount} selected` : "selected"} photo{checkedCount !== 1 ? "s" : ""}
        </button>
        <button
          onClick={() => replaceFileInputRef.current?.click()}
          disabled={uploading}
          className="w-full sm:w-auto flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <Upload className="w-4 h-4" /> Upload my own photos instead
        </button>
        <input
          ref={replaceFileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files, "replace"); e.target.value = ""; }}
        />
      </div>

      {/* Back */}
      <div className="flex justify-center mt-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Try another URL
        </button>
      </div>
    </div>
  );
}