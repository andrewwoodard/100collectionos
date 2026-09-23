import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function RequirePortalAccess({ children }) {
  const { user, isLoadingAuth } = useAuth();

  const { data: linkedPartners, isLoading: isLoadingPartners, refetch } = useQuery({
    queryKey: ["portal-access-check", user?.id],
    queryFn: () => base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } }),
    enabled: !!user?.id,
  });

  const [reconciled, setReconciled] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  // Auto-link: if the authenticated user isn't linked to any Partner, attempt an
  // email-match reconciliation. This covers partners who signed up directly
  // instead of via an invitation link, so they aren't stranded on /portal/pending.
  // Runs at most once per mount (reconciled guard).
  useEffect(() => {
    if (!user?.id || user.role === "admin" || reconciled) return;
    if (isLoadingPartners) return;
    if (linkedPartners && linkedPartners.length > 0) return;
    setReconciled(true);
    setReconciling(true);
    (async () => {
      try {
        await base44.functions.invoke("reconcileUserPartnerLinks", { mode: "me" });
        await refetch();
      } catch (_) {}
      setReconciling(false);
    })();
  }, [user?.id, user?.role, isLoadingPartners, linkedPartners, reconciled, refetch]);

  if (isLoadingAuth || isLoadingPartners || reconciling) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  // Admins can access portal for testing
  if (user.role === "admin") return children;

  // Partner (or unknown role) with linked partner record → normal portal access
  if (linkedPartners && linkedPartners.length > 0) return children;

  // Not linked → pending approval (reconciliation already attempted above)
  return <Navigate to="/portal/pending" replace />;
}