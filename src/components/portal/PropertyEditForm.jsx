/**
 * PropertyEditForm — full-page inline form for editing an existing portfolio property.
 * Creates a PropertySubmission with submission_type="edit" + source_property_id.
 */
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { uploadPropertyImage } from "@/lib/propertyImagesBlob";
import { ChevronRight, Save, Send, Upload, AlertCircle, X } from "lucide-react";

const AMENITY_OPTIONS = [
  "Private Pool", "Hot Tub", "Chef's Kitchen", "Ocean View", "Mountain View",
  "Private Beach", "Home Theater", "Gym", "Sauna", "Tennis Court", "Game Room",
  "EV Charger", "Fast WiFi", "Air Conditioning", "Fireplace", "BBQ",
  "Outdoor Dining", "Concierge", "Elevator", "Pet Friendly",
];

export default function PropertyEditForm({ property, user, onBack, onSubmitted }) {
  const [data, setData] = useState({
    headline: property.headline || "",
    short_summary: property.short_summary || "",
    description: property.description || "",
    bedrooms: property.bedrooms ?? "",
    bathrooms: property.bathrooms ?? "",
    sleeps: property.sleeps ?? "",
    amenities: property.amenities || [],
    design_style_notes: property.design_style_notes || "",
    unique_features: property.unique_features || "",
    why_100_collection: property.why_100_collection || "",
    best_fit_guest: property.best_fit_guest || "",
    photo_urls: property.photo_urls || [],
    notes_to_team: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setData(d => ({ ...d, [key]: val }));

  const toggleAmenity = (a) => {
    set("amenities", data.amenities.includes(a)
      ? data.amenities.filter(x => x !== a)
      : [...data.amenities, a]);
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      urls.push(await uploadPropertyImage(file));
    }
    set("photo_urls", [...data.photo_urls, ...urls]);
    setUploading(false);
  };

  const handleSubmit = async (isDraft) => {
    setSaving(true);
    await base44.entities.PropertySubmission.create({
      submission_type: "edit",
      source_property_id: property.id,
      partner_id: user.id,
      partner_name: property.partner_name || user.full_name,
      partner_email: user.email,
      property_name: property.property_name,
      // editable fields snapshot
      headline: data.headline,
      short_summary: data.short_summary,
      description: data.description,
      bedrooms: Number(data.bedrooms) || undefined,
      bathrooms: Number(data.bathrooms) || undefined,
      sleeps: Number(data.sleeps) || undefined,
      amenities: data.amenities,
      design_style_notes: data.design_style_notes,
      unique_features: data.unique_features,
      why_100_collection: data.why_100_collection,
      best_fit_guest: data.best_fit_guest,
      photo_urls: data.photo_urls,
      notes_to_team: data.notes_to_team,
      status: isDraft ? "draft" : "submitted",
      ...(isDraft ? {} : { submitted_date: new Date().toISOString() }),
    });
    setSaving(false);
    if (isDraft) {
      toast.success("Changes saved as draft");
    } else {
      toast.success("Changes submitted for review");
    }
    onSubmitted?.();
    onBack();
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-5">
        <button onClick={onBack} className="hover:text-[#C9A96E] transition-colors">My Properties</button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-400">Edit</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-[#0D1B2A] font-medium">{property.property_name}</span>
      </div>

      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 leading-relaxed">
          Your edits will be submitted to our team for approval before any changes go live on the website.
        </p>
      </div>

      {/* Read-only info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Property Info (read-only)</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><span className="text-slate-400 text-xs">Name: </span><span className="text-[#0D1B2A] font-medium">{property.property_name}</span></div>
          <div><span className="text-slate-400 text-xs">Market: </span><span className="text-[#0D1B2A]">{property.market || property.address || "—"}</span></div>
          <div><span className="text-slate-400 text-xs">Status: </span><span className="capitalize text-[#0D1B2A]">{property.status || "—"}</span></div>
        </div>
        <p className="text-[10px] text-slate-400 mt-3">To change the property name, address, or location, contact your dedicated 100 Collection representative.</p>
      </div>

      {/* Form sections */}
      <div className="space-y-5">
        {/* Headline & summaries */}
        <Section title="Listing Content">
          <FormField label="Headline / Title" hint="A compelling headline for your listing">
            <input value={data.headline} onChange={e => set("headline", e.target.value)}
              className={INPUT} placeholder="e.g. Oceanfront Villa with Private Pool" />
          </FormField>
          <FormField label="Short Summary" hint="1–2 sentence teaser">
            <textarea value={data.short_summary} onChange={e => set("short_summary", e.target.value)}
              rows={2} className={`${INPUT} resize-none`} />
          </FormField>
          <FormField label="Full Description">
            <textarea value={data.description} onChange={e => set("description", e.target.value)}
              rows={5} className={`${INPUT} resize-none`} />
          </FormField>
        </Section>

        {/* Capacity */}
        <Section title="Capacity">
          <div className="grid grid-cols-3 gap-4">
            {[["Bedrooms", "bedrooms"], ["Bathrooms", "bathrooms"], ["Sleeps", "sleeps"]].map(([lbl, key]) => (
              <div key={key}>
                <label className={LABEL}>{lbl}</label>
                <input type="number" min="0" value={data[key]} onChange={e => set(key, e.target.value)}
                  className={INPUT} placeholder="0" />
              </div>
            ))}
          </div>
        </Section>

        {/* Amenities */}
        <Section title="Amenities">
          <div className="flex flex-wrap gap-2">
            {AMENITY_OPTIONS.map(a => (
              <button key={a} type="button" onClick={() => toggleAmenity(a)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  data.amenities.includes(a)
                    ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                    : "border-slate-200 text-slate-600 hover:border-slate-400"
                }`}>
                {a}
              </button>
            ))}
          </div>
        </Section>

        {/* Additional content */}
        <Section title="What Makes This Property Special">
          <FormField label="Design Style Notes">
            <textarea value={data.design_style_notes} onChange={e => set("design_style_notes", e.target.value)}
              rows={3} className={`${INPUT} resize-none`} placeholder="Describe the design aesthetic, materials, vibe…" />
          </FormField>
          <FormField label="Unique Features">
            <textarea value={data.unique_features} onChange={e => set("unique_features", e.target.value)}
              rows={3} className={`${INPUT} resize-none`} placeholder="What sets this property apart?" />
          </FormField>
          <FormField label="Why 100 Collection?">
            <textarea value={data.why_100_collection} onChange={e => set("why_100_collection", e.target.value)}
              rows={3} className={`${INPUT} resize-none`} placeholder="Why is this property a fit for our collection?" />
          </FormField>
          <FormField label="Best Fit Guest">
            <textarea value={data.best_fit_guest} onChange={e => set("best_fit_guest", e.target.value)}
              rows={2} className={`${INPUT} resize-none`} placeholder="Who is the ideal guest for this property?" />
          </FormField>
        </Section>

        {/* Photos */}
        <Section title="Photos">
          {data.photo_urls.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {data.photo_urls.map((url, i) => (
                <div key={i} className="relative group aspect-video">
                  <img src={url} className="w-full h-full object-cover rounded-lg" alt="" />
                  <button
                    type="button"
                    onClick={() => set("photo_urls", data.photo_urls.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 cursor-pointer hover:border-[#C9A96E]/50 hover:bg-slate-50 transition-all text-sm text-slate-500">
            <Upload className="w-4 h-4 text-slate-400" />
            {uploading ? "Uploading…" : "Upload photos"}
            <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
          </label>
        </Section>

        {/* Notes */}
        <Section title="Notes to Review Team">
          <textarea value={data.notes_to_team} onChange={e => set("notes_to_team", e.target.value)}
            rows={3} className={`${INPUT} resize-none`}
            placeholder="Anything you'd like our team to know about these changes?" />
        </Section>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 transition-colors px-4 py-2">
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm px-5 py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" /> Save Draft
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-[#1a2e45] disabled:opacity-40 transition-colors"
          >
            <Send className="w-4 h-4" /> {saving ? "Submitting…" : "Submit Changes for Review"}
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30";
const LABEL = "text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5";

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function FormField({ label, hint, children }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {hint && <p className="text-[10px] text-slate-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}