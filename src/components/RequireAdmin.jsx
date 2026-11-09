import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { canAccessStaffPage, defaultHomeForRole, isAdminRole } from "@/lib/staffAccess";

/**
 * Gate Collection OS pages.
 * - Default: admin only (legacy behavior).
 * - Pass `page` (e.g. "MediaLibrary") to allow roles listed in STAFF_PAGE_ACCESS.
 * - Or pass `allowedRoles` explicitly (admin is always included).
 */
export default function RequireAdmin({ children, page, allowedRoles }) {
  const { user, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (isAdminRole(user.role)) return children;

  if (page && canAccessStaffPage(user.role, page)) return children;

  if (Array.isArray(allowedRoles) && allowedRoles.includes(user.role)) return children;

  return <Navigate to={defaultHomeForRole(user.role)} replace />;
}
