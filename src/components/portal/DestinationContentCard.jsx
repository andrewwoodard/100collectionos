import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
export default function DestinationContentCard({ partnerName, market }) {
  const queryClient = useQueryClient();

  const { data: vrm, isLoading } = useQuery({
    queryKey: ["portal-vrm-content", partnerName],
    queryFn: async () => {
      const res = await base44.functions.invoke("supabaseData", {
        table: "vrms",
        action: "list",
        filters: { partner_name: partnerName },
        limit: 1,
      });
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
  });

  useEffect(() => {
    if (vrm) {
      setForm({
        doyen_name: vrm.doyen_name || "",
        doyen_title: vrm.doyen_title || "",
        doyen_short_description: vrm.doyen_short_description || "",
        doyen_text: vrm.doyen_text || "",
        body_text: portableTextToPlainText(vrm.body_json),
      });
    }
  }, [vrm]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await base44.functions.invoke("supabaseData", {
        table: "vrms",
        action: "update",
        id: vrm.id,
        data,
      });
    },
    onSuccess: () => {
      toast.success("Destination page content saved. Changes appear on the live site within 24 hours.");
      queryClient.invalidateQueries({ queryKey: ["portal-vrm-content", partnerName] });
    },
    onError: () => {
      toast.error("Failed to update content.");
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      doyen_name: form.doyen_name || null,
      doyen_title: form.doyen_title || null,
      doyen_short_description: form.doyen_short_description || null,
      doyen_text: form.doyen_text || null,
      doyentext_json: JSON.stringify(plainTextToPortableText(form.doyen_text)),
      body_json: JSON.stringify(plainTextToPortableText(form.body_text)),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    );
  }

  if (!vrm) return null;

  const destinationUrl = vrm.slug
    ? `https://theonehundredcollection.com/destinations/${vrm.first_destination_slug || ""}/${vrm.slug}`
    : market
      ? `https://theonehundredcollection.com/destinations/${market.toLowerCase().trim().replace(/\s+/g, "-")}`
      : "https://theonehundredcollection.com";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-medium text-slate-900 text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" /> Destination Page Content
        </h2>
        <div className="flex items-center gap-2">
          <a
            href={destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#C9A96E] hover:text-[#A68B4B] font-medium flex items-center gap-1"
          >
            View destination page <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        This content appears on your destination page at theonehundredcollection.com. Changes here update the live site.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-slate-500">Representative Name</Label>
            <Input
              value={form.doyen_name}
              onChange={e => setForm({ ...form, doyen_name: e.target.value })}
              placeholder="e.g. Buck Cumbo"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Title</Label>
            <Input
              value={form.doyen_title}
              onChange={e => setForm({ ...form, doyen_title: e.target.value })}
              placeholder="e.g. Founder & CEO"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-slate-500">Short Description</Label>
          <Input
            value={form.doyen_short_description}
            onChange={e => setForm({ ...form, doyen_short_description: e.target.value })}
            placeholder="One-line tagline shown on the destination page"
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs text-slate-500">Partner Bio Text</Label>
          <Textarea
            value={form.doyen_text}
            onChange={e => setForm({ ...form, doyen_text: e.target.value })}
            rows={7}
            placeholder="Full partner bio shown at the bottom of the destination page"
            className="mt-1 resize-none"
          />
          <p className="text-xs text-slate-400 mt-1">Separate paragraphs with a blank line.</p>
        </div>

        <div>
          <Label className="text-xs text-slate-500">Destination Text</Label>
          <Textarea
            value={form.body_text}
            onChange={e => setForm({ ...form, body_text: e.target.value })}
            rows={7}
            placeholder="Destination description shown on the destination page"
            className="mt-1 resize-none"
          />
          <p className="text-xs text-slate-400 mt-1">Separate paragraphs with a blank line.</p>
        </div>
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-slate-100">
        <Button onClick={handleSave} disabled={updateMutation.isPending} size="sm">
          {updateMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          Save Content
        </Button>
      </div>
    </div>
  );
}