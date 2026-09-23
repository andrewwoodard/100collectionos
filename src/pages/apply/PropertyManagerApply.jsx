import React, { useState, useRef, Suspense, lazy } from "react";
import { Sparkles, Users, TrendingUp } from "lucide-react";
import ApplyShell, { ApplyBreadcrumb } from "@/components/apply/ApplyShell";
import ApplyHero from "@/components/apply/ApplyHero";
import { ValueProps, WhatToExpect, ApplyFormCard } from "@/components/apply/ApplySections";
import FormHeroImage from "@/components/apply/FormHeroImage";

// InGoodCompany (the "Featured in the Collection" social-proof section) is
// below the fold — code-split it out of the initial bundle.
const InGoodCompany = lazy(() => import("@/components/apply/InGoodCompany"));
import ManagerFields from "@/components/apply/ManagerFields";
import ApplySuccess from "@/components/apply/ApplySuccess";
import HoneypotField from "@/components/apply/HoneypotField";
import { useToast } from "@/components/ui/use-toast";
import { initialForm, submitApplication } from "@/components/apply/ApplyShared";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useApplyShowcase } from "@/hooks/useApplyShowcase";
import useApplyFunnelTracker from "@/hooks/useApplyFunnelTracker";
import { useAuthPrefill } from "@/hooks/useAuthPrefill";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import { useScrollToFormOnSignup } from "@/hooks/useScrollToFormOnSignup";

const VALUE_PROPS = [
  {
    icon: Sparkles,
    title: "Elevate Your Brand",
    subtitle: "Stand out for what makes your portfolio distinctive.",
    body: "The 100 Collection positions your company among a national network of leading vacation rental brands, building recognition and credibility where every rental otherwise looks the same.",
  },
  {
    icon: Users,
    title: "Guests Who Choose the Collection",
    subtitle: "Travelers who plan carefully and stay well.",
    body: "Your properties gain exposure to an audience searching for editorial-quality homes, trusted hospitality, and thoughtfully managed stays, not another marketplace listing.",
  },
  {
    icon: TrendingUp,
    title: "Grow Your Direct Bookings",
    subtitle: "Turn visibility into demand you own.",
    body: "Editorial features and destination pages introduce travelers to your portfolio and route them straight to you, so you build demand while keeping the guest relationship.",
  },
];

export default function PropertyManagerApply() {
  usePageMeta("apply_property_manager");
  const [form, setForm] = useState(initialForm());
  const [formLoadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [appId, setAppId] = useState(null);
  const formRef = useRef(null);
  const { trackSubmit } = useApplyFunnelTracker({ applicantType: "property_manager", pagePath: "/apply/property-manager", formRef });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const prefilled = useAuthPrefill(setForm);
  useSignupApplication();
  useScrollToFormOnSignup();
  const { toast } = useToast();
  const showcase = useApplyShowcase();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const id = await submitApplication(form, "property_manager", { formLoadedAt });
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
        <ApplySuccess track="property_manager" appId={appId} />
      </ApplyShell>
    );
  }

  return (
    <ApplyShell breadcrumb={<ApplyBreadcrumb items={[{ label: "Apply", to: "/apply" }, { label: "Vacation Rental Manager" }]} />}>
      <ApplyHero
        eyebrow="Vacation Rental Manager"
        heading="Elevate your vacation rental company"
        subheading="The 100 Collection™ is a curated network of vacation rental managers recognized for exceptional properties, thoughtful operations, and premium hospitality."
      />
      <ValueProps items={VALUE_PROPS} />
      <WhatToExpect
        callout="Once accepted, most VRM partners are fully live within 21 to 30 days."
        linkLabel="See the full onboarding journey"
        linkHref="https://theonehundredcollection.com"
      />
      <Suspense fallback={<section className="bg-[#FAFAF8] pt-16 pb-4 min-h-[300px]" />}>
        <InGoodCompany
          partnerStrip={showcase.partnerStrip}
          featuredProperties={showcase.featuredProperties}
          fallbackImage={showcase.featuredFallback}
        />
      </Suspense>
      <FormHeroImage image={showcase.managerFormHero} />
      <ApplyFormCard
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Submit application"
        title="Tell us about your company"
        intro="Takes about 5 minutes. We review every application personally."
        formRef={formRef}
      >
        <HoneypotField />
        <ManagerFields form={form} set={set} prefilledEmail={prefilled.email} />
      </ApplyFormCard>
    </ApplyShell>
  );
}