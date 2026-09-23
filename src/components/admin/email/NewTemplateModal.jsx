import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, AlertCircle } from "lucide-react";

const CATEGORIES = [
  "Partner-facing",
  "Homeowner-facing",
  "Candidate-facing",
  "Admin — Partner actions",
  "Admin — Financial",
  "Admin — Digests",
  "Invitation acceptance",
  "Offboarding",
  "Auto-reply",
];

const inputClass = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300";

export default function NewTemplateModal({ onClose, onCreated, existingSlugs }) {
  const [form, setForm] = useState({
    slug: "",
    name: "",
    category: "Partner-facing",
    subject: "",
    headline: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const slugTaken = existingSlugs?.includes(form.slug.trim());

  const handleSave = async () => {
    setError("");
    if (!form.slug.trim() || !form.name.trim() || !form.subject.trim() || !form.headline.trim()) {
      setError("Slug, name, subject, and headline are required");
      return;
    }
    if (slugTaken) {
      setError("A template with this slug already exists");
      return;
    }
    setSaving(true);
    try {
      const user = await base44.auth.me();
      const created = await base44.entities.EmailTemplate.create({
        ...form,
        slug: form.slug.trim(),
        urgency: "default",
        status: "active",
        data_rows: [],
        what_happens_next: [],
        sections: [],
        reply_prompt_enabled: true,
        last_edited_by: user?.email || "",
        last_edited_at: new Date().toISOString(),
      });
      if (onCreated) onCreated(created);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#0D1B2A]">New Email Template</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Slug *</label>
            <input
              className={inputClass + (slugTaken ? " border-red-300" : "")}
              placeholder="e.g. property-welcome-email"
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
            />
            {slugTaken && <p className="text-[10px] text-red-500 mt-0.5">Slug already exists</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
            <input className={inputClass} placeholder="Display name in sidebar" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
            <select className={inputClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Subject *</label>
            <input className={inputClass} placeholder="Email subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Headline *</label>
            <input className={inputClass} placeholder="Main headline" value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <input className={inputClass} placeholder="What triggers this email?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              This creates an editable template record. A developer must wire the trigger code to actually fire this template.
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || slugTaken}
              className="flex items-center gap-1.5 bg-amber-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}