import React, { useState, useEffect } from "react";
import { sb } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, FileText, ExternalLink, Upload, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { uploadPropertyImage } from "@/lib/propertyImagesBlob";

// ── Sanity Portable Text helpers ────────────────────────────────────────────

function portableTextToPlainText(json) {
  if (!json) return "";
  try {
    const blocks = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(blocks)) return "";
    return blocks
      .map((block) => {
        if (block._type === "block" && Array.isArray(block.children)) {
          return block.children.map((child) => child.text || "").join("");
        }
        return "";
      })
      .filter((t) => t !== "")
      .join("\n\n");
  } catch {
    return "";
  }
}

function genKey() {
  return Math.random().toString(36).slice(2, 12);
}

function plainTextToPortableText(text) {
  if (!text || !text.trim()) return [];
  return text
    .split(/\n\n+/)
    .filter((p) => p.trim())
    .map((para) => ({
      _key: genKey(),
      _type: "block",
      style: "normal",
      markDefs: [],
      children: [{ _key: genKey(), _type: "span", text: para.trim(), marks: [] }],
    }));
}

// ── Component ────────────────────────────────────────────────────────────────
// Branding (name, title, logo, headshot, bio) is edited in PartnerProfileAdminCard
// and synced to vrms. This card only covers destination-page copy that is unique
// to the public destination About section.

export default function VrmContentCard({ partnerName }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vrm, isLoading } = useQuery({
    queryKey: ["vrm-content", partnerName],
    queryFn: async () => {
      const res = await sb.list("vrms", { partner_name: partnerName });
      return res?.items?.[0] || null;
    },
    enabled: !!partnerName,
  });

  const [bodyText, setBodyText] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [uploadingHero, setUploadingHero] = useState(false);

  useEffect(() => {
    if (vrm) {
      setBodyText(portableTextToPlainText(vrm.body_json));
      setHeroUrl(vrm.main_image_url || "");
    }
  }, [vrm]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await sb.update("vrms", vrm.id, data);
    },
    onSuccess: () => {
      toast({ title: "Destination page content updated." });
      queryClient.invalidateQueries({ queryKey: ["vrm-content", partnerName] });
    },
    onError: () => {
      toast({ title: "Failed to update content.", variant: "destructive" });
    },
  });

  const handleHeroUpload = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      toast({ variant: "destructive", title: "Please choose an image file" });
      return;
    }
    setUploadingHero(true);
    try {
      const file_url = await uploadPropertyImage(file);
      setHeroUrl(file_url);
      toast({ title: "Destination hero uploaded" });
    } catch (err) {
      toast({ variant: "destructive", title: "Upload failed", description: err?.message });
    } finally {
      setUploadingHero(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      body_json: JSON.stringify(plainTextToPortableText(bodyText)),
      main_image_url: heroUrl || null,
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!vrm) return null;

  const destinationUrl = vrm.first_destination_slug
    ? `https://the100collection.com/destinations/${vrm.first_destination_slug}`
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" /> Destination About Text
        </h4>
        <div className="flex items-center gap-2">
          {destinationUrl && (
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline flex items-center gap-1"
            >
              View live page <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Hero image and market description for the public destination page. Partner name, title, logo,
        and bio are edited above in Partner Profile & Branding.
      </p>

      <div className="space-y-5">
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Destination Hero Image</Label>
          <div className="flex items-start gap-3">
            {heroUrl ? (
              <img
                src={heroUrl}
                alt=""
                className="w-full max-w-md max-h-40 object-cover rounded-lg border border-gray-100"
              />
            ) : (
              <div className="w-full max-w-md h-28 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-300">
                <ImagePlus className="w-6 h-6" />
              </div>
            )}
            <div className="flex flex-col gap-1 shrink-0 pt-1">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C9A96E] hover:underline cursor-pointer">
                {uploadingHero ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {heroUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingHero}
                  onChange={handleHeroUpload}
                />
              </label>
              {heroUrl && (
                <button
                  type="button"
                  onClick={() => setHeroUrl("")}
                  className="text-[11px] text-gray-400 hover:text-red-500 text-left"
                >
                  Remove
                </button>
              )}
              <p className="text-[10px] text-gray-400">Wide hero at the top of the destination page (16:9 recommended)</p>
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Destination Text</Label>
          <Textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={7}
            placeholder="Destination description shown on the destination page"
            className="mt-1"
          />
          <p className="text-xs text-gray-400 mt-1">Separate paragraphs with a blank line.</p>
        </div>
      </div>
    </div>
  );
}
