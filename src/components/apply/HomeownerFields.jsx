import React from "react";
import { TrendingUp } from "lucide-react";
import SubmittedPropertiesFields from "./SubmittedPropertiesFields";
import { INPUT_CLS, LABEL_CLS, HOW_HEARD } from "./ApplyShared";

export default function HomeownerFields({ form, set, showErrors, prefilledEmail }) {
  const hasWebsite = form.has_direct_booking_website;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Full Name *</label>
          <input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className={INPUT_CLS} placeholder="Your name" />
        </div>
        <div>
          <label className={LABEL_CLS}>Email *</label>
          <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} readOnly={prefilledEmail} className={`${INPUT_CLS} ${prefilledEmail ? "bg-[#F3F1EC] text-[#8B7355] cursor-not-allowed" : ""}`} placeholder="email@example.com" />
          {prefilledEmail && <p className="text-[11px] text-[#B0A090] mt-1">From your account</p>}
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Phone</label>
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={INPUT_CLS} placeholder="+1 (555) 000-0000" />
      </div>
      <div>
        <label className={LABEL_CLS}>Do you have a direct booking website?</label>
        <div className="flex gap-3 mt-1">
          <button type="button" onClick={() => set("has_direct_booking_website", true)} className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-all ${hasWebsite === true ? "bg-[#C9A96E] border-[#C9A96E] text-white" : "border-[#D9C8B4] text-[#8B7355] hover:border-[#C9A96E] hover:text-[#C9A96E] bg-white"}`}>Yes</button>
          <button type="button" onClick={() => set("has_direct_booking_website", false)} className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-all ${hasWebsite === false ? "bg-[#C9A96E] border-[#C9A96E] text-white" : "border-[#D9C8B4] text-[#8B7355] hover:border-[#C9A96E] hover:text-[#C9A96E] bg-white"}`}>No</button>
        </div>
        {hasWebsite === false && (
          <div className="mt-3 flex items-start gap-3 bg-[#FBF6EF] border border-[#C9A96E]/30 rounded-lg px-4 py-3">
            <TrendingUp className="w-4 h-4 text-[#C9A96E] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#8B7355] leading-relaxed">No worries. We'll build you one. A direct booking website can save you up to <strong className="text-[#C9A96E]">18% on OTA fees</strong> when your guests book direct.</p>
          </div>
        )}
      </div>
      {hasWebsite === true && (
        <div>
          <label className={LABEL_CLS}>Direct Booking Website URL</label>
          <input type="text" value={form.direct_booking_website} onChange={(e) => set("direct_booking_website", e.target.value)} className={INPUT_CLS} placeholder="https://yourbookingsite.com" />
        </div>
      )}
      <div>
        <label className={LABEL_CLS}>Market *</label>
        <select
          required
          value={form.property_locations || ""}
          onChange={(e) => set("property_locations", e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Select a market</option>
          {["Charlottesville", "Charleston", "Austin", "Lake Tahoe", "Isle of Palms", "Other"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <SubmittedPropertiesFields properties={form.submitted_properties || []} onChange={(v) => set("submitted_properties", v)} showErrors={showErrors} />
      <div>
        <label className={LABEL_CLS}>How Did You Hear?</label>
        <select value={form.how_heard} onChange={(e) => set("how_heard", e.target.value)} className={INPUT_CLS}>
          <option value="">Select</option>
          {HOW_HEARD.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Anything else we should know? <span className="text-[#B0A090] normal-case font-normal">(optional)</span></label>
        <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={4} className={INPUT_CLS + " resize-none"} placeholder="What makes your home exceptional? Design style, unique features, location." />
      </div>
    </>
  );
}