import React from "react";
import { Check, Minus } from "lucide-react";
import { FUNNEL_STAGES, STAGE_LABELS, SUBTASKS_BY_STAGE, isDone } from "../../lib/funnelConfig";

export default function FunnelOnboardingTab({ partner, onboardingRow }) {
  const currentStage = partner?.funnel_stage || "approved";
  const stageIndex = FUNNEL_STAGES.indexOf(currentStage);

  return (
    <div className="space-y-6">
      {/* Stage progress strip */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">Funnel Stage</h4>
        <div className="flex items-center gap-1">
          {FUNNEL_STAGES.map((stage, i) => {
            const isFilled = i < stageIndex;
            const isCurrent = i === stageIndex;
            return (
              <React.Fragment key={stage}>
                {i > 0 && (
                  <div className={`flex-1 h-0.5 ${i <= stageIndex ? "bg-[#C9A96E]" : "bg-gray-100"}`} />
                )}
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  isCurrent
                    ? "bg-[#C9A96E] text-white ring-2 ring-[#C9A96E]/30"
                    : isFilled
                    ? "bg-[#C9A96E]/20 text-[#C9A96E]"
                    : "bg-gray-100 text-gray-400"
                }`}>
                  {STAGE_LABELS[stage]}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        {currentStage === "listed" && (
          <p className="text-xs text-emerald-600 font-medium mt-3">✓ Partner is fully live — all stages complete.</p>
        )}
      </div>

      {/* Sub-task checklist grouped by stage */}
      {onboardingRow ? (
        FUNNEL_STAGES.filter(s => s !== "approved").map(stage => {
          const tasks = SUBTASKS_BY_STAGE[stage];
          if (!tasks.length) return null;
          const stageDone = tasks.filter(t => isDone(onboardingRow[t.field])).length;
          const allDone = stageDone === tasks.length;
          return (
            <div key={stage} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">{STAGE_LABELS[stage]}</h4>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  allDone ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                }`}>
                  {stageDone}/{tasks.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {tasks.map(task => {
                  const val = onboardingRow[task.field];
                  const done = isDone(val);
                  const isWaived = val === "Waived";
                  return (
                    <div key={task.field} className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                        done ? "bg-emerald-100" : "bg-gray-100"
                      }`}>
                        {isWaived
                          ? <Minus className="w-3 h-3 text-slate-400" />
                          : done
                          ? <Check className="w-3 h-3 text-emerald-600" />
                          : null}
                      </span>
                      <span className={`text-sm ${done ? "text-gray-400 line-through" : "text-gray-800"}`}>
                        {task.label}
                      </span>
                      {isWaived && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-auto">
                          Waived
                        </span>
                      )}
                      {val && !isWaived && val !== "Yes" && val !== "Complete" && val !== "No" && val !== "-" && (
                        <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded ml-auto">
                          {val}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border border-gray-100">
          No PartnerOnboarding row found for this partner.
        </div>
      )}
    </div>
  );
}