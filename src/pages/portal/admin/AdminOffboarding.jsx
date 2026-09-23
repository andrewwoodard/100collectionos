import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import TerminationReviewModal from "../../../components/admin/TerminationReviewModal";
import { AlertTriangle, CalendarClock, PowerOff, Ban, ChevronRight, Loader2 } from "lucide-react";

const STATE_STYLES = {
  temporary_offline: { label: "Offline", pill: "bg-amber-100 text-amber-700", icon: PowerOff },
  scheduled: { label: "Scheduled", pill: "bg-orange-100 text-orange-700", icon: CalendarClock },
  terminated: { label: "Terminated", pill: "bg-red-100 text-red-700", icon: Ban },
};

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminOffboarding({ embedded }) {
  const [reviewing, setReviewing] = useState(null);

  const { data: terminationRequests = [], isLoading: loadingReqs } = useQuery({
    queryKey: ["termination-requests"],
    queryFn: async () => {
      const all = await base44.entities.PropertySubmission.list("-created_date", 200);
      return all.filter(s => s.submission_type === "termination_request" && ["submitted", "under_review"].includes(s.status));
    },
  });

  const { data: offboardingProperties = [], isLoading: loadingProps } = useQuery({
    queryKey: ["offboarding-properties"],
    queryFn: async () => {
      const [offline, scheduled, terminated] = await Promise.all([
        base44.entities.Property.filter({ offboarding_status: "temporary_offline" }),
        base44.entities.Property.filter({ offboarding_status: "scheduled" }),
        base44.entities.Property.filter({ offboarding_status: "terminated" }),
      ]);
      return [...offline, ...scheduled, ...terminated].sort((a, b) => {
        // Sort scheduled by termination_date ascending
        if (a.offboarding_status === "scheduled" && b.offboarding_status === "scheduled") {
          return (a.termination_date || "").localeCompare(b.termination_date || "");
        }
        return 0;
      });
    },
  });

  return (
    <div className={embedded ? "" : "p-6"}>
      {/* Pending Termination Requests */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-[#0D1B2A] mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Pending Termination Requests
          {terminationRequests.length > 0 && (
            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{terminationRequests.length}</span>
          )}
        </h3>

        {loadingReqs ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : terminationRequests.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-6 text-center text-sm text-slate-400">
            No pending termination requests.
          </div>
        ) : (
          <div className="space-y-3">
            {terminationRequests.map(req => (
              <div key={req.id} className="bg-white border border-slate-100 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-[#0D1B2A]">{req.property_name}</span>
                    <span className="text-xs text-slate-400">{req.partner_name}</span>
                    <span className="text-[10px] text-slate-400">{req.submitted_date ? fmtDate(req.submitted_date) : ""}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed line-clamp-2">
                    {req.offboarding_reason || req.notes_to_team || "No reason provided."}
                  </p>
                </div>
                <button
                  onClick={() => setReviewing(req)}
                  className="flex items-center gap-1.5 bg-[#0D1B2A] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#1a2e45] flex-shrink-0"
                >
                  Review <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Offboarding Properties */}
      <div>
        <h3 className="text-sm font-semibold text-[#0D1B2A] mb-3 flex items-center gap-2">
          <PowerOff className="w-4 h-4 text-amber-500" />
          Being Offboarded
          {offboardingProperties.length > 0 && (
            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{offboardingProperties.length}</span>
          )}
        </h3>

        {loadingProps ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : offboardingProperties.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-6 text-center text-sm text-slate-400">
            No properties are currently being offboarded.
          </div>
        ) : (
          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Property</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Partner</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Initiated By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {offboardingProperties.map(prop => {
                  const style = STATE_STYLES[prop.offboarding_status] || {};
                  const Icon = style.icon || PowerOff;
                  return (
                    <tr key={prop.id} className="hover:bg-slate-50/40">
                      <td className="px-4 py-3">
                        <a href={`/PropertyDetail?id=${prop.id}`} className="font-medium text-[#0D1B2A] hover:text-[#C9A96E]">
                          {prop.property_name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{prop.partner_name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${style.pill || ""}`}>
                          <Icon className="w-3 h-3" />
                          {style.label || prop.offboarding_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {prop.termination_date ? fmtDate(prop.termination_date) : prop.offboarding_approved_at ? fmtDate(prop.offboarding_approved_at) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{prop.offboarding_initiated_by || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewing && (
        <TerminationReviewModal
          submission={reviewing}
          onClose={() => setReviewing(null)}
          onDecided={() => setReviewing(null)}
        />
      )}
    </div>
  );
}