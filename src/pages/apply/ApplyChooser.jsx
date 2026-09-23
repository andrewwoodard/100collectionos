import React, { Suspense, lazy } from "react";
import ApplyShell from "@/components/apply/ApplyShell";
import CinematicHero from "@/components/apply/CinematicHero";
import ChooserCards from "@/components/apply/ChooserCards";
import StatsStrip from "@/components/apply/StatsStrip";
import useFadeNavigate from "@/components/apply/useFadeNavigate";
import { useApplyShowcase } from "@/hooks/useApplyShowcase";
import { usePageMeta } from "@/hooks/usePageMeta";
import useApplyFunnelTracker from "@/hooks/useApplyFunnelTracker";

// ClosingImage is far below the fold — code-split it out of the initial bundle.
// Subtle navy placeholder while it mounts, no spinner.
const ClosingImage = lazy(() => import("@/components/apply/ClosingImage"));

export default function ApplyChooser() {
  usePageMeta("apply");
  const showcase = useApplyShowcase();
  const fadeNavigate = useFadeNavigate();
  const { trackPath } = useApplyFunnelTracker({ applicantType: null, pagePath: "/apply" });

  const handleChoose = (href) => {
    const slug = href.replace("/apply/", "") || "apply";
    trackPath(slug);
    fadeNavigate(href);
  };

  const urlParams = new URLSearchParams(window.location.search);
  const fromSignup = urlParams.get("from") === "signup";
  const prefillEmail = urlParams.get("email") || "";

  const cardLink = (to) => {
    const params = new URLSearchParams();
    if (fromSignup) params.set("from", "signup");
    if (prefillEmail) params.set("email", prefillEmail);
    const qs = params.toString();
    return qs ? `${to}?${qs}` : to;
  };

  return (
    <ApplyShell>
      <CinematicHero images={showcase.heroImages} altTexts={showcase.heroAltTexts} />

      {fromSignup && (
        <div className="max-w-3xl mx-auto px-6 pt-8">
          <div className="bg-[#FBF6EF] border border-[#E8DDD0] rounded-xl px-5 py-4 text-sm text-[#5B4A36] leading-relaxed">
            You tried to sign in to the portal but we didn't recognize your account. No problem. Take three minutes to introduce yourself and we'll get back to you within 48 hours.
          </div>
        </div>
      )}

      <ChooserCards
        managerCard={showcase.managerCard}
        managerAlt={showcase.managerCardAlt}
        homeownerCard={showcase.homeownerCard}
        homeownerAlt={showcase.homeownerCardAlt}
        partnerCard={showcase.partnerCard}
        partnerAlt={showcase.partnerCardAlt}
        managerHref={cardLink("/apply/property-manager")}
        homeownerHref={cardLink("/apply/homeowner")}
        partnerHref={cardLink("/apply/existing-partner")}
        onChoose={handleChoose}
      />

      <StatsStrip />

      <div className="px-6 pb-16 text-center">
        <p className="text-sm text-[#B0A090]">
          Not sure? Contact{" "}
          <a href="mailto:hello@theonehundredcollection.com" className="text-[#C9A96E] hover:underline">
            hello@theonehundredcollection.com
          </a>
        </p>
      </div>

      <Suspense fallback={<section className="h-[60vh] min-h-[420px] w-full bg-[#0D1B2A]" />}>
        <ClosingImage image={showcase.closingImage} alt={showcase.closingAlt} quote={showcase.closingQuote} />
      </Suspense>
    </ApplyShell>
  );
}