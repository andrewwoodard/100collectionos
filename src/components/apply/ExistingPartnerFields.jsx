import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const INPUT_CLS = "w-full px-4 py-3 bg-white border border-[#D9C8B4] rounded-lg text-[#1a1a1a] text-sm placeholder-[#B0A090] focus:outline-none focus:border-[#C9A96E] focus:ring-2 focus:ring-[#C9A96E]/20 transition-all";
const LABEL_CLS = "text-[11px] font-semibold text-[#8B7355] uppercase tracking-widest mb-1.5 block";

const ROLE_OPTIONS = [
  "Owner",
  "Marketing",
  "Finance",
  "Operations",
  "Other",
];

export default function ExistingPartnerFields({ form, set }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const blurTimeoutRef = useRef(null);
  const partnerListRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const query = (form.company_name || "").trim().toLowerCase();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoadingPartners(true);
    base44.entities.Partner.list("-created_date", 500)
      .then(partners => {
        if (cancelled) return;
        partnerListRef.current = partners;
        const matches = partners
          .filter(p => (p.partner_name || "").toLowerCase().includes(query))
          .slice(0, 5)
          .map(p => p.partner_name);
        setSuggestions(matches);
      })
      .catch(() => { if (!cancelled) setSuggestions([]); })
      .finally(() => { if (!cancelled) setLoadingPartners(false); });
    return () => { cancelled = true; };
  }, [form.company_name]);

  const selectSuggestion = (name) => {
    set("company_name", name);
    setShowSuggestions(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Full Name *</label>
          <input required value={form.full_name} onChange={e => set("full_name", e.target.value)} className={INPUT_CLS} placeholder="Your name" />
        </div>
        <div>
          <label className={LABEL_CLS}>Email *</label>
          <input required type="email" value={form.email} onChange={e => set("email", e.target.value)} className={INPUT_CLS} placeholder="you@company.com" />
          <p className="text-[11px] text-[#B0A090] mt-1.5">Google Workspace or company email preferred</p>
        </div>
      </div>

      {/* Partner name with typeahead */}
      <div className="relative">
        <label className={LABEL_CLS}>Company / Partner Name *</label>
        <input
          required
          value={form.company_name}
          onChange={e => { set("company_name", e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => { blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), 200); }}
          className={INPUT_CLS}
          placeholder="Start typing your company name…"
          autoComplete="off"
        />
        {showSuggestions && (form.company_name || "").trim().length >= 2 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D9C8B4] rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
            {loadingPartners ? (
              <div className="px-4 py-3 text-sm text-[#B0A090]">Searching partners…</div>
            ) : suggestions.length > 0 ? (
              <>
                <div className="px-4 py-2 text-[10px] font-semibold text-[#B0A090] uppercase tracking-widest bg-[#FDFAF6] border-b border-[#E8DDD0]">
                  Matching partners
                </div>
                {suggestions.map(name => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectSuggestion(name); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[#0D1B2A] hover:bg-[#FBF6EF] transition-colors border-b border-[#F5EFE7] last:border-0"
                  >
                    {name}
                  </button>
                ))}
              </>
            ) : (
              <div className="px-4 py-3 text-sm text-[#B0A090]">No matching partners found — that's okay, submit anyway.</div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className={LABEL_CLS}>Your Role *</label>
        <select required value={form.role || ""} onChange={e => set("role", e.target.value)} className={INPUT_CLS}>
          <option value="">Select your role</option>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Anything else we should know? <span className="text-[#B0A090] normal-case font-normal">(optional)</span></label>
        <textarea value={form.message} onChange={e => set("message", e.target.value)} rows={4} className={INPUT_CLS + " resize-none"} placeholder="e.g. I'm the new CEO, previous contact was Jane. Or, I'm the ops manager and need my own login separate from Jane's." />
      </div>
    </>
  );
}