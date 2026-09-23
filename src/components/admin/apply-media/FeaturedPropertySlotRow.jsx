import React, { useRef, useState } from "react";
import { Upload, X, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { parseFeaturedPropertyUrl } from "@/components/apply/featuredPropertyParse";

// One curator-picked featured property slot in the Apply Page Media admin panel.
// Pasting a theonehundredcollection.com URL auto-parses the market + property
// name from the slug and best-effort scrapes the page's og:image for the hero
// photo. All auto-populated fields remain editable.
export default function FeaturedPropertySlotRow({ label, slot, onChange, onRemove }) {
  const fileRef = useRef(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const set = (field) => (e) => {
    const value = typeof e === "string" ? e : e.target.value;
    onChange({ ...slot, [field]: value });
  };

  // Auto-parse + scrape when the URL field loses focus (covers paste-then-tab).
  const handleUrlBlur = async () => {
    const url = (slot.url || "").trim();
    setScrapeMsg("");
    if (!url) return;

    // 1. Local slug parse — always runs, instant.
    const parsed = parseFeaturedPropertyUrl(url);
    const next = { ...slot, url };
    if (parsed.market && !slot.market) next.market = parsed.market;
    if (parsed.name && !slot.name) next.name = parsed.name;
    onChange(next);

    // 2. Best-effort og:image + og:title scrape.
    setScraping(true);
    try {
      const res = await base44.functions.invoke("fetchPropertyPageMetadata", { url });
      const data = (res && res.data) || {};
      const updates = { ...next };
      if (data.ogImage && !slot.photo_url) updates.photo_url = data.ogImage;
      // og:title usually reads "Abode at Buena Vista | The 100 Collection";
      // only use it as a name fallback if the slug parse came up empty.
      if (data.ogTitle && !slot.name && !parsed.name) {
        updates.name = String(data.ogTitle).split(/[|–—-]/)[0].trim();
      }
      onChange(updates);
      if (data.ogImage) {
        setScrapeMsg("Auto-fetched hero photo and details.");
      } else {
        setScrapeMsg("Couldn't auto-fetch photo, please upload one manually.");
      }
    } catch {
      setScrapeMsg("Couldn't auto-fetch photo, please upload one manually.");
    } finally {
      setScraping(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      const fileUrl = (res && res.file_url) || "";
      onChange({ ...slot, photo_url: fileUrl });
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{label}</div>

      <div className="space-y-2 mb-3">
        <Input
          placeholder="Property page URL (https://theonehundredcollection.com/destinations/...)"
          value={slot.url || ""}
          onChange={set("url")}
          onBlur={handleUrlBlur}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-3">
        <div className="w-full sm:w-[200px] h-[150px] flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
          {slot.photo_url ? (
            <img src={slot.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-slate-400">No photo set</span>
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <Input placeholder="Property name" value={slot.name || ""} onChange={set("name")} />
          <Input placeholder="Partner name" value={slot.partner_name || ""} onChange={set("partner_name")} />
          <Input placeholder="Market (e.g. Park City)" value={slot.market || ""} onChange={set("market")} />
          <Input placeholder="Alt text" value={slot.photo_alt || ""} onChange={set("photo_alt")} />
          {scrapeMsg && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {scrapeMsg}
            </p>
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
                  Upload photo
                </>
              )}
            </Button>
            {scraping && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Fetching...
              </span>
            )}
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