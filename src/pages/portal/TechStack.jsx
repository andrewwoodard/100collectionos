import React, { useState, useEffect } from "react";
import PortalLayout from "@/components/portal/PortalLayout";
import WizardStepIndicator from "@/components/portal/wizard/WizardStepIndicator";
import TechStackField from "@/components/portal/TechStackField";
import { TECH_STACK_STEPS, TECH_STACK_FIELDS, STEP_LABELS, EMPTY_TECH_STACK } from "@/lib/techStackConfig";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";

export default function TechStack() {
  const { user } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(EMPTY_TECH_STACK);
  const [techStackId, setTechStackId] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: partnerRecord } = useQuery({
    queryKey: ["portal-partner", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const linked = await base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } });
      if (linked.length > 0) return linked[0];
      if (user.email) {
        const matches = await base44.entities.Partner.filter({ primary_contact_email: user.email });
        return matches[0] || null;
      }
      return null;
    },
    enabled: !!user?.id,
  });

  const partnerId = partnerRecord?.id;

  const { data: techStack, isLoading } = useQuery({
    queryKey: ["partner-tech-stack", partnerId],
    queryFn: async () => {
      const results = await base44.entities.PartnerTechStack.filter({ partner_id: partnerId });
      return results?.[0] || null;
    },
    enabled: !!partnerId,
  });

  useEffect(() => {
    if (techStack) {
      const data = { ...EMPTY_TECH_STACK };
      TECH_STACK_FIELDS.forEach(f => {
        if (f.type === "multiselect") {
          data[f.key] = techStack[f.key] || [];
        } else {
          data[f.key] = techStack[f.key] || "";
        }
        if (f.type === "select" || f.type === "multiselect") {
          data[f.key + "_other"] = techStack[f.key + "_other"] || "";
        }
      });
      setFormData(data);
      setTechStackId(techStack.id);
    }
  }, [techStack]);

  const updateField = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const autoSave = async () => {
    if (!partnerId) return;
    setSaving(true);
    try {
      const { notes, ...partnerPayload } = formData;
      const payload = {
        ...partnerPayload,
        partner_id: partnerId,
        last_updated_by: user?.email || "",
        last_updated_at: new Date().toISOString(),
      };
      if (techStackId) {
        await base44.entities.PartnerTechStack.update(techStackId, payload);
      } else {
        const created = await base44.entities.PartnerTechStack.create(payload);
        setTechStackId(created.id);
      }
      queryClient.invalidateQueries({ queryKey: ["partner-tech-stack", partnerId] });
    } catch (e) {
      console.warn("Auto-save failed", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    await autoSave();
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    await autoSave();
    setSubmitted(true);
  };

  const stepFields = TECH_STACK_FIELDS.filter(f => f.step === step && !f.adminOnly);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </PortalLayout>
    );
  }

  if (submitted) {
    return (
      <PortalLayout>
        <div className="max-w-xl mx-auto px-2 py-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-serif text-[#0D1B2A] mb-2">Thanks — your tech stack is on file.</h2>
          <p className="text-slate-500 mb-6">Update anytime.</p>
          <Button variant="outline" onClick={() => setSubmitted(false)}>Edit my responses</Button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto px-2 py-6 lg:py-10">
        {!techStack && step === 1 && (
          <div className="bg-[#0D1B2A] text-white rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-serif mb-2">Tell us about your tech stack</h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Help us understand your operation so we can better support integrations and provide tailored resources.
              All fields are optional — skip anything that doesn't apply.
            </p>
          </div>
        )}

        <WizardStepIndicator currentStep={step} steps={STEP_LABELS} />

        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h2 className="text-lg font-serif text-[#0D1B2A] mb-1">{TECH_STACK_STEPS[step - 1].label}</h2>
          <p className="text-xs text-slate-400 mb-6">Step {step} of 4 — all fields optional</p>

          <div className="space-y-5">
            {stepFields.map(field => (
              <TechStackField
                key={field.key}
                field={field}
                value={formData[field.key]}
                otherValue={formData[field.key + "_other"]}
                onChange={v => updateField(field.key, v)}
                onOtherChange={v => updateField(field.key + "_other", v)}
              />
            ))}
          </div>

          {step === 4 && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Review & Submit</h3>
              <div className="space-y-3 mb-4">
                {TECH_STACK_STEPS.map(s => {
                  const fields = TECH_STACK_FIELDS.filter(f => f.step === s.num && !f.adminOnly);
                  const filled = fields.filter(f => {
                    const v = formData[f.key];
                    if (f.type === "multiselect") return Array.isArray(v) && v.length > 0;
                    return v;
                  });
                  if (filled.length === 0) return null;
                  return (
                    <div key={s.num}>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{s.category}</div>
                      <div className="space-y-0.5">
                        {filled.map(f => {
                          const v = formData[f.key];
                          let display = v;
                          if (f.type === "multiselect") display = v.join(", ");
                          else if (v === "Other") display = `Other: ${formData[f.key + "_other"] || ""}`;
                          return (
                            <div key={f.key} className="text-sm">
                              <span className="text-slate-400">{f.label}:</span>{" "}
                              <span className="text-slate-700">{display}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            <Button variant="ghost" onClick={handleBack} disabled={step === 1}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <div className="flex items-center gap-3">
              {saving && <span className="text-xs text-slate-400">Saving…</span>}
              {step < 4 ? (
                <Button onClick={handleNext}>
                  Next <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              ) : (
                <Button onClick={handleSubmit}>
                  Submit
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}