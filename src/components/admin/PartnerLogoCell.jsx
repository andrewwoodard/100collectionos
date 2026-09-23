import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ImagePlus, Loader2 } from "lucide-react";

// Inline logo uploader for the admin Partners table. Renders the partner's
// current logo (or a placeholder) with a small upload button that writes
// logo_url back to the Partner record.
export default function PartnerLogoCell({ partner, onUpdated }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const logo = partner?.logo_url;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !partner?.id) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      await base44.entities.Partner.update(partner.id, { logo_url: file_url });
      onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {logo ? (
        <img
          src={logo}
          alt=""
          className="w-8 h-8 object-contain rounded bg-white border border-slate-100"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-slate-300">
          <ImagePlus className="w-3.5 h-3.5" />
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !partner?.id}
        className="text-[11px] text-[#C9A96E] hover:underline disabled:opacity-50 inline-flex items-center gap-1"
      >
        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : logo ? "Change" : "Upload"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}