import React from "react";
import SocialMediaFields from "./SocialMediaFields";
import { INPUT_CLS, LABEL_CLS, HOW_HEARD, PM_PROP_COUNTS } from "./ApplyShared";

export default function ManagerFields({ form, set, prefilledEmail }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Full Name *</label>
          <input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className={INPUT_CLS} placeholder="Your name" />
        </div>
        <div>
          <label className={LABEL_CLS}>Email *</label>
          <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} readOnly={prefilledEmail} className={`${INPUT_CLS} ${prefilledEmail ? "bg-[#F3F1EC] text-[#8B7355] cursor-not-allowed" : ""}`} placeholder="email@company.com" />
          {prefilledEmail && <p className="text-[11px] text-[#B0A090] mt-1">From your account</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Company Name *</label>
          <input required value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className={INPUT_CLS} placeholder="Your company name" />
        </div>
        <div>
          <label className={LABEL_CLS}>Phone</label>
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={INPUT_CLS} placeholder="+1 (555) 000-0000" />
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Company Website</label>
        <input value={form.website} onChange={(e) => set("website", e.target.value)} className={INPUT_CLS} placeholder="https://yourwebsite.com" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Number of Properties</label>
          <select value={form.property_count} onChange={(e) => set("property_count", e.target.value)} className={INPUT_CLS}>
            <option value="">Select range</option>
            {PM_PROP_COUNTS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>How Did You Hear?</label>
          <select value={form.how_heard} onChange={(e) => set("how_heard", e.target.value)} className={INPUT_CLS}>
            <option value="">Select</option>
            {HOW_HEARD.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Property Locations / Markets</label>
        <input value={form.property_locations} onChange={(e) => set("property_locations", e.target.value)} className={INPUT_CLS} placeholder="e.g. Malibu, Aspen, Turks & Caicos" />
      </div>
      <SocialMediaFields label="Social media for your brand?" links={form.social_media_links} onChange={(v) => set("social_media_links", v)} />
      <div>
        <label className={LABEL_CLS}>Anything else we should know? <span className="text-[#B0A090] normal-case font-normal">(optional)</span></label>
        <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={4} className={INPUT_CLS + " resize-none"} placeholder="Describe the style, location, and uniqueness of your properties." />
      </div>
    </>
  );
}