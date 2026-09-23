import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, ImageIcon, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ingestPropertyImages } from "@/lib/propertyImagesBlob";

const SOURCE_META = {
  img: { label: "img", color: "bg-blue-100 text-blue-700" },
  "background-image": { label: "background-image", color: "bg-purple-100 text-purple-700" },
  gallery: { label: "gallery", color: "bg-emerald-100 text-emerald-700" },
  og: { label: "open graph", color: "bg-amber-100 text-amber-700" },
  api: { label: "API", color: "bg-slate-200 text-slate-700" },
  picture: { label: "picture", color: "bg-cyan-100 text-cyan-700" },
  embedded: { label: "embedded", color: "bg-gray-100 text-gray-600" },
};

/**
 * Lets a partner rescan the listing URL for scrapable photography while
 * reviewing/editing a new property submission. Found images are selected,
 * run through the quality filter (scrapePropertyUrl commit), and the
 * passing URLs are merged into the submission's photo_urls array.
 */
export default function RescanPhotosModal({
  open,
  onClose,
  listingUrl,
  currentPhotos = [],
  onAddPhotos,
}) {
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !listingUrl) return;
    let cancelled = false;
    setLoading(true);
    setCandidates([]);
    setSelected(new Set());
    (async () => {
      try {
        const res = await base44.functions.invoke("scrapePropertyUrl", {
          url: listingUrl,
          mode: "discover",
        });
        const cands = res?.data?.data?.candidates || [];
        if (cancelled) return;
        setCandidates(cands);
        setSelected(new Set(cands.map((c) => c.url)));
      } catch (e) {
        if (!cancelled)
          toast({
            variant: "destructive",
            title: "Discovery failed",
            description: e?.message || "Could not scan the page.",
          });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, listingUrl]);

  const toggle = (url) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.url)));
  };

  const handleCommit = async () => {
    if (selected.size === 0) return;
    setCommitting(true);
    try {
      const commitRes = await base44.functions.invoke("scrapePropertyUrl", {
        url: listingUrl,
        mode: "commit",
        selected_urls: Array.from(selected),
      });
      const photoUrls = commitRes?.data?.data?.photo_urls || [];
      if (photoUrls.length === 0) {
        toast({
          title: "No photos passed filters",
          description: "Selected images were too small or duplicates.",
        });
        return;
      }

      const existingSet = new Set((currentPhotos || []).map((u) => (u || "").trim()));
      const newUrls = await ingestPropertyImages(
        photoUrls.filter((u) => u && !existingSet.has(u.trim()))
      );
      if (newUrls.length === 0) {
        toast({
          title: "Already up to date",
          description: "All selected photos are already in your gallery.",
        });
        onClose();
        return;
      }

      onAddPhotos?.(newUrls);
      toast({
        title: `Added ${newUrls.length} photo${newUrls.length !== 1 ? "s" : ""}`,
        description: `${photoUrls.length} passed the 800px quality check.`,
      });
      onClose();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Photo pull failed",
        description: e?.message || "Something went wrong.",
      });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C9A96E]" />
            Rescan Listing for Photos
          </DialogTitle>
          <DialogDescription>
            We scan the listing page for image URLs. Select the ones to pull
            into your submission — only images wider than 800px are kept.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between px-1">
          <button
            onClick={toggleAll}
            className="text-xs text-slate-600 hover:text-slate-900 underline"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <span className="text-xs text-slate-500">{selected.size} selected</span>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">Scanning the listing page…</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <ImageIcon className="w-6 h-6 mb-2" />
              <span className="text-sm">No image URLs found on this page.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {candidates.map((c) => {
                const meta = SOURCE_META[c.source] || SOURCE_META.embedded;
                const isSel = selected.has(c.url);
                return (
                  <div
                    key={c.url}
                    onClick={() => toggle(c.url)}
                    className={`relative group cursor-pointer rounded-lg border-2 overflow-hidden transition ${
                      isSel
                        ? "border-[#0D1B2A] ring-2 ring-[#0D1B2A]/20"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="aspect-square bg-slate-100 flex items-center justify-center">
                      <img
                        src={c.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.parentElement.classList.add("bg-slate-200");
                        }}
                      />
                    </div>
                    <span
                      className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    {c.confidence === "high" && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600 text-white">
                        match
                      </span>
                    )}
                    <div
                      className={`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${
                        isSel
                          ? "bg-[#0D1B2A] text-white"
                          : "bg-white/80 text-transparent border border-slate-300"
                      }`}
                    >
                      {isSel && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button
            onClick={handleCommit}
            disabled={loading || committing || selected.size === 0}
            className="bg-[#0D1B2A] text-white hover:bg-[#1a2e45]"
          >
            {committing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {committing ? "Scraping…" : `Pull ${selected.size} selected`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}