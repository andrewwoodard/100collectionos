import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Code2, Check, ImageIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { normalizeStorageUrl } from "@/lib/supabase";

const SOURCE_META = {
  img: { label: "img", color: "bg-blue-100 text-blue-700" },
  "background-image": { label: "background-image", color: "bg-purple-100 text-purple-700" },
  gallery: { label: "gallery", color: "bg-emerald-100 text-emerald-700" },
  og: { label: "open graph", color: "bg-amber-100 text-amber-700" },
  api: { label: "API", color: "bg-slate-200 text-slate-700" },
  picture: { label: "picture", color: "bg-cyan-100 text-cyan-700" },
  embedded: { label: "embedded", color: "bg-gray-100 text-gray-600" },
};

export default function PasteHtmlModal({
  open,
  onClose,
  listingUrl,
  supabasePropertyId,
  sbQueryKey,
  currentImages = [],
}) {
  const [html, setHtml] = useState("");
  const [baseUrl, setBaseUrl] = useState(listingUrl || "");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleExtract = async () => {
    if (!html.trim()) return;
    setExtracting(true);
    setCandidates([]);
    setSelected(new Set());
    try {
      const res = await base44.functions.invoke("scrapePropertyUrl", {
        url: baseUrl || listingUrl || null,
        mode: "paste",
        html,
        page_url: baseUrl || listingUrl || null,
      });
      const cands = res?.data?.data?.candidates || [];
      setCandidates(cands);
      setSelected(new Set(cands.map((c) => c.url)));
      if (cands.length === 0) {
        toast({
          title: "No images found",
          description: "No <img> or background-image URLs found in the pasted code.",
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Extraction failed",
        description: e?.message || "Could not parse the HTML.",
      });
    } finally {
      setExtracting(false);
    }
  };

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

  const handleAdd = async () => {
    if (selected.size === 0) return;
    if (!supabasePropertyId) {
      toast({ variant: "destructive", title: "No property", description: "Save the property first." });
      return;
    }
    setSaving(true);
    try {
      const norm = (u) => (u ? normalizeStorageUrl(u) || u : u);
      const existingSet = new Set((currentImages || []).map(norm));
      const newUrls = Array.from(selected).filter((u) => !existingSet.has(norm(u)));
      if (newUrls.length === 0) {
        toast({
          title: "Already up to date",
          description: "All selected photos are already in the gallery.",
        });
        onClose();
        return;
      }

      if (supabasePropertyId) {
        const merged = [...(currentImages || []), ...newUrls];
        const updateRes = await base44.functions.invoke("supabaseProperties", {
          action: "update",
          id: supabasePropertyId,
          data: { images: merged },
        });
        if (updateRes.data?.error) throw new Error(updateRes.data.error);
        if (updateRes.data?.property) {
          queryClient.setQueryData(["supabase-property", sbQueryKey], updateRes.data.property);
        }
        queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
      } else if (listingUrl) {
        for (const u of newUrls) {
          await base44.functions.invoke("imageMetadata", {
            action: "create",
            data: { original_url: u, proppage: listingUrl, property_url: listingUrl },
          });
        }
        queryClient.invalidateQueries({ queryKey: ["property-images", listingUrl] });
      } else {
        toast({ variant: "destructive", title: "No property", description: "Save the property first." });
        return;
      }
      toast({
        title: `Added ${newUrls.length} photo${newUrls.length !== 1 ? "s" : ""}`,
        description: `${selected.size} image URL${selected.size !== 1 ? "s" : ""} extracted from the pasted code.`,
      });
      setHtml("");
      setCandidates([]);
      setSelected(new Set());
      onClose();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e?.message || "Something went wrong.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#C9A96E]" />
            Paste HTML to Grab Images
          </DialogTitle>
          <DialogDescription>
            Paste code containing &lt;img src&gt; or background-image URLs. We'll
            extract the image URLs for you to review and add.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={
              '<img src="https://site.com/photo.jpg"> or <div style="background-image:url(https://site.com/photo.jpg)">'
            }
            className="font-mono text-xs min-h-[120px]"
          />
          <div className="flex items-center gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Optional page URL to resolve relative image paths"
              className="text-xs"
            />
            <Button
              size="sm"
              onClick={handleExtract}
              disabled={extracting || !html.trim()}
            >
              {extracting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Code2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              {extracting ? "Extracting…" : "Extract images"}
            </Button>
          </div>
        </div>

        {candidates.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <button
                onClick={toggleAll}
                className="text-xs text-slate-600 hover:text-slate-900 underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <span className="text-xs text-slate-500">
                {selected.size} of {candidates.length} selected
              </span>
            </div>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
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
                          ? "border-[#0F172A] ring-2 ring-[#0F172A]/20"
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
                      <div
                        className={`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${
                          isSel
                            ? "bg-[#0F172A] text-white"
                            : "bg-white/80 text-transparent border border-slate-300"
                        }`}
                      >
                        {isSel && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {candidates.length === 0 && !extracting && html.trim() && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <ImageIcon className="w-6 h-6 mb-2" />
            <span className="text-sm">Click "Extract images" to scan the pasted code.</span>
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={saving || selected.size === 0}
            className="bg-[#0F172A] text-white hover:bg-[#1E293B]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            {saving ? "Adding…" : `Add ${selected.size} to gallery`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}