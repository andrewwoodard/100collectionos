import React, { useState, useRef } from "react";
import ApplyShell, { ApplyBreadcrumb } from "@/components/apply/ApplyShell";
import ApplyHero from "@/components/apply/ApplyHero";
import { ApplyFormCard } from "@/components/apply/ApplySections";
import ExistingPartnerFields from "@/components/apply/ExistingPartnerFields";
import ApplySuccess from "@/components/apply/ApplySuccess";
import { useToast } from "@/components/ui/use-toast";
import { initialForm, submitApplication } from "@/components/apply/ApplyShared";
import HoneypotField from "@/components/apply/HoneypotField";
import { usePageMeta } from "@/hooks/usePageMeta";
import useApplyFunnelTracker from "@/hooks/useApplyFunnelTracker";

export default function ExistingPartnerApply() {
  usePageMeta("apply_existing_partner");
  const [form, setForm] = useState(initialForm());
  const [formLoadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [appId, setAppId] = useState(null);
  const formRef = useRef(null);
  const { trackSubmit } = useApplyFunnelTracker({ applicantType: "existing_partner", pagePath: "/apply/existing-partner", formRef });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const id = await submitApplication(form, "existing_partner_access_request", { formLoadedAt });
      setAppId(id);
      setSubmitted(true);
      trackSubmit();
    } catch (err) {
      console.error("[apply] submit failed", err);
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: err?.response?.data?.error || err?.message || "Please try again or email hello@theonehundredcollection.com",
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <ApplyShell>
        <ApplySuccess track="existing_partner_access_request" appId={appId} />
      </ApplyShell>
    );
  }

  return (
    <ApplyShell breadcrumb={<ApplyBreadcrumb items={[{ label: "Apply", to: "/apply" }, { label: "Already a Partner" }]} />}>
      <ApplyHero
        eyebrow="Already a Partner"
        heading="Welcome back."
        subheading="Enter your work email and we'll match you to your company's portal or route you to your teammate for access."
      />
      <ApplyFormCard
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Request portal access"
        title="Request Portal Access"
        intro="We'll match your details to an existing partner account."
        formRef={formRef}
      >
        <HoneypotField />
        <ExistingPartnerFields form={form} set={set} />
      </ApplyFormCard>
      <div className="max-w-2xl mx-auto px-6 pb-16">
        <p className="text-xs text-[#B0A090] text-center leading-relaxed">
          If you're not sure whether your company is already a partner, submit this form and we'll check. If we can't find a match, we'll reach out directly.
        </p>
      </div>
    </ApplyShell>
  );
}