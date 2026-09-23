import React, { useState } from "react";
import { Upload, X, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

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

const URGENCIES = ["default", "success", "warning", "alert", "info"];

function Field({ label, hint, children }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

const inputClass = "w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 transition-all";
const textareaClass = inputClass + " resize-y min-h-[60px] font-mono text-xs";

export default function EmailTemplateForm({ values, onChange, onUploadHero }) {
  const set = (key, val) => onChange({ ...values, [key]: val });
  const [showSections, setShowSections] = useState(false);

  const handleHeroUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      if (res?.data?.file_url) {
        set("hero_image_url", res.data.file_url);
        if (onUploadHero) onUploadHero(res.data.file_url);
      }
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  // Data rows
  const updateDataRow = (idx, field, val) => {
    const rows = [...(values.data_rows || [])];
    rows[idx] = { ...rows[idx], [field]: val };
    set("data_rows", rows);
  };
  const addDataRow = () => set("data_rows", [...(values.data_rows || []), { label: "", value: "" }]);
  const removeDataRow = (idx) => {
    const rows = [...(values.data_rows || [])];
    rows.splice(idx, 1);
    set("data_rows", rows);
  };

  // What happens next
  const updateWhn = (idx, field, val) => {
    const items = [...(values.what_happens_next || [])];
    items[idx] = { ...items[idx], [field]: val };
    set("what_happens_next", items);
  };
  const addWhn = () => {
    const items = values.what_happens_next || [];
    if (items.length >= 4) return;
    set("what_happens_next", [...items, { number: String(items.length + 1), title: "", body: "" }]);
  };
  const removeWhn = (idx) => {
    const items = [...(values.what_happens_next || [])];
    items.splice(idx, 1);
    set("what_happens_next", items);
  };

  // Sections (for digests)
  const updateSection = (idx, field, val) => {
    const secs = [...(values.sections || [])];
    secs[idx] = { ...secs[idx], [field]: val };
    set("sections", secs);
  };
  const updateSectionRow = (secIdx, rowIdx, field, val) => {
    const secs = [...(values.sections || [])];
    const rows = [...secs[secIdx].data_rows];
    rows[rowIdx] = { ...rows[rowIdx], [field]: val };
    secs[secIdx] = { ...secs[secIdx], data_rows: rows };
    set("sections", secs);
  };
  const addSectionRow = (secIdx) => {
    const secs = [...(values.sections || [])];
    secs[secIdx] = { ...secs[secIdx], data_rows: [...(secs[secIdx].data_rows || []), { label: "", value: "" }] };
    set("sections", secs);
  };
  const removeSectionRow = (secIdx, rowIdx) => {
    const secs = [...(values.sections || [])];
    const rows = [...secs[secIdx].data_rows];
    rows.splice(rowIdx, 1);
    secs[secIdx] = { ...secs[secIdx], data_rows: rows };
    set("sections", secs);
  };
  const addSection = () => set("sections", [...(values.sections || []), { title: "", data_rows: [] }]);
  const removeSection = (idx) => {
    const secs = [...(values.sections || [])];
    secs.splice(idx, 1);
    set("sections", secs);
  };

  return (
    <div className="space-y-1">
      <Field label="Name">
        <input className={inputClass} value={values.name || ""} onChange={e => set("name", e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select className={inputClass} value={values.category || ""} onChange={e => set("category", e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Urgency">
          <select className={inputClass} value={values.urgency || "default"} onChange={e => set("urgency", e.target.value)}>
            {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Subject" hint="Supports {{variable}} tokens like {{partner.partner_name}}">
        <input className={inputClass} value={values.subject || ""} onChange={e => set("subject", e.target.value)} />
      </Field>

      <Field label="Hero image">
        <div className="flex items-center gap-2">
          <input className={inputClass} value={values.hero_image_url || ""} onChange={e => set("hero_image_url", e.target.value)} placeholder="URL or upload" />
          <label className="flex items-center gap-1 cursor-pointer border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-gray-50 text-xs text-gray-600 flex-shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleHeroUpload} />
          </label>
          {values.hero_image_url && (
            <button onClick={() => set("hero_image_url", "")} className="text-gray-400 hover:text-red-500 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {values.hero_image_url && (
          <img src={values.hero_image_url} alt="Hero preview" className="mt-2 w-full h-20 object-cover rounded-lg border border-gray-100" />
        )}
      </Field>

      <Field label="Event tag" hint="Small uppercase gold tag above headline">
        <input className={inputClass} value={values.event_tag || ""} onChange={e => set("event_tag", e.target.value)} />
      </Field>

      <Field label="Headline" hint="Cormorant Garamond h1. Supports {{variables}}">
        <input className={inputClass} value={values.headline || ""} onChange={e => set("headline", e.target.value)} />
      </Field>

      <Field label="Subheadline">
        <input className={inputClass} value={values.subheadline || ""} onChange={e => set("subheadline", e.target.value)} />
      </Field>

      <Field label="Context block" hint="Warm narrative paragraph">
        <textarea className={textareaClass} rows={4} value={values.context_block || ""} onChange={e => set("context_block", e.target.value)} />
      </Field>

      {/* Data rows */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold text-gray-600">Data rows</label>
          <button onClick={addDataRow} className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700">
            <Plus className="w-3 h-3" /> Add row
          </button>
        </div>
        {(values.data_rows || []).map((row, idx) => (
          <div key={idx} className="flex items-center gap-1 mb-1">
            <input className={inputClass + " flex-1"} placeholder="Label" value={row.label || ""} onChange={e => updateDataRow(idx, "label", e.target.value)} />
            <input className={inputClass + " flex-1"} placeholder="Value" value={row.value || ""} onChange={e => updateDataRow(idx, "value", e.target.value)} />
            <button onClick={() => removeDataRow(idx)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Field label="Callout" hint="Highlighted note in a colored box">
        <textarea className={textareaClass} rows={2} value={values.callout || ""} onChange={e => set("callout", e.target.value)} />
      </Field>

      {/* What happens next */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold text-gray-600">What happens next (max 4)</label>
          <button onClick={addWhn} disabled={(values.what_happens_next || []).length >= 4} className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 disabled:opacity-30">
            <Plus className="w-3 h-3" /> Add step
          </button>
        </div>
        {(values.what_happens_next || []).map((step, idx) => (
          <div key={idx} className="border border-gray-100 rounded-lg p-2 mb-1 space-y-1">
            <div className="flex items-center gap-1">
              <input className={inputClass + " w-12 text-center"} placeholder="#" value={step.number || ""} onChange={e => updateWhn(idx, "number", e.target.value)} />
              <input className={inputClass + " flex-1"} placeholder="Title" value={step.title || ""} onChange={e => updateWhn(idx, "title", e.target.value)} />
              <button onClick={() => removeWhn(idx)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea className={textareaClass} rows={2} placeholder="Body" value={step.body || ""} onChange={e => updateWhn(idx, "body", e.target.value)} />
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Primary CTA label">
          <input className={inputClass} value={values.cta_label || ""} onChange={e => set("cta_label", e.target.value)} />
        </Field>
        <Field label="Primary CTA URL">
          <input className={inputClass} value={values.cta_url || ""} onChange={e => set("cta_url", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Secondary CTA label">
          <input className={inputClass} value={values.secondary_cta_label || ""} onChange={e => set("secondary_cta_label", e.target.value)} />
        </Field>
        <Field label="Secondary CTA URL">
          <input className={inputClass} value={values.secondary_cta_url || ""} onChange={e => set("secondary_cta_url", e.target.value)} />
        </Field>
      </div>

      <Field label="Social proof" hint="Use **bold** for gold emphasis">
        <input className={inputClass} value={values.social_proof || ""} onChange={e => set("social_proof", e.target.value)} />
      </Field>

      <div className="flex items-center gap-2 mb-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={values.reply_prompt_enabled !== false} onChange={e => set("reply_prompt_enabled", e.target.checked)} className="rounded" />
          <span className="text-xs text-gray-600">Reply prompt ("Questions? Just reply...")</span>
        </label>
      </div>

      <Field label="Footer note">
        <input className={inputClass} value={values.footer_note || ""} onChange={e => set("footer_note", e.target.value)} />
      </Field>

      <Field label="Signoff">
        <input className={inputClass} value={values.signoff || ""} onChange={e => set("signoff", e.target.value)} />
      </Field>

      {/* Sections (collapsible, for digests) */}
      <div className="mb-3">
        <button
          onClick={() => setShowSections(!showSections)}
          className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1"
        >
          {showSections ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Sections (digest emails)
        </button>
        {showSections && (
          <div className="space-y-2">
            {(values.sections || []).map((sec, idx) => (
              <div key={idx} className="border border-gray-100 rounded-lg p-2 space-y-1">
                <div className="flex items-center gap-1">
                  <input className={inputClass + " flex-1"} placeholder="Section title" value={sec.title || ""} onChange={e => updateSection(idx, "title", e.target.value)} />
                  <button onClick={() => removeSection(idx)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {(sec.data_rows || []).map((row, rIdx) => (
                  <div key={rIdx} className="flex items-center gap-1 pl-2">
                    <input className={inputClass + " flex-1"} placeholder="Label" value={row.label || ""} onChange={e => updateSectionRow(idx, rIdx, "label", e.target.value)} />
                    <input className={inputClass + " flex-1"} placeholder="Value" value={row.value || ""} onChange={e => updateSectionRow(idx, rIdx, "value", e.target.value)} />
                    <button onClick={() => removeSectionRow(idx, rIdx)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => addSectionRow(idx)} className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 pl-2">
                  <Plus className="w-3 h-3" /> Add row
                </button>
              </div>
            ))}
            <button onClick={addSection} className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700">
              <Plus className="w-3 h-3" /> Add section
            </button>
          </div>
        )}
      </div>

      <Field label="Notes (admin only)">
        <textarea className={textareaClass} rows={2} value={values.notes || ""} onChange={e => set("notes", e.target.value)} />
      </Field>
    </div>
  );
}