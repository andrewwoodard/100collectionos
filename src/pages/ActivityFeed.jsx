import React from "react";
import { sb } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { Activity, Users, Building2, FileText, CreditCard, ClipboardCheck, CheckSquare, MessageSquare } from "lucide-react";
import EmptyState from "../components/shared/EmptyState";
import { format } from "date-fns";

const iconMap = {
  partner: Users,
  property: Building2,
  document: FileText,
  billing: CreditCard,
  onboarding: ClipboardCheck,
  task: CheckSquare,
  note: MessageSquare,
};

const colorMap = {
  partner: "bg-blue-50 text-blue-600",
  property: "bg-purple-50 text-purple-600",
  document: "bg-amber-50 text-amber-600",
  billing: "bg-green-50 text-green-600",
  onboarding: "bg-indigo-50 text-indigo-600",
  task: "bg-red-50 text-red-600",
  note: "bg-gray-100 text-gray-600",
};

export default function ActivityFeed() {
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: async () => { const r = await sb.list("activity_logs", null, null, 100); return r.items || []; },
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <h2 className="text-xl font-bold text-gray-900">Activity Feed</h2>

      {activities.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Actions across the system will appear here" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {activities.map((act, i) => {
              const Icon = iconMap[act.entity_type] || Activity;
              const colors = colorMap[act.entity_type] || "bg-gray-100 text-gray-600";
              return (
                <div key={act.id} className="px-5 py-4 hover:bg-gray-50/30 transition-colors flex items-start gap-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{act.action}</p>
                    {act.details && <p className="text-xs text-gray-500 mt-0.5">{act.details}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {act.performed_by && <span className="text-xs text-gray-400">{act.performed_by}</span>}
                      {act.created_date && (
                        <span className="text-xs text-gray-300">
                          {format(new Date(act.created_date), "MMM d, yyyy · h:mm a")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}