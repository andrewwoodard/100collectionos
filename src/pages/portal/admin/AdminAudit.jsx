import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PortalLayout from "../../../components/portal/PortalLayout";
import { FileText } from "lucide-react";

const ROLE_COLORS = {
  admin: "bg-purple-50 text-purple-700",
  partner: "bg-blue-50 text-blue-700",
  system: "bg-slate-50 text-slate-600",
};

export default function AdminAudit({ embedded = false }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => base44.entities.AuditEntry.list("-created_date", 200),
  });

  const inner = (
    <div>
      {!embedded && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Audit Log</h1>
          <p className="text-slate-400 text-sm mt-1">All system actions, status changes, and partner activity</p>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No audit entries yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {entries.map(e => (
              <div key={e.id} className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[e.actor_role] || ROLE_COLORS.system}`}>{e.actor_role}</span>
                    <span className="text-xs font-medium text-[#0D1B2A]">{e.action}</span>
                  </div>
                  {e.property_name && <span className="text-xs text-slate-500">{e.property_name}</span>}
                  {e.details && <p className="text-xs text-slate-400 mt-0.5">{e.details}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-slate-500">{e.actor_email}</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">{new Date(e.created_date).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  return embedded ? inner : <PortalLayout>{inner}</PortalLayout>;
}