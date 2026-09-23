import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PhotoCurationGrid from "./wizard/PhotoCurationGrid";
import RescanPhotosModal from "./wizard/RescanPhotosModal";
import { ChevronLeft, Save, Send, Sparkles, RotateCcw, Eye, ScanSearch } from "lucide-react";
import AmenitiesEditor from "@/components/properties/AmenitiesEditor";

const PROPERTY_TYPES = ["villa", "house", "condo", "estate", "cabin", "penthouse", "chalet", "farmhouse", "other"];

// Normalize free-text property types (from the LLM scraper) to the enum values
// the dropdown expects. e.g. "Luxury Beach House" -> "house", "Cottage" -> "cabin"
function normalizePropertyType(raw) {
  if (!raw || typeof raw !== "string") return "";
  const lower = raw.toLowerCase().trim();
  if (PROPERTY_TYPES.includes(lower)) return lower;
  if (lower.includes("villa")) return "villa";
  if (lower.includes("penthouse")) return "penthouse";
  if (lower.includes("chalet")) return "chalet";
  if (lower.includes("farm")) return "farmhouse";
  if (lower.includes("condo") || lower.includes("apartment") || lower.includes("flat")) return "condo";
  if (lower.includes("estate")) return "estate";
  if (lower.includes("cabin") || lower.includes("cottage")) return "cabin";
  if (lower.includes("house") || lower.includes("home") || lower.includes("beach") || lower.includes("luxury") || lower.includes("retreat")) return "house";
  return "other";
}
const AMENITY_OPTIONS = ["Private Pool", "Hot Tub", "Chef's Kitchen", "Ocean View", "Mountain View", "Private Beach", "Home Theater", "Gym", "Sauna", "Tennis Court", "Game Room", "EV Charger", "Fast WiFi", "Air Conditioning", "Fireplace", "BBQ", "Outdoor Dining", "Concierge", "Elevator", "Pet Friendly"];

const CONFIDENCE_STYLES = {
  high:    { dot: "bg-emerald-400", bg: "",                  hint: null },
  medium:  { dot: "bg-amber-400",   bg: "",                  hint: null },
  low:     { dot: "bg-red-400",     bg: "bg-amber-50 border border-amber-200 rounded-xl p-3", hint: "Double-check this — we weren't sure." },
  missing: { dot: "bg-slate-200",   bg: "",                  hint: null },
};

function ConfidenceDot({ level }) {
  if (!level || level === "missing") return null;
  const s = CONFIDENCE_STYLES[level] || CONFIDENCE_STYLES.medium;
  return (
    <span title={`Confidence: ${level}`} className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
  );
}

