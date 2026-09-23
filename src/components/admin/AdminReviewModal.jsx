import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Upload } from "lucide-react";

const SEGMENTS = [
  { value: "all", label: "All segments" },
  { value: "property_manager", label: "Property Manager" },
  { value: "homeowner", label: "Homeowner" },
  { value: "existing_partner", label: "Existing Partner" },
];

const empty = {
  quote: "",
  attribution_name: "",
  attribution_role: "",
  attribution_company: "",
  attribution_photo_url: "",
  segment: "all",
  display_order: 0,
  is_featured: false,
};

export default function AdminReviewModal({ open, onClose, onSaved, review }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setForm(review ? { ...empty, ...review } : empty);
  }, [review, open]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      set("attribution_photo_url", file_url);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!form.quote.trim() || !form.attribution_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        quote: form.quote,
        attribution_name: form.attribution_name,
        attribution_role: form.attribution_role,
        attribution_company: form.attribution_company,
        attribution_photo_url: form.attribution_photo_url,
        segment: form.segment,
        display_order: Number(form.display_order) || 0,
        is_featured: !!form.is_featured,
      };
      if (review?.id) {
        await base44.entities.PartnerReview.update(review.id, payload);
      } else {
        await base44.entities.PartnerReview.create(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-[#0D1B2A] mb-4">
          {review ? "Edit review" : "Add review"}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Quote *</label>
            <textarea
              value={form.quote}
              onChange={(e) => set("quote", e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-slate-400"
              placeholder="The review text…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Name *</label>
              <input
                value={form.attribution_name}
                onChange={(e) => set("attribution_name", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400"
                placeholder="Leslie Hucks"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Role</label>
              <input
                value={form.attribution_role}
                onChange={(e) => set("attribution_role", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400"
                placeholder="Founder"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Company</label>
            <input
              value={form.attribution_company}
              onChange={(e) => set("attribution_company", e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400"
              placeholder="Akers Ellis Real Estate & Rentals"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Headshot</label>
            <div className="flex items-center gap-3">
              {form.attribution_photo_url ? (
                <img src={form.attribution_photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-50 border border-dashed border-slate-200" />
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs text-[#C9A96E] hover:underline disabled:opacity-50 inline-flex items-center gap-1"
              >
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {form.attribution_photo_url ? "Change" : "Upload"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Segment</label>
              <select
                value={form.segment}
                onChange={(e) => set("segment", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400"
              >
                {SEGMENTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Display order</label>
              <input
                type="number"
                value={form.display_order}
                onChange={(e) => set("display_order", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => set("is_featured", e.target.checked)}
              className="w-4 h-4 accent-[#C9A96E]"
            />
            Show on /join (featured)
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.quote.trim() || !form.attribution_name.trim()}
            className="flex-1 px-4 py-2 text-sm bg-[#0D1B2A] text-white rounded-lg hover:bg-[#1a2e45] disabled:opacity-60 font-medium"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}