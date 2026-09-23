import React, { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

// One media slot row in the Apply Page Media admin panel:
// preview thumbnail, URL input, optional alt input, upload and remove.
export default function MediaSlotRow({ label, url, alt, showAlt = true, onUrlChange, onAltChange, onRemove }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      onUrlChange((res && res.file_url) || "");
    } catch (err) {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{label}</div>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-[200px] h-[150px] flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
          {url ? (
            <img src={url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-slate-400">No photo set</span>
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <Input
            placeholder="Image URL"
            value={url || ""}
            onChange={(e) => onUrlChange(e.target.value)}
          />
          {showAlt && (
            <Input
              placeholder="Alt text"
              value={alt || ""}
              onChange={(e) => onAltChange(e.target.value)}
            />
          )}
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload image
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={onRemove}
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Remove
            </Button>
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}