// Editorial voice toggle for text fields
function EditorialToggle({ field, data, setData, originalKey, label, rewritePrompt, rows = 3, placeholder = "" }) {
  const [mode, setMode] = useState("editorial"); // "editorial" | "original"
  const [rewriting, setRewriting] = useState(false);
  const originalVal = data[originalKey] || "";
  const editorialVal = data[field] || "";

  const displayValue = mode === "original" ? originalVal : editorialVal;

  const handleChange = (val) => {
    if (mode === "editorial") {
      setData(d => ({ ...d, [field]: val }));
    } else {
      setData(d => ({ ...d, [originalKey]: val }));
    }
  };

  const regenerate = async () => {
    const src = data[originalKey] || data[field] || "";
    if (!src) return;
    setRewriting(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt: rewritePrompt(src, data) });
      setData(d => ({ ...d, [field]: typeof result === "string" ? result : result?.text || result?.content || src }));
      setMode("editorial");
    } catch {}
    setRewriting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {/* Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMode("editorial")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${mode === "editorial" ? "bg-white text-[#0D1B2A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              Editorial
            </button>
            <button
              type="button"
              onClick={() => setMode("original")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${mode === "original" ? "bg-white text-[#0D1B2A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              Original
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={rewriting}
          className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 disabled:opacity-40"
        >
          <RotateCcw className={`w-3 h-3 ${rewriting ? "animate-spin" : ""}`} />
          {rewriting ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
      <textarea
        value={displayValue}
        onChange={e => handleChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E] resize-none"
      />
      {mode === "original" && !originalVal && (
        <p className="text-[11px] text-slate-400 mt-1">No original text captured — switch to Editorial to edit.</p>
      )}
    </div>
  );
}

function SourcePopover({ snippets, field }) {
  const [open, setOpen] = useState(false);
  if (!snippets) return null;
  const keys = Object.keys(snippets);
  if (keys.length === 0) return null;

  // Show popover only for relevant fields
  const relevant = field === "location_full" || field === "location_city"
    ? snippets.location_context
    : field === "bedrooms" || field === "bathrooms" || field === "sleeps"
      ? snippets.stats_context
      : null;

  if (!relevant) return null;

  return (
    <div className="relative inline-block ml-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-slate-400 hover:text-slate-600 transition-colors"
        title="View source data"
      >
        <Eye className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Raw page snippet</div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {relevant || <span className="italic text-slate-400">No relevant text found on source page</span>}
          </p>
          {!relevant && (
            <p className="text-[11px] text-amber-600 mt-1.5 font-medium">⚠ AI may have inferred this — verify manually.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, field, confidence, required, children, aiImported, rawSnippets, error }) {
  const conf = confidence?.[field];
  const style = CONFIDENCE_STYLES[conf] || {};
  return (
    <div id={`field-${field}`} className={style.bg || ""}>
      <div className="flex items-center justify-between mb-1.5">
        <label className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${error ? "text-red-500" : "text-slate-600"}`}>
          {label}{required && <span className="text-red-400">*</span>}
          {aiImported && rawSnippets && <SourcePopover snippets={rawSnippets} field={field} />}
        </label>
        {aiImported && conf && conf !== "missing" && <ConfidenceDot level={conf} />}
      </div>
      {style.hint && (
        <p className="text-[11px] text-amber-600 mb-1.5">{style.hint}</p>
      )}
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function SubmissionForm({ initialData = {}, onSubmit, onBack }) {
  const [data, setData] = useState(() => {
    const merged = {
      property_name: "", headline: "", short_summary: "", description: "",
      property_type: "", location_full: "", location_city: "", location_state: "", location_country: "",
      bedrooms: "", bathrooms: "", half_bathrooms: "", sleeps: "", amenities: [],
      design_style_notes: "", unique_features: "", why_100_collection: "",
      best_fit_guest: "", tags: [], notes_to_team: "", photo_urls: [],
      ...initialData,
    };
    // Safety net: normalize property_type so the dropdown always matches
    if (merged.property_type) {
      merged.property_type = normalizePropertyType(merged.property_type);
    }
    return merged;
  });

  const set = (key, val) => setData(d => ({ ...d, [key]: val }));
  const { toast } = useToast();
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(null); // null | "draft" | "submit"
  const [rescanOpen, setRescanOpen] = useState(false);
  const confidence = initialData.field_confidence || {};
  const aiImported = !!initialData.ai_imported;
  const rawSnippets = initialData.scraped_raw_data?.raw_snippets || null;

  const REQUIRED_FIELDS = [
    { key: "property_name", label: "Property Name" },
    { key: "property_type", label: "Property Type" },
    { key: "location_full", label: "Location" },
  ];

  const validate = () => {
    const errs = {};
    for (const f of REQUIRED_FIELDS) {
      if (!String(data[f.key] || "").trim()) errs[f.key] = `${f.label} is required`;
    }
    return errs;
  };

  const handleSubmit = async (isDraft) => {
    if (!isDraft) {
      const errs = validate();
      if (Object.keys(errs).length) {
        setErrors(errs);
        toast({ variant: "destructive", title: "Please complete the highlighted fields before submitting." });
        const firstKey = Object.keys(errs)[0];
        setTimeout(() => document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
        return;
      }
    }
    setErrors({});
    setSubmitting(isDraft ? "draft" : "submit");
    try {
      await onSubmit?.(data, isDraft);
    } catch (err) {
      toast({ variant: "destructive", title: isDraft ? "Save failed" : "Submit failed", description: err?.message || "Please try again." });
    } finally {
      setSubmitting(null);
    }
  };

  const toggleAmenity = (a) => {
    set("amenities", data.amenities?.includes(a) ? data.amenities.filter(x => x !== a) : [...(data.amenities || []), a]);
  };

  const completeness = () => {
    const fields = ["property_name", "location_full", "bedrooms", "bathrooms", "description", "why_100_collection"];
    const filled = fields.filter(f => data[f]).length;
    return Math.round((filled / fields.length) * 100);
  };

  const score = completeness();

  const inputClass = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E]";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button type="button" onClick={onBack} className="text-slate-400 hover:text-[#0D1B2A] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-light text-[#0D1B2A]">
            {aiImported ? "Review & Edit Import" : "Property Details"}
          </h1>
        </div>
        <div className="text-right">
          <div className={`text-sm font-semibold ${score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-500"}`}>{score}%</div>
          <div className="text-[10px] text-slate-400">Complete</div>
        </div>
      </div>

      {aiImported && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Details were imported by AI. Review each field — <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mx-0.5 align-middle" /> high confidence,{" "}
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mx-0.5 align-middle" /> medium,{" "}
            <span className="inline-block w-2 h-2 rounded-full bg-red-400 mx-0.5 align-middle" /> low — double-check red fields.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <h3 className="text-sm font-semibold text-[#0D1B2A] border-b border-slate-50 pb-3">Basic Information</h3>
          <Field label="Property Name" field="property_name" confidence={confidence} required aiImported={aiImported} rawSnippets={rawSnippets} error={errors.property_name}>
            <input value={data.property_name} onChange={e => { set("property_name", e.target.value); if (errors.property_name) setErrors(p => ({ ...p, property_name: undefined })); }} className={`${inputClass} ${errors.property_name ? "border-red-300 focus:ring-red-200" : ""}`} placeholder="e.g. Villa Serenova" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Property Type" field="property_type" confidence={confidence} required aiImported={aiImported} rawSnippets={rawSnippets} error={errors.property_type}>
              <select value={data.property_type} onChange={e => { set("property_type", e.target.value); if (errors.property_type) setErrors(p => ({ ...p, property_type: undefined })); }} className={`${inputClass} bg-white capitalize ${errors.property_type ? "border-red-300 focus:ring-red-200" : ""}`}>
                <option value="">Select type</option>
                {PROPERTY_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </Field>
            <Field label="Location" field="location_full" confidence={confidence} required aiImported={aiImported} rawSnippets={rawSnippets} error={errors.location_full}>
              <input value={data.location_full} onChange={e => { set("location_full", e.target.value); if (errors.location_full) setErrors(p => ({ ...p, location_full: undefined })); }} className={`${inputClass} ${errors.location_full ? "border-red-300 focus:ring-red-200" : ""}`} placeholder="City, State, Country" />
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[["Bedrooms", "bedrooms"], ["Bathrooms", "bathrooms"], ["Half Baths", "half_bathrooms"], ["Sleeps", "sleeps"]].map(([lbl, key]) => (
              <Field key={key} label={lbl} field={key} confidence={confidence} required aiImported={aiImported} rawSnippets={rawSnippets}>
                <input type="number" value={data[key]} onChange={e => set(key, e.target.value)} className={inputClass} placeholder="0" />
              </Field>
            ))}
          </div>
        </div>

        {/* Descriptions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <h3 className="text-sm font-semibold text-[#0D1B2A] border-b border-slate-50 pb-3">Listing Content</h3>

          {/* Headline — editorial toggle for AI imports */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 uppercase tracking-wide">
                Headline {aiImported && confidence.headline && <ConfidenceDot level={confidence.headline} />}
              </label>
            </div>
            {aiImported ? (
              <EditorialToggle
                field="headline"
                originalKey="_original_headline"
                data={data}
                setData={setData}
                label="Headline"
                rows={1}
                placeholder="Catchy listing title"
                rewritePrompt={(orig, d) => `Rewrite this vacation property headline in The 100 Collection's editorial voice — luxury, evocative, max 12 words. Property: ${d.property_name || ""}. Original: ${orig}`}
              />
            ) : (
              <input value={data.headline} onChange={e => set("headline", e.target.value)} className={inputClass} placeholder="Catchy listing title" />
            )}
          </div>

          {/* Short Summary */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 uppercase tracking-wide">
                Short Summary {aiImported && confidence.short_summary && <ConfidenceDot level={confidence.short_summary} />}
              </label>
            </div>
            {aiImported ? (
              <EditorialToggle
                field="short_summary"
                originalKey="_original_summary"
                data={data}
                setData={setData}
                label="Short Summary"
                rows={2}
                placeholder="2–3 sentence overview"
                rewritePrompt={(orig, d) => `Rewrite this vacation property summary in The 100 Collection's editorial voice — luxury, warm, 2-3 sentences. Property: ${d.property_name || ""}. Original: ${orig}`}
              />
            ) : (
              <textarea value={data.short_summary} onChange={e => set("short_summary", e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="2–3 sentence overview" />
            )}
          </div>

          {/* Full Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 uppercase tracking-wide">
                Full Description {aiImported && confidence.description && <ConfidenceDot level={confidence.description} />}
              </label>
            </div>
            {aiImported ? (
              <EditorialToggle
                field="description"
                originalKey="_original_description"
                data={data}
                setData={setData}
                label="Full Description"
                rows={5}
                placeholder="Full property description"
                rewritePrompt={(orig, d) => `Rewrite this vacation property description in The 100 Collection's editorial voice — luxury, evocative, warm, sophisticated, under 200 words. Property: ${d.property_name || ""}, ${d.location_full || ""}. Original:\n${orig}`}
              />
            ) : (
              <textarea value={data.description} onChange={e => set("description", e.target.value)} rows={5} className={`${inputClass} resize-none`} placeholder="Full property description" />
            )}
          </div>

          <Field label="Why This Property Belongs in The 100 Collection" field="why_100_collection" confidence={confidence} required aiImported={aiImported} rawSnippets={rawSnippets}>
            <textarea value={data.why_100_collection} onChange={e => set("why_100_collection", e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="What makes this property exceptional?" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Unique Features" field="unique_features" confidence={confidence} aiImported={aiImported} rawSnippets={rawSnippets}>
              <textarea value={data.unique_features} onChange={e => set("unique_features", e.target.value)} rows={3} className={`${inputClass} resize-none`} />
            </Field>
            <Field label="Best Fit Guest" field="best_fit_guest" confidence={confidence} aiImported={aiImported} rawSnippets={rawSnippets}>
              <textarea value={data.best_fit_guest} onChange={e => set("best_fit_guest", e.target.value)} rows={3} className={`${inputClass} resize-none`} />
            </Field>
          </div>
          <Field label="Design / Style Notes" field="design_style_notes" confidence={confidence} aiImported={aiImported} rawSnippets={rawSnippets}>
            <textarea value={data.design_style_notes} onChange={e => set("design_style_notes", e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Interior design, architecture, aesthetic" />
          </Field>
        </div>

        {/* Amenities */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-[#0D1B2A] border-b border-slate-50 pb-3 mb-4">Amenities</h3>
          <AmenitiesEditor value={data.amenities || []} onChange={(v) => set("amenities", v)} />
        </div>

        {/* Photos */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
            <h3 className="text-sm font-semibold text-[#0D1B2A]">Photos</h3>
            <div className="flex items-center gap-2">
              {data.photo_urls?.length > 0 && (
                <span className="text-xs text-slate-400">{data.photo_urls.length} photo{data.photo_urls.length !== 1 ? "s" : ""}</span>
              )}
              {data.listing_url && (
                <button
                  type="button"
                  onClick={() => setRescanOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#0D1B2A] border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <ScanSearch className="w-3.5 h-3.5" />
                  Rescan for Photos
                </button>
              )}
            </div>
          </div>
          {aiImported && (!data.photo_urls || data.photo_urls.length === 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-800">
              <span className="font-medium">Photos couldn't be imported from this listing.</span>
              <span className="text-amber-700"> Rescan the listing above or upload property photos manually below.</span>
            </div>
          )}
          <PhotoCurationGrid
            photos={data.photo_urls || []}
            onChange={(photos) => set("photo_urls", photos)}
          />
        </div>

        {rescanOpen && (
          <RescanPhotosModal
            open={rescanOpen}
            onClose={() => setRescanOpen(false)}
            listingUrl={data.listing_url}
            currentPhotos={data.photo_urls || []}
            onAddPhotos={(newUrls) => set("photo_urls", [...(data.photo_urls || []), ...newUrls])}
          />
        )}

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-[#0D1B2A] border-b border-slate-50 pb-3 mb-4">Notes to Review Team</h3>
          <textarea value={data.notes_to_team} onChange={e => set("notes_to_team", e.target.value)} rows={3}
            className={`${inputClass} resize-none`} placeholder="Anything you'd like our curation team to know?" />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <button type="button" onClick={() => handleSubmit(true)} disabled={submitting !== null}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm px-5 py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Save className="w-4 h-4" /> {submitting === "draft" ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" onClick={() => handleSubmit(false)} disabled={submitting !== null}
            className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-[#1a2e45] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <Send className="w-4 h-4" /> {submitting === "submit" ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
      </div>
    </div>
  );
}