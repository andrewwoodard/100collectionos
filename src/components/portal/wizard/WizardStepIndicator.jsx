import React from "react";
import { Check } from "lucide-react";

export default function WizardStepIndicator({ currentStep, steps }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isCompleted = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        const isLast = i === steps.length - 1;

        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                isCompleted
                  ? "bg-emerald-500 text-white"
                  : isActive
                    ? "bg-[#0D1B2A] text-white"
                    : "bg-slate-100 text-slate-400"
              }`}>
                {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
              </div>
              <span className={`text-[11px] mt-1.5 font-medium transition-colors ${
                isActive ? "text-[#0D1B2A]" : isCompleted ? "text-emerald-600" : "text-slate-400"
              }`}>{label}</span>
            </div>
            {!isLast && (
              <div className={`w-16 h-px mx-1 mb-5 transition-colors duration-300 ${
                isCompleted ? "bg-emerald-300" : "bg-slate-200"
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}