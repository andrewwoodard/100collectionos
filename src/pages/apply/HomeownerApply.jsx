import React, { useState, useRef } from "react";
import ApplyShell, { ApplyBreadcrumb } from "@/components/apply/ApplyShell";
import HomeownerEditorial from "@/components/apply/HomeownerEditorial";
import { WhatToExpect, ApplyFormCard } from "@/components/apply/ApplySections";
import HomeownerFields from "@/components/apply/HomeownerFields";
import ApplySuccess from "@/components/apply/ApplySuccess";
import OnboardingJourneyModal from "@/components/apply/OnboardingJourneyModal";
import HoneypotField from "@/components/apply/HoneypotField";
import { useToast } from "@/components/ui/use-toast";
import { initialForm, submitApplication } from "@/components/apply/ApplyShared";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useApplyShowcase } from "@/hooks/useApplyShowcase";
import useApplyFunnelTracker from "@/hooks/useApplyFunnelTracker";
import { useAuthPrefill } from "@/hooks/useAuthPrefill";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import { useScrollToFormOnSignup } from "@/hooks/useScrollToFormOnSignup";

export default function HomeownerApply() {
  usePageMeta("apply_homeowner");
  const showcase = useApplyShowcase();
  const [form, setForm] = useState(initialForm());
  const [formLoadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [appId, setAppId] = useState(null);
  const [showPropertyErrors, setShowPropertyErrors] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const formRef = useRef(null);
  const { trackSubmit } = useApplyFunnelTracker({ applicantType: "homeowner", pagePath: "/apply/homeowner", formRef });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const prefilled = useAuthPrefill(setForm);
  useSignupApplication();
  useScrollToFormOnSignup();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.property_locations) {
      toast({
        variant: "destructive",
        title: "Market required",
        description: "Please select a market to continue.",
      });
      return;
    }
    const validCount = (form.submitted_properties || []).filter((p) => p.listing_url.trim()).length;
    if (validCount === 0) {
      setShowPropertyErrors(true);
      return;
    }
    setLoading(true);
    try {
      const id = await submitApplication(form, "property_owner", { formLoadedAt });
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
        <ApplySuccess track="property_owner" appId={appId} />
      </ApplyShell>
    );
  }

  return (
    <ApplyShell breadcrumb={<ApplyBreadcrumb items={[{ label: "Apply", to: "/apply" }, { label: "Homeowner" }]} />}>
      <HomeownerEditorial heroImage={showcase.homeownerHero} />
      <WhatToExpect
        callout="Once accepted, most homeowner partners are fully live within 2 to 3 days."
        linkLabel="See the full onboarding journey"
        onLinkClick={() => setJourneyOpen(true)}
      />
      <OnboardingJourneyModal open={journeyOpen} onOpenChange={setJourneyOpen} />
      <ApplyFormCard
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Submit application"
        title="Tell us about your home"
        intro="Takes about 5 minutes. We review every application personally."
        formRef={formRef}
      >
        <HoneypotField />
        <HomeownerFields form={form} set={set} showErrors={showPropertyErrors} prefilledEmail={prefilled.email} />
      </ApplyFormCard>
    </ApplyShell>
  );
}