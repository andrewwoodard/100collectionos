import React from "react";
import { CheckCircle } from "lucide-react";

export default function ApplySuccess({ track, appId }) {
  const isExisting = track === "existing_partner_access_request";
  const steps = isExisting
    ? [
        { label: "Request received", time: "Now", done: true },
        { label: "Account matching", time: "Within 1 business day", done: false },
        { label: "Portal activation link", time: "Sent to your email", done: false },
        { label: "Access your portal", time: "Click the link to activate", done: false },
      ]
    : [
        { label: "Application received", time: "Now", done: true },
        { label: "Review by our team", time: "Within 48 hours", done: false },
        { label: "Decision and follow-up", time: "We'll be in touch", done: false },
        { label: "Add/Import Property Information", time: "For approval", done: false },
      ];

  return (
    <div className="flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-[#C9A96E]/15 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-7 h-7 text-[#C9A96E]" />
          </div>
          <div className="text-[11px] font-semibold text-[#C9A96E] uppercase tracking-widest mb-3">Application Received</div>
          <h2 className="text-3xl font-medium text-[#0D1B2A] mb-3 font-serif">
            {isExisting ? "Request received" : "Thank you for applying"}
          </h2>
          <p className="text-[#8B7355] text-sm leading-relaxed">
            {isExisting
              ? "Thanks, a team member will match your account and send you portal access within one business day."
              : "We've received your application to The 100 Collection. Our curation team will review it and be in touch within 48 hours."}
          </p>
          {appId && (
            <div className="mt-4 inline-block bg-[#F5EFE7] border border-[#D9C8B4] rounded-md px-4 py-2">
              <span className="text-[#B0A090] text-xs">Application ID: </span>
              <span className="text-[#8B7355] text-xs font-mono">{appId.slice(0, 8).toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E8DDD0] rounded-2xl p-6 mb-6 shadow-sm">
          <div className="text-[11px] font-semibold text-[#C9A96E] uppercase tracking-widest mb-5">What Happens Next</div>
          <div className="space-y-5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${step.done ? "bg-[#C9A96E]" : "bg-[#F5EFE7] border border-[#D9C8B4]"}`}>
                  {step.done ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : <span className="text-[#B0A090] text-xs">{i + 1}</span>}
                </div>
                <div>
                  <div className="text-sm text-[#0D1B2A] font-medium">{step.label}</div>
                  <div className="text-xs text-[#B0A090] mt-0.5">{step.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <p className="text-[#B0A090] text-sm">
            Questions? Email us at{" "}
            <a href="mailto:partners@theonehundredcollection.com" className="text-[#C9A96E] hover:underline">
              partners@theonehundredcollection.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}