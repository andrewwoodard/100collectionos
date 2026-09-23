import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useImpersonation } from "@/lib/ImpersonationContext";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Home, PlusCircle, CreditCard, Bell,
  LogOut, Menu, X, UserCircle, HelpCircle, ArrowLeft, Briefcase, Wrench, Users, Compass, BookOpen
} from "lucide-react";
import HelpContactModal from "./HelpContactModal";
import { useUnreadJobApplications } from "@/hooks/useUnreadJobApplications";
import { filterNotificationsByRole, getEffectiveRole } from "@/lib/partnerRoles";

const partnerNavGroups = [
  { caption: null, items: [
    { label: "Overview", icon: LayoutDashboard, path: "/portal/dashboard", roles: ["owner", "marketing", "finance", "operations"] },
    { label: "Onboarding Guide", icon: Compass, path: "/portal/onboarding-guide", roles: ["owner", "marketing", "finance", "operations"] },
    { label: "Brand Resources", icon: BookOpen, path: "/portal/resources", roles: ["owner", "marketing", "finance", "operations"] },
    { label: "My Properties", icon: Home, path: "/portal/properties", roles: ["owner", "marketing", "operations"] },
    { label: "Add Property", icon: PlusCircle, path: "/portal/add-property", roles: ["owner", "marketing", "operations"] },
  ]},
  { caption: "Manage", items: [
    { label: "Billing & Licensing", icon: CreditCard, path: "/portal/billing", roles: ["owner", "finance"] },
    { label: "Careers", icon: Briefcase, path: "/portal/careers", roles: ["owner", "marketing", "operations"] },
  ]},
  { caption: "Settings", items: [
    { label: "My Profile", icon: UserCircle, path: "/portal/profile", roles: ["owner", "marketing", "finance", "operations"] },
    { label: "Tech Stack", icon: Wrench, path: "/portal/tech-stack", roles: ["owner", "operations"] },
    { label: "Team", icon: Users, path: "/portal/team", roles: ["owner", "marketing", "finance", "operations"] },
  ]},
];



