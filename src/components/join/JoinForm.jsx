import React, { useState, useEffect } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { INPUT_CLS, LABEL_CLS, PM_PROP_COUNTS } from "@/components/apply/ApplyShared";
import HoneypotField from "@/components/apply/HoneypotField";

const ROLE_OPTIONS = ["Owner", "Marketing", "Finance", "Operations", "Other"];
const SELF_MANAGED = ["Self-managed", "Working with a manager"];

// Progressive form: email + first name first, then segment-specific fields
// reveal on blur, then an optional message. The submit button only appears
// once the required fields for the selected segment are filled.
export default function JoinForm({ segment, form, set, onSubmit, loading, formRef }) {
  const [stage1, setStage1] = useState(false);
  const [stage2, setStage2] = useState(false);
  const [partnerNames, setPartnerNames] = useState([]);

  // Fetch partner names once for the existing-partner company datalist.
  useEffect(() => {
    if (segment !== "existing_partner") return;
    let cancelled = false;
    base44.entities.Partner
      .list("-created_date", 500)
      .then((ps) => {
        if (!cancelled) setPartnerNames(ps.map((p) => p.partner_name).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [segment]);

  const basicsFilled = !!(form.email || "").trim() && !!(form.full_name || "").trim();
  const stage1RequiredFilled =
    segment === "property_manager"
      ? !!(form.company_name || "").trim()
      : segment === "homeowner"
        ? !!(form.property_address || "").trim() && !!(form.property_locations || "").trim()
        : segment === "existing_partner"
          ? !!(form.company_name || "").trim() && !!(form.role || "").trim()
          : false;
  const canSubmit = basicsFilled && stage1RequiredFilled;

  const messageLabel =
    segment === "homeowner"
      ? "Tell us about your home, and anything else we should know (optional)"
      : "Tell us anything else that would help us understand you (optional)";

  return (
    <section id="join-form" className="bg-white py-20 border-t border-[#E8DDD0]">
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-3">
            Start your application
          </div>
          <h2 className="font-serif text-3xl text-[#0D1B2A] mb-2">Begin with the basics</h2>
          <p className="text-sm text-[#B0A090]">A few details and we'll take it from there.</p>
        </div>

        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="space-y-5 bg-[#FAFAF8] border border-[#E8DDD0] rounded-2xl p-7 shadow-sm"
        >
          <HoneypotField />

          {/* Stage 0 — basics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>First Name *</label>
              <input
                required
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                onBlur={() => basicsFilled && setStage1(true)}
                className={INPUT_CLS}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => basicsFilled && setStage1(true)}
                className={INPUT_CLS}
                placeholder="you@email.com"
              />
            </div>
          </div>

          {/* Stage 1 — segment-specific fields */}
          {stage1 && segment && (
            <div className="space-y-5 pt-5 border-t border-[#E8DDD0] mt-2">
              {segment === "property_manager" && (
                <>
                  <div>
                    <label className={LABEL_CLS}>Company Name *</label>
                    <input
                      required
                      value={form.company_name}
                      onChange={(e) => set("company_name", e.target.value)}
                      onBlur={() => stage1RequiredFilled && setStage2(true)}
                      className={INPUT_CLS}
                      placeholder="Your company name"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLS}>Number of Properties</label>
                      <select
                        value={form.property_count}
                        onChange={(e) => set("property_count", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select range</option>
                        {PM_PROP_COUNTS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Primary Destination</label>
                      <input
                        value={form.property_locations}
                        onChange={(e) => set("property_locations", e.target.value)}
                        className={INPUT_CLS}
                        placeholder="e.g. Park City, Turks & Caicos"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Website URL</label>
                    <input
                      value={form.website}
                      onChange={(e) => set("website", e.target.value)}
                      className={INPUT_CLS}
                      placeholder="https://yourwebsite.com"
                    />
                  </div>
                </>
              )}

              {segment === "homeowner" && (
                <>
                  <div>
                    <label className={LABEL_CLS}>Where is your home? *</label>
                    <input
                      required
                      value={form.property_address}
                      onChange={(e) => set("property_address", e.target.value)}
                      onBlur={() => stage1RequiredFilled && setStage2(true)}
                      className={INPUT_CLS}
                      placeholder="City, State"
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>
                      Are you self-managed or working with a manager? *
                    </label>
                    <select
                      required
                      value={form.property_locations || ""}
                      onChange={(e) => set("property_locations", e.target.value)}
                      onBlur={() => stage1RequiredFilled && setStage2(true)}
                      className={INPUT_CLS}
                    >
                      <option value="">Select one</option>
                      {SELF_MANAGED.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {segment === "existing_partner" && (
                <>
                  <div>
                    <label className={LABEL_CLS}>Company / Partner Name *</label>
                    <input
                      required
                      list="join-partner-names"
                      value={form.company_name}
                      onChange={(e) => set("company_name", e.target.value)}
                      onBlur={() => stage1RequiredFilled && setStage2(true)}
                      className={INPUT_CLS}
                      placeholder="Start typing your company name"
                      autoComplete="off"
                    />
                    <datalist id="join-partner-names">
                      {partnerNames.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Your Role *</label>
                    <select
                      required
                      value={form.role || ""}
                      onChange={(e) => set("role", e.target.value)}
                      onBlur={() => stage1RequiredFilled && setStage2(true)}
                      className={INPUT_CLS}
                    >
                      <option value="">Select your role</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Stage 2 — optional message */}
          {stage2 && (
            <div className="pt-5 border-t border-[#E8DDD0] mt-2">
              <label className={LABEL_CLS}>{messageLabel}</label>
              <textarea
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                rows={4}
                className={INPUT_CLS + " resize-none"}
                placeholder=""
              />
            </div>
          )}

          {/* Submit — only when required fields are filled */}
          {canSubmit && (
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#0D1B2A] text-white font-semibold text-sm py-4 rounded-full hover:bg-[#1a2f42] disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-4 shadow-md"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  Submit application <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {segment && !canSubmit && (
            <p className="text-[11px] text-[#C0B0A0] text-center leading-relaxed pt-1">
              {basicsFilled
                ? "Complete the required fields above to continue."
                : "Enter your name and email to continue."}
            </p>
          )}
          {!segment && (
            <p className="text-[11px] text-[#C0B0A0] text-center leading-relaxed pt-1">
              Choose your path above to see the right questions for you.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}