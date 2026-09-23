import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminQueue from "./AdminQueue";
import AdminAccessQueue from "./AdminAccessQueue";
import AdminApplications from "./AdminApplications";
import AdminPartners from "./AdminPartners";
import AdminPartnerProfiles from "./AdminPartnerProfiles";
import AdminBilling from "./AdminBilling";
import AdminAudit from "./AdminAudit";
import AdminInvitations from "./AdminInvitations";
import AdminPropertyEdits from "../../../components/portal/admin/AdminPropertyEdits";
import AdminOffboarding from "./AdminOffboarding";
import AdminOrphanedProperties from "@/components/portal/admin/AdminOrphanedProperties";
import AdminPageMeta from "@/components/portal/admin/AdminPageMeta";
import AdminApplyMedia from "./AdminApplyMedia";
import AdminUsers from "./AdminUsers";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Users, UserCircle, DollarSign, FileText, Inbox, Edit3, PowerOff, Mail, AlertTriangle, Share2, UserPlus, ImagePlus, UserCog } from "lucide-react";

const TABS = [
  { id: "queue",        label: "Submission Queue",  icon: ClipboardList, desc: "Property submissions awaiting review" },
  { id: "access_queue", label: "Access Requests",   icon: UserPlus,      desc: "Unified queue: cold signups, team access requests, new applicants" },
  { id: "users",        label: "Users",             icon: UserCog,       desc: "Accounts, passwords, and password reset emails" },
  { id: "applications", label: "Applications",       icon: Inbox,         desc: "New partner applications" },
  { id: "partners",     label: "Partners",           icon: Users,         desc: "Manage existing partners" },
  { id: "invitations",  label: "Invitations",        icon: Mail,          desc: "Pending & accepted portal invitations" },
  { id: "profiles",     label: "Partner Profiles",  icon: UserCircle,    desc: "Profile submissions for approval" },
  { id: "edits",        label: "Property Edits",    icon: Edit3,         desc: "Partner edit requests" },
  { id: "billing",      label: "Billing",            icon: DollarSign,    desc: "Licensing & billing records" },
  { id: "offboarding",  label: "Offboarding",       icon: PowerOff,      desc: "Termination requests & offboarding properties" },
  { id: "orphans",      label: "Orphaned Properties", icon: AlertTriangle, desc: "Active Properties not yet synced to Supabase" },
  { id: "page_meta",    label: "Page Meta",           icon: Share2,         desc: "SEO & social share meta for marketing pages" },
  { id: "apply_media",  label: "Apply Page Media",    icon: ImagePlus,      desc: "Photos and copy on the public /apply landing" },
  { id: "audit",        label: "Audit Log",          icon: FileText,      desc: "System activity log" },
];

export default function AdminHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [activeTab, setActiveTab] = useState(params.get("tab") || "queue");

  const { data: applications = [] } = useQuery({
    queryKey: ["partner-applications"],
    queryFn: () => base44.entities.PartnerApplication.list("-created_date", 200),
  });
  const { data: submissions = [] } = useQuery({
    queryKey: ["admin-submissions"],
    queryFn: () => base44.entities.PropertySubmission.list("-created_date", 100),
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["all-partner-profiles"],
    queryFn: () => base44.entities.PartnerProfile.list("-created_date", 100),
  });
  const { data: invitations = [] } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: () => base44.entities.PartnerInvitation.list("-created_date", 200),
  });
  const { data: accessRequests = [] } = useQuery({
    queryKey: ["portal-access-requests"],
    queryFn: () => base44.entities.PortalAccessRequest.list("-created_date", 200),
  });

  const editSubmissions = submissions.filter(s =>
    s.submission_type === "edit" && ["submitted", "needs_revision"].includes(s.status)
  );

  const terminationRequests = submissions.filter(s =>
    s.submission_type === "termination_request" && s.status === "submitted"
  );
  const openAccessRequests = accessRequests.filter(r =>
    ["auto_routed", "pending"].includes(r.status)
  );
  const badges = {
    applications: applications.filter(a => a.status === "pending").length,
    queue: submissions.filter(s => s.status === "submitted").length,
    access_queue: openAccessRequests.length,
    profiles: profiles.filter(p => p.profile_status === "submitted").length,
    edits: editSubmissions.length,
    offboarding: terminationRequests.length,
    invitations: invitations.filter(i => i.status === "pending").length,
  };

  const handleTab = (id) => {
    setActiveTab(id);
    navigate(`/admin/hub?tab=${id}`, { replace: true });
  };

  const renderContent = () => {
    switch (activeTab) {
      case "queue":        return <AdminQueue embedded />;
      case "access_queue": return <AdminAccessQueue embedded applications={applications} />;
      case "users":        return <AdminUsers embedded />;
      case "applications": return <AdminApplications embedded />;
      case "partners":     return <AdminPartners embedded />;
      case "invitations":  return <AdminInvitations embedded />;
      case "profiles":     return <AdminPartnerProfiles />;
      case "edits":        return <AdminPropertyEdits embedded />;
      case "billing":      return <AdminBilling embedded />;
      case "offboarding": return <AdminOffboarding embedded />;
      case "orphans":     return <AdminOrphanedProperties embedded />;
      case "page_meta":    return <AdminPageMeta />;
      case "apply_media":  return <AdminApplyMedia />;
      case "audit":        return <AdminAudit embedded />;
      default:             return null;
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Admin Control Center</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(badges).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full font-medium capitalize">
              {v} {k.replace("_", " ")} pending
            </span>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="mb-6 border-b border-slate-100 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const count = badges[tab.id];
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all -mb-px ${
                  active
                    ? "border-[#C9A96E] text-[#0D1B2A]"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight ${
                    active ? "bg-[#C9A96E] text-white" : "bg-amber-100 text-amber-700"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0">
        {renderContent()}
      </div>
    </div>
  );
}