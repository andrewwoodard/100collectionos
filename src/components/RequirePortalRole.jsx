import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useToast } from "@/components/ui/use-toast";
import RequirePortalAccess from "./RequirePortalAccess";

/**
 * Wraps a portal route with both portal-access and partner-role checks.
 * If the user's partner_role is not in allowedRoles, redirects to /portal/dashboard
 * with a toast explaining they don't have access.
 *
 * Admins bypass role checks entirely.
 */
export default function RequirePortalRole({ children, allowedRoles }) {
  return (
    <RequirePortalAccess>
      <RoleGate allowedRoles={allowedRoles}>{children}</RoleGate>
    </RequirePortalAccess>
  );
}

function RoleGate({ children, allowedRoles }) {
  const { user: authUser } = useAuth();
  const { user: currentUser, isLoading } = useCurrentUser();
  const { toast } = useToast();

  // Admins (real or impersonating) bypass role checks
  if (authUser?.role === "admin") return children;

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  const userRole = currentUser?.partner_role || "owner";

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <RoleRedirect />;
  }

  return children;
}

function RoleRedirect() {
  const { toast } = useToast();

  useEffect(() => {
    toast({
      description: "You don't have access to that page. Contact your account owner if you need it.",
    });
  }, [toast]);

  return <Navigate to="/portal/dashboard" replace />;
}