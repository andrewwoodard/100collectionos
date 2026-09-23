import React, { useState } from "react";
import { Building2, FileText, CreditCard, CheckSquare, ClipboardCheck, Pencil, Check, X } from "lucide-react";
import StatusBadge from "../shared/StatusBadge";
import StatCard from "../shared/StatCard";
import VrmContentCard from "./VrmContentCard";
import { format } from "date-fns";

export default function PartnerOverviewTab({ partner, properties, documents, billing, tasks, onboarding, isHomeowner, memberSince, onUpdateMemberSince }) {
  const [editingSince, setEditingSince] = useState(false);
  const [sinceValue, setSinceValue] = useState("");
  const completedOnboarding = onboarding.filter(i => i.completed).length;
  const totalOnboarding = onboarding.length;
  const onboardingPct = totalOnboarding > 0 ? Math.round((completedOnboarding / totalOnboarding) * 100) : 0;

  // Only count active properties — draft/inactive records are excluded so the
  // stat reflects the partner's live portfolio, not stale or in-progress entries.
  const activeProperties = properties.filter(p => p.status === "active").length;
  const openTasks = tasks.filter(t => t.status !== "complete").length;
  const overdueBilling = billing.filter(b => b.status === "overdue").length;
  const signedDocs = documents.filter(d => d.status === "signed").length;

  // Health score
  const docScore = documents.length > 0 ? (signedDocs / documents.length) * 25 : 25;
  const billingScore = overdueBilling === 0 ? 25 : Math.max(0, 25 - overdueBilling * 10);
  const onboardingScore = onboardingPct * 0.25;
  const taskScore = openTasks <= 2 ? 25 : Math.max(0, 25 - (openTasks - 2) * 5);
  const healthScore = Math.round(docScore + billingScore + onboardingScore + taskScore);

  const healthColor = healthScore >= 75 ? "text-emerald-600" : healthScore >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label={isHomeowner ? "Homes" : "Properties"} value={activeProperties} icon={Building2} color="purple" />
        <StatCard label="Documents" value={documents.length} icon={FileText} color="gold" />
        <StatCard label="Open Tasks" value={openTasks} icon={CheckSquare} color="blue" />
        <StatCard label="Overdue Bills" value={overdueBilling} icon={CreditCard} color="red" />
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Health Score</p>
          <p className={`text-2xl font-bold mt-1 ${healthColor}`}>{healthScore}/100</p>
        </div>
      </div>

      {/* Onboarding Progress */}
      {totalOnboarding > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-gray-400" /> Onboarding Progress
            </h4>
            <span className="text-sm font-bold text-gray-700">{onboardingPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#C9A96E] rounded-full transition-all" style={{ width: `${onboardingPct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">{completedOnboarding} of {totalOnboarding} items complete</p>
        </div>
      )}

      {/* Details Grid */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">Partner Details</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
          {[
            [isHomeowner ? "Homeowner Name" : "Contact", partner.primary_contact_name],
            ["Email", partner.primary_contact_email],
            ["Phone", partner.primary_contact_phone],
            ["Market", partner.market],
            ["Region", partner.region],
            ["Partner Type", partner.partner_type?.replace(/_/g, " ")],
            ...(isHomeowner ? [] : [["Company", partner.company_name]]),
            ["Internal Owner", partner.assigned_internal_owner],
            ["Start Date", partner.start_date ? format(new Date(partner.start_date), "MMM d, yyyy") : null],
            ["Go Live Date", partner.go_live_date ? format(new Date(partner.go_live_date), "MMM d, yyyy") : null],
            ["Renewal Date", partner.renewal_date ? format(new Date(partner.renewal_date), "MMM d, yyyy") : null],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{value || "—"}</p>
            </div>
          ))}
          <div>
            <p className="text-xs text-gray-500">Contract Status</p>
            <div className="mt-1"><StatusBadge status={partner.contract_status} /></div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Billing Status</p>
            <div className="mt-1"><StatusBadge status={partner.billing_status} /></div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Onboarding Stage</p>
            <div className="mt-1"><StatusBadge status={partner.onboarding_stage} /></div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Partner Since</p>
            {editingSince ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <input
                  type="date"
                  autoFocus
                  value={sinceValue}
                  onChange={e => setSinceValue(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <button
                  onClick={async () => {
                    await onUpdateMemberSince?.(sinceValue || null);
                    setEditingSince(false);
                  }}
                  className="text-green-600 hover:text-green-800"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setEditingSince(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm font-medium text-gray-900">
                  {memberSince ? format(new Date(memberSince), "MMM d, yyyy") : "—"}
                </p>
                <button
                  onClick={() => { setSinceValue(memberSince || ""); setEditingSince(true); }}
                  className="text-gray-400 hover:text-blue-500 transition-colors"
                  title="Edit partner since date"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
        {partner.notes && (
          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-xs text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-700">{partner.notes}</p>
          </div>
        )}
      </div>

      {/* Destination Page Content (vrms table) */}
      <VrmContentCard partnerName={partner.partner_name} />
    </div>
  );
}