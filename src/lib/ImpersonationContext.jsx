import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";

const ImpersonationContext = createContext(null);

const STORAGE_KEY = "impersonate_user_id";

export function ImpersonationProvider({ children }) {
  const { user: realUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [impersonatedUserId, setImpersonatedUserId] = useState(null);

  // Initialize from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && realUser?.role === "admin") {
      setImpersonatedUserId(stored);
    } else if (stored && realUser && realUser.role !== "admin") {
      // Non-admin has stale impersonation state — clear it
      sessionStorage.removeItem(STORAGE_KEY);
      setImpersonatedUserId(null);
    }
  }, [realUser]);

  // Toggle body class for CSS-based mutation lock
  useEffect(() => {
    if (impersonatedUserId) {
      document.body.classList.add("impersonating");
    } else {
      document.body.classList.remove("impersonating");
    }
    return () => document.body.classList.remove("impersonating");
  }, [impersonatedUserId]);

  // If real admin's session expires, clear impersonation
  useEffect(() => {
    if (!realUser && impersonatedUserId) {
      sessionStorage.removeItem(STORAGE_KEY);
      setImpersonatedUserId(null);
    }
  }, [realUser, impersonatedUserId]);

  const writeAuditLog = async (action, targetUser) => {
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        action,
        entity_type: "User",
        entity_id: targetUser.id,
        entity_name: targetUser.email,
        performed_by: realUser?.email || "unknown",
        details: `Admin ${realUser?.email || "unknown"} ${action === "impersonation_started" ? "started" : "ended"} view-only impersonation of ${targetUser.email}`,
      });
    } catch (e) {
      console.error("Audit log write failed:", e.message);
    }
  };

  const startImpersonation = useCallback(async (targetUserId) => {
    if (!realUser || realUser.role !== "admin") {
      toast({ title: "Only admins can impersonate users.", variant: "destructive" });
      return;
    }
    if (targetUserId === realUser.id) {
      toast({ title: "You can't impersonate yourself.", variant: "destructive" });
      return;
    }

    // Fetch the target user via backend function (client-side User queries are self-only)
    let targetUser = null;
    try {
      const res = await base44.functions.invoke('getUserById', { userId: targetUserId });
      targetUser = res?.data?.user;
    } catch (e) {
      toast({ title: "Could not find that user.", variant: "destructive" });
      return;
    }

    if (!targetUser) {
      toast({ title: "Could not find that user.", variant: "destructive" });
      return;
    }

    // Allow impersonation if the target is a partner-role user, OR an admin who is
    // linked to a Partner via portal_user_ids (e.g. an internal test account like
    // Paige that walked through the homeowner flow as an admin).
    const isPartnerRole = targetUser.role === "partner";
    let isAdminWithPartnerLink = false;
    if (targetUser.role === "admin") {
      try {
        const linked = await base44.entities.Partner.filter({
          portal_user_ids: { $in: [targetUser.id] },
        });
        isAdminWithPartnerLink = (linked || []).length > 0;
      } catch (e) {
        console.error("Partner link check failed:", e.message);
      }
    }
    if (!isPartnerRole && !isAdminWithPartnerLink) {
      toast({ title: "You can only impersonate users linked to a partner portal.", variant: "destructive" });
      return;
    }

    sessionStorage.setItem(STORAGE_KEY, targetUserId);
    setImpersonatedUserId(targetUserId);

    await writeAuditLog("impersonation_started", targetUser);

    // Notify other admins (dedup by admin_email + target_id + start_hour)
    const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const dedupKey = `impersonation_${realUser.id}_${targetUser.id}_${hourKey}`;
    try {
      const existing = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
      if (existing.length === 0) {
        await base44.asServiceRole.entities.PortalNotification.create({
          recipient_role: "admin",
          recipient_email: "admin",
          type: "general",
          title: "Impersonation started",
          message: `${realUser.full_name || realUser.email} is viewing the portal as ${targetUser.email}.`,
          is_read: false,
          dedup_key: dedupKey,
        });
      }
    } catch (e) {
      console.error("Notification write failed:", e.message);
    }

    navigate("/portal/dashboard");
  }, [realUser, navigate, toast]);

  const stopImpersonation = useCallback(async () => {
    if (!impersonatedUserId) return;

    // Fetch target user for audit log via backend function
    let targetUser = { id: impersonatedUserId, email: "unknown" };
    try {
      const res = await base44.functions.invoke('getUserById', { userId: impersonatedUserId });
      if (res?.data?.user) targetUser = res.data.user;
    } catch (e) { /* use fallback */ }

    sessionStorage.removeItem(STORAGE_KEY);
    setImpersonatedUserId(null);

    await writeAuditLog("impersonation_ended", targetUser);
    navigate("/Partners");
  }, [impersonatedUserId, realUser, navigate]);

  const isImpersonating = !!impersonatedUserId;

  return (
    <ImpersonationContext.Provider value={{
      impersonatedUserId,
      isImpersonating,
      startImpersonation,
      stopImpersonation,
    }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) {
    return { impersonatedUserId: null, isImpersonating: false, startImpersonation: () => {}, stopImpersonation: () => {} };
  }
  return ctx;
}