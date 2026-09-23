import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useImpersonation } from "@/lib/ImpersonationContext";
import { Eye, X, AlertTriangle } from "lucide-react";

export default function ImpersonationBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { impersonatedUserId, stopImpersonation } = useImpersonation();

  const isPortalRoute = location.pathname.startsWith("/portal");
  const shouldFetch = isPortalRoute && !!impersonatedUserId;

  // Fetch impersonated user + their linked partner for display
  const { data: impersonatedUser } = useQuery({
    queryKey: ["impersonated-user-banner", impersonatedUserId],
    queryFn: async () => {
      if (!impersonatedUserId) return null;
      const res = await base44.functions.invoke('getUserById', { userId: impersonatedUserId });
      return res?.data?.user || null;
    },
    enabled: shouldFetch,
    staleTime: 30 * 1000,
  });

  const { data: linkedPartners = [] } = useQuery({
    queryKey: ["impersonated-partner", impersonatedUserId],
    queryFn: async () => {
      if (!impersonatedUserId) return [];
      return await base44.entities.Partner.filter({ portal_user_ids: { $in: [impersonatedUserId] } });
    },
    enabled: shouldFetch,
    staleTime: 30 * 1000,
  });

  if (!shouldFetch) return null;

  const displayName = impersonatedUser?.full_name || impersonatedUser?.email || "Unknown user";
  const partnerName = linkedPartners?.[0]?.partner_name || "No linked partner";
  const hasNoPartner = linkedPartners.length === 0;
  const isAdminRole = impersonatedUser?.role === "admin";

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-100 border-b border-amber-300 shadow-sm h-11 flex items-center justify-between px-4">
      <div className="flex items-center gap-2 text-amber-900 text-sm font-medium min-w-0">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">
          Viewing as <strong>{displayName}</strong>
          {hasNoPartner ? (
            <span className="text-red-600 ml-2 flex items-center gap-1 inline-flex">
              <AlertTriangle className="w-3.5 h-3.5" /> This user no longer has portal access.
            </span>
          ) : (
            <span className="text-amber-700"> · {partnerName}</span>
          )}
          {isAdminRole && (
            <span className="ml-2 text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
              admin, partner-linked
            </span>
          )}
        </span>
      </div>
      <button
        onClick={() => stopImpersonation()}
        data-impersonation-exempt
        className="flex items-center gap-1.5 bg-[#0D1B2A] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a2e45] transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" /> Exit impersonation
      </button>
    </div>
  );
}