export default function PortalLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { authError } = useAuth();
  const { user: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const { isImpersonating } = useImpersonation();
  const user = currentUser;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [partnerRecord, setPartnerRecord] = useState(null);
  const bellRef = useRef(null);

  React.useEffect(() => {
    if (!user?.id || !user?.email) return;
    let cancelled = false;

    (async () => {
      // Look up partner via portal_user_ids array (team model)
      const linked = await base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } });
      if (cancelled) return;
      if (linked.length > 0) {
        const p = linked[0];
        // Skip backfill during impersonation — view-only, no writes
        if (!isImpersonating && (!Array.isArray(p.portal_user_ids) || p.portal_user_ids.length === 0)) {
          const ids = p.portal_user_id ? [p.portal_user_id] : [];
          if (!ids.includes(user.id)) ids.push(user.id);
          await base44.entities.Partner.update(p.id, { portal_user_ids: ids });
        }
        setPartnerRecord(p);
        return;
      }

      // Fallback: first-login backfill via primary_contact_email (skip during impersonation)
      if (isImpersonating) return;
      const matches = await base44.entities.Partner.filter({ primary_contact_email: user.email });
      if (cancelled) return;
      if (matches.length > 0) {
        const p = matches[0];
        const ids = Array.isArray(p.portal_user_ids) && p.portal_user_ids.length > 0
          ? [...p.portal_user_ids]
          : (p.portal_user_id ? [p.portal_user_id] : []);
        if (!ids.includes(user.id)) ids.push(user.id);
        await base44.entities.Partner.update(p.id, { portal_user_id: user.id, portal_user_ids: ids });
        setPartnerRecord({ ...p, portal_user_id: user.id, portal_user_ids: ids });
      }
    })().catch(() => {});

    return () => { cancelled = true; };
  }, [user?.id, user?.email, isImpersonating]);

  // Close bell popover on outside click
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isAdmin = user?.role === "admin";

  // Bell notifications
  const effectiveRole = getEffectiveRole(user);
  const { data: rawUnread = [] } = useQuery({
    queryKey: ["bell-notifications", user?.email, user?.role, effectiveRole],
    queryFn: async () => {
      const personal = await base44.entities.PortalNotification.filter({ recipient_email: user.email, is_read: false });
      if (user.role !== "partner") {
        const adminRole = await base44.entities.PortalNotification.filter({ recipient_role: "admin", is_read: false });
        const ids = new Set(personal.map(n => n.id));
        return [...personal, ...adminRole.filter(n => !ids.has(n.id))];
      }
      return personal;
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
  });
  const unreadNotifications = filterNotificationsByRole(rawUnread, effectiveRole);

  const { data: rawRecent = [] } = useQuery({
    queryKey: ["bell-recent-notifications", user?.email, user?.role, effectiveRole],
    queryFn: async () => {
      const all = await base44.entities.PortalNotification.filter({ recipient_email: user.email });
      let merged = all;
      if (user.role !== "partner") {
        const adminRole = await base44.entities.PortalNotification.filter({ recipient_role: "admin" });
        const ids = new Set(all.map(n => n.id));
        merged = [...all, ...adminRole.filter(n => !ids.has(n.id))];
      }
      return [...merged].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5);
    },
    enabled: !!user?.email && bellOpen,
  });
  const recentNotifications = filterNotificationsByRole(rawRecent, effectiveRole);

  const TYPE_LABELS = {
    submitted: "Submitted", approved: "Approved", needs_revision: "Revision",
    rejected: "Rejected", licensed: "Licensed", billed: "Billed", general: "General", under_review: "In Review",
  };
  const TYPE_STYLES = {
    submitted: "bg-indigo-50 text-indigo-600", approved: "bg-emerald-50 text-emerald-600",
    needs_revision: "bg-orange-50 text-orange-600", rejected: "bg-red-50 text-red-600",
    licensed: "bg-teal-50 text-teal-600", billed: "bg-blue-50 text-blue-600",
    general: "bg-slate-100 text-slate-600", under_review: "bg-purple-50 text-purple-600",
  };

  const { data: unreadJobApps = 0 } = useUnreadJobApplications(
    partnerRecord?.partner_name,
    partnerRecord?.job_apps_last_viewed_at
  );

  const NavLink = ({ item }) => {
    const active = location.pathname === item.path || location.pathname.startsWith(item.path + "?") || (item.path === "/portal/admin/hub" && location.pathname.startsWith("/portal/admin"));
    const Icon = item.icon;
    const showJobBadge = item.path === "/portal/careers" && unreadJobApps > 0;
    return (
      <Link
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
          active
            ? "bg-[#C9A96E]/15 text-[#C9A96E] border border-[#C9A96E]/25"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        }`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
        {showJobBadge && (
          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none">
            {unreadJobApps > 99 ? "99+" : unreadJobApps}
          </span>
        )}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-8 border-b border-white/8">
        <div className="flex items-center gap-3">
          <img src="https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png" alt="100 Collection" className="w-8 h-8 rounded-sm" />
          <div>
            <div className="text-white font-semibold text-sm leading-tight">The 100 Collection</div>
            <div className="text-slate-500 text-xs">Partner Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-6 overflow-y-auto">
        {partnerNavGroups.map((group, gi) => {
          const visibleItems = group.items.filter(item => !effectiveRole || !item.roles || item.roles.includes(effectiveRole));
          if (visibleItems.length === 0) return null;
          return (
          <div key={gi} className={gi > 0 ? "mt-4 pt-4" : ""}>
            {group.caption && (
              <div className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {group.caption}
              </div>
            )}
            <div className="space-y-1">
              {visibleItems.map(item => <NavLink key={item.path} item={item} />)}
            </div>
          </div>
          );
        })}
      </div>

      {/* Back to Admin — only for admin/internal roles, never for partners */}
      {isAdmin && (
        <div className="px-3 pb-2">
          <button
            onClick={() => { window.location.href = "/"; }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-[#C9A96E]/80 hover:text-[#C9A96E] hover:bg-[#C9A96E]/10"
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0" />
            Back to Admin
          </button>
        </div>
      )}

      {/* Help */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setHelpOpen(true)}
          data-impersonation-exempt
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-slate-400 hover:text-white hover:bg-white/5"
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          Need help?
        </button>
      </div>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/8">
        {user && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#C9A96E]/20 flex items-center justify-center">
              <span className="text-[#C9A96E] text-xs font-semibold">
                {user.full_name?.[0] || user.email?.[0] || "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-medium truncate">{user.full_name || "Partner"}</div>
              <div className="text-slate-500 text-[10px] truncate">{user.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={() => base44.auth.logout()}
          data-impersonation-exempt
          className="flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 text-xs transition-colors w-full px-2 py-1.5 rounded-lg"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex overflow-hidden w-full" style={isImpersonating ? { paddingTop: "44px" } : undefined}>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-[240px] flex-shrink-0 bg-[#0D1B2A] flex-col fixed inset-y-0 left-0 z-30" style={isImpersonating ? { top: "44px" } : undefined}>
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}
      {/* Mobile sidebar */}
      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[240px] bg-[#0D1B2A] flex flex-col transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`} style={isImpersonating ? { top: "44px" } : undefined}>
        <SidebarContent />
      </div>

      {/* Main content */}
      <div className="flex-1 lg:ml-[240px] flex flex-col min-h-screen min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0D1B2A] border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png" alt="100 Collection" className="w-6 h-6 rounded-sm" />
            <span className="text-white font-medium text-sm">Partner Portal</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile bell */}
            <div className="relative">
              <button onClick={() => setBellOpen(o => !o)} className="relative text-slate-400 hover:text-white p-1.5 transition-colors">
                <Bell className="w-5 h-5" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#C9A96E] text-[#0D1B2A] text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
                  </span>
                )}
              </button>
              {bellOpen && <BellPopover notifications={recentNotifications} TYPE_STYLES={TYPE_STYLES} TYPE_LABELS={TYPE_LABELS} onClose={() => setBellOpen(false)} navigate={navigate} />}
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="text-slate-400 hover:text-white p-1.5 transition-colors">
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Desktop bell — top right corner */}
        <div className="hidden lg:flex items-center justify-end px-8 pt-6 pb-0">
          <div ref={bellRef} className="relative">
            <button onClick={() => setBellOpen(o => !o)} data-impersonation-exempt className="relative text-slate-400 hover:text-slate-700 p-1.5 transition-colors rounded-lg hover:bg-slate-100">
              <Bell className="w-5 h-5" />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#C9A96E] text-[#0D1B2A] text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
                </span>
              )}
            </button>
            {bellOpen && <BellPopover notifications={recentNotifications} TYPE_STYLES={TYPE_STYLES} TYPE_LABELS={TYPE_LABELS} onClose={() => setBellOpen(false)} navigate={navigate} />}
          </div>
        </div>

        <main className="flex-1 px-4 py-4 lg:px-6 lg:py-6 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>

      {helpOpen && (
        <HelpContactModal partner={partnerRecord} onClose={() => setHelpOpen(false)} />
      )}
    </div>
  );
}

function BellPopover({ notifications, TYPE_STYLES, TYPE_LABELS, onClose, navigate }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Recent Notifications</span>
      </div>
      {notifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up!</div>
      ) : (
        <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
          {notifications.map(n => (
            <div key={n.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-2">
                {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#C9A96E] mt-1.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-medium text-[#0D1B2A] truncate">{n.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${TYPE_STYLES[n.type] || "bg-slate-100 text-slate-600"}`}>
                      {TYPE_LABELS[n.type] || n.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">{new Date(n.created_date).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="px-4 py-3 border-t border-slate-50">
        <button
          onClick={() => { onClose(); navigate("/portal/notifications"); }}
          className="text-xs text-[#C9A96E] hover:underline font-medium"
        >
          View all notifications →
        </button>
      </div>
    </div>
  );
}