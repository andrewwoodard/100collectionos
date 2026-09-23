import React, { useState } from "react";
import { ChevronRight, ChevronDown, ArrowRight, Plus, Minus, Image as ImageIcon } from "lucide-react";

const FIELD_LABELS = {
  headline: "Headline",
  short_summary: "Short Summary",
  description: "Description",
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  sleeps: "Sleeps",
  amenities: "Amenities",
  design_style_notes: "Design Style Notes",
  unique_features: "Unique Features",
  why_100_collection: "Why 100 Collection",
  best_fit_guest: "Best Fit Guest",
  photo_urls: "Photos",
};

const ARRAY_FIELDS = new Set(["amenities", "photo_urls"]);
const NUMBER_FIELDS = new Set(["bedrooms", "bathrooms", "sleeps"]);
const LONG_TEXT_FIELDS = new Set(["description", "short_summary", "design_style_notes", "unique_features", "why_100_collection", "best_fit_guest"]);

function isEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function norm(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean).sort().join("|");
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function arrayDiff(oldArr, newArr) {
  const oldSet = new Set((oldArr || []).map(x => String(x).trim()));
  const newSet = new Set((newArr || []).map(x => String(x).trim()));
  const added = (newArr || []).filter(x => !oldSet.has(String(x).trim()));
  const removed = (oldArr || []).filter(x => !newSet.has(String(x).trim()));
  return { added, removed };
}

function getChanges(sub, src) {
  const changes = [];
  Object.keys(FIELD_LABELS).forEach(f => {
    const newVal = sub[f];
    if (isEmpty(newVal)) return;
    const oldVal = src ? src[f] : undefined;
    if (norm(newVal) === norm(oldVal)) return; // unchanged
    changes.push({ field: f, label: FIELD_LABELS[f], oldVal, newVal });
  });
  return changes;
}

function TextChange({ oldVal, newVal, long }) {
  const [expanded, setExpanded] = useState(false);
  const oldText = oldVal == null ? "" : String(oldVal).trim();
  const newText = String(newVal).trim();
  const truncate = (t, n) => (t.length > n && !expanded) ? t.slice(0, n) + "…" : t;
  return (
    <div className="text-sm leading-relaxed">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase mt-0.5 w-8 shrink-0">Old</span>
        <span className={oldText ? "text-slate-400 line-through flex-1" : "text-slate-300 italic flex-1"}>
          {oldText ? truncate(oldText, long ? 140 : 80) : "(empty)"}
        </span>
      </div>
      <div className="flex items-start gap-2 mt-1">
        <span className="text-[10px] font-semibold text-emerald-600 uppercase mt-0.5 w-8 shrink-0">New</span>
        <span className="text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 flex-1">
          {truncate(newText, long ? 140 : 80)}
        </span>
      </div>
      {(long && (oldText.length > 140 || newText.length > 140)) && (
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-[#C9A96E] hover:underline mt-1 ml-10">
          {expanded ? "Show less" : "Show full text"}
        </button>
      )}
    </div>
  );
}

function NumberChange({ oldVal, newVal }) {
  return (
    <div className="text-sm flex items-center gap-2">
      <span className={oldVal != null && oldVal !== "" ? "text-slate-400 line-through" : "text-slate-300 italic"}>
        {oldVal != null && oldVal !== "" ? oldVal : "(empty)"}
      </span>
      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
      <span className="text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 font-medium">
        {newVal}
      </span>
    </div>
  );
}

function ArrayChange({ oldVal, newVal, isPhotos }) {
  const { added, removed } = arrayDiff(oldVal, newVal);
  if (added.length === 0 && removed.length === 0) {
    return <span className="text-xs text-slate-400 italic">Reordered, no items added or removed</span>;
  }
  if (isPhotos) {
    return (
      <div className="space-y-2">
        {added.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-emerald-600 uppercase mb-1 flex items-center gap-1">
              <Plus className="w-3 h-3" /> {added.length} photo{added.length === 1 ? "" : "s"} added
            </div>
            <div className="flex flex-wrap gap-1.5">
              {added.slice(0, 8).map((url, i) => (
                <img key={i} src={url} alt="" className="w-12 h-12 rounded object-cover border border-emerald-200" />
              ))}
              {added.length > 8 && <span className="text-xs text-slate-400 self-center">+{added.length - 8} more</span>}
            </div>
          </div>
        )}
        {removed.length > 0 && (
          <div className="text-[10px] font-semibold text-red-500 uppercase flex items-center gap-1">
            <Minus className="w-3 h-3" /> {removed.length} photo{removed.length === 1 ? "" : "s"} removed
          </div>
        )}
      </div>
    );
  }
  // amenities
  return (
    <div className="space-y-1.5">
      {added.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {added.map((a, i) => (
            <span key={`a-${i}`} className="inline-flex items-center gap-0.5 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
              <Plus className="w-2.5 h-2.5" /> {a}
            </span>
          ))}
        </div>
      )}
      {removed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {removed.map((a, i) => (
            <span key={`r-${i}`} className="inline-flex items-center gap-0.5 text-[11px] bg-red-50 text-red-600 border border-red-200 line-through px-1.5 py-0.5 rounded-full">
              <Minus className="w-2.5 h-2.5" /> {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeRow({ label, oldVal, newVal, field }) {
  return (
    <div className="py-2 border-t border-slate-50 first:border-t-0">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      {ARRAY_FIELDS.has(field) ? (
        <ArrayChange oldVal={oldVal} newVal={newVal} isPhotos={field === "photo_urls"} />
      ) : NUMBER_FIELDS.has(field) ? (
        <NumberChange oldVal={oldVal} newVal={newVal} />
      ) : (
        <TextChange oldVal={oldVal} newVal={newVal} long={LONG_TEXT_FIELDS.has(field)} />
      )}
    </div>
  );
}

export default function EditChanges({ sub, sourceProperty }) {
  const [open, setOpen] = useState(false);
  const changes = getChanges(sub, sourceProperty);
  if (changes.length === 0) {
    // Submission has field values but none differ from the source — surface that honestly.
    return (
      <div className="mt-2 text-xs text-slate-400 italic">
        No detectable field changes{sourceProperty ? "" : " (source property unavailable)"}
      </div>
    );
  }
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-[#0D1B2A] hover:text-[#C9A96E] transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
          {changes.length} field{changes.length === 1 ? "" : "s"} changed
        </span>
        <span className="text-slate-400 font-normal truncate max-w-[420px]">
          {changes.map(c => c.label).join(", ")}
        </span>
      </button>
      {open && (
        <div className="mt-2 ml-5 pl-3 border-l-2 border-amber-200 bg-amber-50/30 rounded-r-lg px-3 py-1">
          {changes.map(c => (
            <ChangeRow key={c.field} {...c} />
          ))}
        </div>
      )}
    </div>
  );
}