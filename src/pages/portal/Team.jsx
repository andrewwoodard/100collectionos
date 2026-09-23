import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import PortalLayout from "@/components/portal/PortalLayout";
import TeamMembersSection from "@/components/partners/TeamMembersSection";
import { Users } from "lucide-react";

export default function Team() {
  const { user } = useCurrentUser();

  const { data: partnerRecords = [] } = useQuery({
    queryKey: ["my-partner-record-team", user?.id],
    queryFn: () => base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } }),
    enabled: !!user?.id,
  });
  const partner = partnerRecords[0];

  const isOwner = (user?.partner_role || "owner") === "owner";

  return (
    <PortalLayout>
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Partner Portal</div>
        <h1 className="text-2xl font-light text-[#0D1B2A]">Team</h1>
        <p className="text-sm text-slate-400 mt-1">
          {partner ? `Manage who has access to ${partner.partner_name}'s portal.` : "Loading your partner profile…"}
        </p>
      </div>

      {partner ? (
        <div className="max-w-2xl">
          <TeamMembersSection partnerId={partner.id} canManage={isOwner} currentUserId={user?.id} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-slate-500 text-sm">No partner profile found for your account.</p>
          <p className="text-slate-400 text-xs mt-1">If you believe this is an error, please contact support.</p>
        </div>
      )}
    </PortalLayout>
  );
}