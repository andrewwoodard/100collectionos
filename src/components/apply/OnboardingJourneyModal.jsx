import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LayoutDashboard, FileText, CheckCircle2 } from "lucide-react";

const STEPS = [
  {
    icon: LayoutDashboard,
    title: "Get access to your Homeowner Dashboard",
    body: "After you submit your application, we review it personally and invite you into your private portal. From there you can manage your property details, track onboarding status, and communicate with our team all in one place.",
  },
  {
    icon: FileText,
    title: "Add your property information",
    body: "Use our guided Add Property flow to share your listing URL, photos, amenities, and the story behind your home. Our writers and editors use this to craft your magazine-quality feature.",
  },
  {
    icon: CheckCircle2,
    title: "Get approved to join the collection",
    body: "Our team reviews your property for fit with our curation standards. Once approved, your home is published on theonehundredcollection.com with its own destination page and editorial feature.",
  },
];

export default function OnboardingJourneyModal({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif font-medium text-[#0D1B2A]">
            Your onboarding journey
          </DialogTitle>
          <p className="text-sm text-[#8B7355] leading-relaxed mt-1">
            Here's what happens after you submit your application. Most homeowner partners are fully live within 2 to 3 days.
          </p>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-11 h-11 rounded-full bg-[#FBF6EF] border border-[#C9A96E]/30 flex items-center justify-center shrink-0">
                  <step.icon className="w-5 h-5 text-[#C9A96E]" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-px flex-1 bg-[#E8DDD0] my-1" />
                )}
              </div>
              <div className="pt-1 pb-6">
                <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-1">
                  Step {i + 1}
                </div>
                <div className="text-base font-semibold text-[#0D1B2A] mb-1.5">
                  {step.title}
                </div>
                <p className="text-sm text-[#8B7355] leading-relaxed">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}