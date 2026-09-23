import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard,
  Users,
  Building2,
  ClipboardCheck,
  FileText,
  Image,
  CreditCard,
  CheckSquare,
  Activity,
  BarChart3,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  GitMerge,
  AlertTriangle,
  Globe,
  EyeOff,
  Eye,
  ExternalLink,
  Github,
  Briefcase,
  Mail,
  Quote,
  X
} from "lucide-react";
const navGroups = [
  {
    label: null,
    items: [
      { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
      { name: "Destinations", icon: Globe, page: "Destinations", path: "/admin/destinations", adminOnly: true },
    ],
  },
  {
    label: "Partners",
    items: [
      { name: "Partners", icon: Users, page: "Partners" },
      { name: "Properties", icon: Building2, page: "Properties" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { name: "Partner Funnel", icon: GitMerge, page: "PartnerFunnelTracker" },
      { name: "Tasks", icon: CheckSquare, page: "Tasks" },
    ],
  },
  {
    label: "Assets",
    items: [
      { name: "Documents", icon: FileText, page: "Documents" },
      { name: "Media Library", icon: Image, page: "MediaLibrary" },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Reviews", icon: Quote, page: "AdminReviews", path: "/admin/reviews", adminOnly: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { name: "Billing", icon: CreditCard, page: "Billing" },
      { name: "Licenses", icon: FileText, page: "Licenses" },
      { name: "Finance Alerts", icon: AlertTriangle, page: "FinanceAlerts" },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Application Funnel", icon: BarChart3, page: "AdminApplyFunnel", path: "/admin/apply-funnel", adminOnly: true },
      { name: "Activity", icon: Activity, page: "ActivityFeed" },
      { name: "Careers", icon: Briefcase, page: "JobApplications" },
      { name: "Reports", icon: BarChart3, page: "Reports", hidden: true },
      { name: "Partner Report", icon: FileText, page: "PartnerReport" },
      { name: "Analytics", icon: BarChart3, page: "Analytics" },
      { name: "Leadership Summary", icon: TrendingUp, page: "LeadershipSummary" },
    ],
  },
  {
    label: null,
    items: [
      { name: "Settings", icon: Settings, page: "Settings" },
      { name: "Email Previews", icon: Mail, page: "AdminEmailPreviews", path: "/admin/email-previews", adminOnly: true },
      { name: "Admin Control Center", icon: AlertTriangle, page: "AdminHub", adminOnly: true },
    ],
  },
];

// Portal shortcut — rendered separately below nav groups

export default function Sidebar({ currentPage, mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const hiddenPages = user?.sidebar_hidden_pages || [];

  // Pending submission count for Admin Control Center badge
  const { data: pendingSubmissions = [] } = useQuery({
    queryKey: ["sidebar-submission-count"],
    queryFn: () => base44.entities.PropertySubmission.list("-created_date", 100),
    refetchInterval: 30000,
  });
  const submissionCount = pendingSubmissions.filter(s => s.status === "submitted" || s.status === "under_review").length;

  // Unreviewed job postings badge
  const { data: jobPostingsBadge = [] } = useQuery({
    queryKey: ["admin-job-posting-badge"],
    queryFn: () => base44.entities.JobPosting.list("-created_date", 200),
    refetchInterval: 30000,
  });
  const jobPostingBadgeCount = jobPostingsBadge.filter(j => j.admin_notified_at && !j.admin_reviewed_at).length;

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[#0F172A] text-white flex flex-col z-50 transition-all duration-300
        ${collapsed ? "lg:w-[68px]" : "lg:w-[240px]"}
        w-[240px]
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}
    >
      {/* Logo */}
      <div className="px-4 h-16 flex items-center justify-between border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png" alt="100 Collection" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold text-sm tracking-tight">Collection OS</span>
          </div>
        )}
        {collapsed && (
          <img src="https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png" alt="100 Collection" className="w-8 h-8 rounded-lg mx-auto" />
        )}
        {/* Mobile close button */}
        {onMobileClose && (
          <button onClick={onMobileClose} className="lg:hidden ml-auto text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-4">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed && (
              <div className="px-3 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{group.label}</span>
              </div>
            )}
            {group.label && collapsed && (
              <div className="border-t border-white/10 mb-1" />
            )}
            <div className="space-y-0.5">
              {group.items.filter(item => !hiddenPages.includes(item.page) && (!item.adminOnly || isAdmin)).map((item) => {
                const isActive = currentPage === item.page;
                const href = item.path || (item.page === "AdminHub" ? "/admin/hub" : createPageUrl(item.page));
                return (
                  <Link
                    key={item.page}
                    to={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                      isActive
                        ? "bg-white/10 text-[#C9A96E]"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-[#C9A96E]" : ""}`} />
                    {!collapsed && (
                      <span className="truncate flex-1">{item.name}</span>
                    )}
                    {!collapsed && item.hidden && isAdmin && (
                      <span className="text-[9px] text-white/30 font-medium uppercase tracking-wide">WIP</span>
                    )}
                    {!collapsed && item.page === "AdminHub" && submissionCount > 0 && (
                      <span className="text-[10px] font-bold bg-[#C9A96E] text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                        {submissionCount}
                      </span>
                    )}
                    {!collapsed && item.page === "JobApplications" && jobPostingBadgeCount > 0 && (
                      <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                        {jobPostingBadgeCount > 99 ? "99+" : jobPostingBadgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Partner Portal shortcut */}
      <div className="px-2 pb-2 border-t border-white/10 pt-2">
        <Link
          to="/portal/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#C9A96E]/70 hover:text-[#C9A96E] hover:bg-white/5 transition-all"
          title={collapsed ? "Partner Portal" : undefined}
        >
          <ExternalLink className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span className="truncate flex-1 text-xs">Partner Portal</span>}
        </Link>
      </div>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-white/10">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-xs"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}