import React, { useState, useEffect } from "react";
import { sb } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import ImageUploadField from "./VrmImageUploadField";

// ── Sanity Portable Text helpers ────────────────────────────────────────────

function portableTextToPlainText(json) {
  if (!json) return "";
  try {
    const blocks = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(blocks)) return "";
    return blocks
      .map(block => {
        if (block._type === "block" && Array.isArray(block.children)) {
          return block.children.map(child => child.text || "").join("");
        }
        return "";
      })
      .filter(t => t !== "")
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
    .filter(p => p.trim())
    .map(para => ({
      _key: genKey(),
      _type: "block",
      style: "normal",
      markDefs: [],
      children: [{ _key: genKey(), _type: "span", text: para.trim(), marks: [] }],
    }));
}

// ── Component ────────────────────────────────────────────────────────────────

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

  const [form, setForm] = useState({
    doyen_name: "",
    doyen_title: "",
    doyen_short_description: "",
    doyen_text: "",
    body_text: "",
    doyen_image_url: "",
    logo_image_url: "",
  });
  const [uploading, setUploading] = useState({ doyen: false, logo: false });

  const handleImageUpload = async (field, file) => {
    if (!file) return;
    const key = field === "doyen_image_url" ? "doyen" : "logo";
    setUploading(s => ({ ...s, [key]: true }));
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, [field]: file_url }));
      if (field === "doyen_image_url") {
        doyenImageMutation.mutate(file_url);
      }
    } catch (e) {
      toast({ title: "Image upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(s => ({ ...s, [key]: false }));
    }
  };

  useEffect(() => {
    if (vrm) {
      setForm({
        doyen_name: vrm.doyen_name || "",
        doyen_title: vrm.doyen_title || "",
        doyen_short_description: vrm.doyen_short_description || "",
        doyen_text: vrm.doyen_text || "",
        body_text: portableTextToPlainText(vrm.body_json),
        doyen_image_url: vrm.doyen_image_url || "",
        logo_image_url: vrm.logo_image_url || "",
      });
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

  // Persist doyen image changes to the vrms table immediately on upload/clear,
  // so the live destination page reflects the new photo without a separate Save.
  const doyenImageMutation = useMutation({
    mutationFn: async (doyen_image_url) => {
      await sb.update("vrms", vrm.id, { doyen_image_url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vrm-content", partnerName] });
    },
    onError: () => {
      toast({ title: "Failed to update doyen image.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const payload = {
      doyen_name: form.doyen_name || null,
      doyen_title: form.doyen_title || null,
      doyen_short_description: form.doyen_short_description || null,
      doyen_text: form.doyen_text || null,
      doyentext_json: JSON.stringify(plainTextToPortableText(form.doyen_text)),
      body_json: JSON.stringify(plainTextToPortableText(form.body_text)),
    };
    // Only write image fields when they changed from the loaded value,
    // so an untouched doyen/logo keeps its current value in the database.
    if ((form.doyen_image_url || null) !== (vrm.doyen_image_url || null)) {
      payload.doyen_image_url = form.doyen_image_url || null;
    }
    if ((form.logo_image_url || null) !== (vrm.logo_image_url || null)) {
      payload.logo_image_url = form.logo_image_url || null;
    }
    updateMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!vrm) return null;

  const destinationUrl = vrm.slug
    ? `https://theonehundredcollection.com/destinations/${vrm.first_destination_slug || ""}/${vrm.slug}`
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" /> Destination Page Content
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
        This content appears on the website destination pages. Changes here update the live site.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Representative Name</Label>
            <Input
              value={form.doyen_name}
              onChange={e => setForm({ ...form, doyen_name: e.target.value })}
              placeholder="e.g. Buck Cumbo"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Title</Label>
            <Input
              value={form.doyen_title}
              onChange={e => setForm({ ...form, doyen_title: e.target.value })}
              placeholder="e.g. Founder & CEO"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Short Description</Label>
          <Input
            value={form.doyen_short_description}
            onChange={e => setForm({ ...form, doyen_short_description: e.target.value })}
            placeholder="One-line tagline shown on the destination page"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ImageUploadField
            label="Doyen Image"
            hint="Representative photo shown on the destination page"
            value={form.doyen_image_url}
            uploading={uploading.doyen || doyenImageMutation.isPending}
            onUpload={(f) => handleImageUpload("doyen_image_url", f)}
            onClear={() => {
              setForm(f => ({ ...f, doyen_image_url: "" }));
              doyenImageMutation.mutate(null);
            }}
          />
          <ImageUploadField
            label="Logo Image"
            hint="Company logo shown on the destination page"
            value={form.logo_image_url}
            uploading={uploading.logo}
            onUpload={(f) => handleImageUpload("logo_image_url", f)}
            onClear={() => setForm(f => ({ ...f, logo_image_url: "" }))}
          />
        </div>

        <div>
          <Label className="text-xs text-gray-500">Partner Bio Text</Label>
          <Textarea
            value={form.doyen_text}
            onChange={e => setForm({ ...form, doyen_text: e.target.value })}
            rows={7}
            placeholder="Full partner bio shown at the bottom of the destination page"
            className="mt-1"
          />
          <p className="text-xs text-gray-400 mt-1">Separate paragraphs with a blank line.</p>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Destination Text</Label>
          <Textarea
            value={form.body_text}
            onChange={e => setForm({ ...form, body_text: e.target.value })}
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