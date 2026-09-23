import React, { useState, useRef, Suspense } from "react";
import ApplyShell from "@/components/apply/ApplyShell";
import CinematicHero from "@/components/apply/CinematicHero";
import StatsStrip from "@/components/apply/StatsStrip";
import ClosingImage from "@/components/apply/ClosingImage";
import ApplySuccess from "@/components/apply/ApplySuccess";
import { initialForm, submitApplication } from "@/components/apply/ApplyShared";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useApplyShowcase } from "@/hooks/useApplyShowcase";
import useApplyFunnelTracker from "@/hooks/useApplyFunnelTracker";
import { useToast } from "@/components/ui/use-toast";
import JoinSegmentation from "@/components/join/JoinSegmentation";
import JoinValueProps from "@/components/join/JoinValueProps";
import JoinForm from "@/components/join/JoinForm";
import JoinWhatNext from "@/components/join/JoinWhatNext";
import JoinReviews from "@/components/join/JoinReviews";
import JoinFAQs from "@/components/join/JoinFAQs";
import JoinLogoGrid from "@/components/join/JoinLogoGrid";
import JoinFeaturedProperties from "@/components/join/JoinFeaturedProperties";

// InGoodCompany is below the fold — code-split it out of the initial bundle.
const InGoodCompany = React.lazy(() => import("@/components/apply/InGoodCompany"));

// Maps the experiment segment to the PartnerApplication applicant_type track
// used by the shared submission helper.
const SEGMENT_TO_TRACK = {
  property_manager: "property_manager",
  homeowner: "property_owner",
  existing_partner: "existing_partner_access_request",
};

// /join — Wander-inspired unified apply prototype. Side experiment: not linked
// from anywhere on the site or in emails. Submissions are tagged with
// source: 'join_v2_experiment' and the selected segment so conversion can be
// compared against the standard /apply funnel.
export default function Join() {
  usePageMeta("join", {
    title: "Join The 100 Collection",
    description:
      "A curated network of premier vacation rental brands and the distinctive homes they manage.",
  });
  const showcase = useApplyShowcase();
  const [segment, setSegment] = useState(null);
  const [form, setForm] = useState(initialForm());
  const [formLoadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [appId, setAppId] = useState(null);
  const formRef = useRef(null);
  const { toast } = useToast();
  const funnel = useApplyFunnelTracker({
    applicantType: segment,
    pagePath: "/join",
    formRef,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSelect = (id) => {
    setSegment(id);
    funnel.trackPath(id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const track = SEGMENT_TO_TRACK[segment];
    if (!track) return;
    setLoading(true);
    try {
      const id = await submitApplication(form, track, {
        formLoadedAt,
        source: "join_v2_experiment",
        experimentSegment: segment,
      });
      setAppId(id);
      setSubmitted(true);
      funnel.trackSubmit();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description:
          err?.message || "Please try again or email hello@theonehundredcollection.com",
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <ApplyShell>
        <ApplySuccess track={SEGMENT_TO_TRACK[segment] || "property_manager"} appId={appId} />
      </ApplyShell>
    );
  }

  return (
    <ApplyShell>
      <CinematicHero
        images={showcase.heroImages}
        altTexts={showcase.heroAltTexts}
        heading="Join The 100 Collection"
        subheading="A curated network of premier vacation rental brands and the distinctive homes they manage."
        eyebrow={null}
        scrollHint="See what belonging looks like"
      />
      <JoinSegmentation segment={segment} onSelect={handleSelect} />
      <JoinValueProps segment={segment} />
      <Suspense
        fallback={<section className="bg-[#FAFAF8] pt-16 pb-4 min-h-[300px]" />}
      >
        <InGoodCompany
          partnerStrip={showcase.partnerStrip}
          featuredProperties={[]}
          fallbackImage={showcase.featuredFallback}
        />
      </Suspense>
      <StatsStrip />
      <JoinForm
        segment={segment}
        form={form}
        set={set}
        onSubmit={handleSubmit}
        loading={loading}
        formRef={formRef}
      />
      <JoinWhatNext segment={segment} />
      <JoinReviews segment={segment} />
      <JoinFAQs segment={segment} />
      <JoinLogoGrid />
      <JoinFeaturedProperties featured={showcase.featuredProperties} />
      <ClosingImage
        image={showcase.closingImage}
        alt={showcase.closingAlt}
        quote={showcase.closingQuote}
      />
    </ApplyShell>
  );
}