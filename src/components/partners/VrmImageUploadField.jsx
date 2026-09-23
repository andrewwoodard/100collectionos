import React, { useRef } from "react";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Compact image field: shows a preview swatch, a hidden file input, and a
// clear button. Calls onUpload(File) when a user picks a file and onClear()
// when they remove the current image. `uploading` controls the spinner state.
export default function ImageUploadField({ label, hint, value, uploading, onUpload, onClear }) {
  const inputRef = useRef(null);

  return (
    <div>
      <Label className="text-xs text-gray-500">{label}</Label>
      <p className="text-[11px] text-gray-400 mb-1.5">{hint}</p>

      <div className="flex items-center gap-3">
        <div
          className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          ) : value ? (
            <img src={value} alt={label} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-5 h-5 text-gray-300" />
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />

        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="gap-1.5"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {value ? "Replace" : "Upload"}
          </Button>
          {value && !uploading && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="gap-1.5 text-gray-500 hover:text-gray-700 h-7 px-2"
            >
              <X className="w-3.5 h-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}