import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { invalidatePageMetaCache } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ExternalLink, ImageIcon, Upload } from "lucide-react";

const PRESET_KEYS = [
  { key: "apply", label: "Apply Chooser (/apply)" },
  { key: "apply_property_manager", label: "Apply — Property Manager" },
  { key: "apply_homeowner", label: "Apply — Homeowner" },
  { key: "apply_existing_partner", label: "Apply — Existing Partner" },
  { key: "landing", label: "Landing Page (/)" },
  { key: "careers", label: "Public Careers (/careers)" },
];

export default function AdminPageMeta() {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      update("og_image_url", file_url);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const { data: metas = [], isLoading } = useQuery({
    queryKey: ["page-metas"],
    queryFn: () => base44.entities.PageMeta.list("-updated_date", 100),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        return base44.entities.PageMeta.update(data.id, {
          title: data.title,
          description: data.description,
          og_image_url: data.og_image_url,
          og_image_alt: data.og_image_alt,
          canonical_url: data.canonical_url,
        });
      }
      return base44.entities.PageMeta.create({
        page_key: data.page_key,
        page_label: data.page_label,
        title: data.title,
        description: data.description,
        og_image_url: data.og_image_url,
        og_image_alt: data.og_image_alt,
        canonical_url: data.canonical_url,
      });
    },
    onSuccess: () => {
      invalidatePageMetaCache();
      queryClient.invalidateQueries({ queryKey: ["page-metas"] });
    },
  });

  const metaByKey = {};
  for (const m of metas) metaByKey[m.page_key] = m;

  const handleSelect = (preset) => {
    const existing = metaByKey[preset.key] || {};
    setDraft({
      id: existing.id || null,
      page_key: preset.key,
      page_label: preset.label,
      title: existing.title || "",
      description: existing.description || "",
      og_image_url: existing.og_image_url || "",
      og_image_alt: existing.og_image_alt || "",
      canonical_url: existing.canonical_url || "",
    });
    setSelectedKey(preset.key);
  };

  const handleSave = () => {
    saveMutation.mutate(draft);
  };

  const update = (field, value) => setDraft(d => ({ ...d, [field]: value }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading page meta...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Page list */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">Marketing Pages</div>
        {PRESET_KEYS.map(preset => {
          const has = !!metaByKey[preset.key];
          return (
            <button
              key={preset.key}
              onClick={() => handleSelect(preset)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                selectedKey === preset.key
                  ? "bg-[#0D1B2A] text-white"
                  : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              <span className="truncate">{preset.label}</span>
              {has && (
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ml-2 ${
                  selectedKey === preset.key ? "bg-[#C9A96E]" : "bg-green-400"
                }`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <div>
        {!draft ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ImageIcon className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Select a page on the left to manage its meta information</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-5">
            <div>
              <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">
                {draft.id ? "Editing" : "New"}
              </div>
              <h3 className="text-lg font-light text-[#0D1B2A]">{draft.page_label}</h3>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Page Title</Label>
              <Input
                value={draft.title}
                onChange={e => update("title", e.target.value)}
                placeholder="The 100 Collection — Apply to Join"
              />
              <p className="text-xs text-slate-400">Browser tab title and social share title</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Meta Description</Label>
              <Textarea
                value={draft.description}
                onChange={e => update("description", e.target.value)}
                placeholder="A curated collection of luxury vacation rentals. Apply to join The 100 Collection."
                rows={3}
              />
              <p className="text-xs text-slate-400">Search result snippet and social share description</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Social Share Image</Label>
              <div className="flex gap-2">
                <Input
                  value={draft.og_image_url}
                  onChange={e => update("og_image_url", e.target.value)}
                  placeholder="https://media.base44.com/images/..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("meta-image-upload").click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload
                </Button>
                <input
                  id="meta-image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-slate-400">Recommended 1200x630px. Used for og:image and twitter:image.</p>
              {draft.og_image_url && (
                <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                  <img src={draft.og_image_url} alt="Preview" className="w-full h-auto" onError={(e) => e.target.style.display = "none"} />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Image Alt Text</Label>
              <Input
                value={draft.og_image_alt}
                onChange={e => update("og_image_alt", e.target.value)}
                placeholder="The 100 Collection luxury vacation home"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Canonical URL (optional)</Label>
              <Input
                value={draft.canonical_url}
                onChange={e => update("canonical_url", e.target.value)}
                placeholder="https://theonehundredcollection.com/apply"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="bg-[#0D1B2A] hover:bg-[#1E293B]"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Meta
              </Button>
              {saveMutation.isSuccess && (
                <span className="text-sm text-green-600">Saved</span>
              )}
              {draft.canonical_url && (
                <a href={draft.canonical_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 ml-auto">
                  View Page <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}