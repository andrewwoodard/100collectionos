import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import JobStatusChangeModal from "@/components/careers/JobStatusChangeModal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Mail, Phone, MapPin, FileText, Briefcase, GraduationCap, Wrench,
  Calendar, DollarSign, Clock, ExternalLink, Search, Download, Building2,
  Eye, CalendarCheck, FileCheck, UserCheck, X as XIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const STATUS_CONFIG = {
  pending: { label: "Pending", cls: "bg-slate-100 text-slate-600" },
  under_review: { label: "Under Review", cls: "bg-purple-50 text-purple-700" },
  interview: { label: "Interview", cls: "bg-blue-50 text-blue-700" },
  offer: { label: "Offer", cls: "bg-amber-50 text-amber-700" },
  hired: { label: "Hired", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-600" },
  withdrawn: { label: "Withdrawn", cls: "bg-slate-100 text-slate-500" },
};

const STATUS_TOOLTIPS = {
  all: "Show all applications regardless of status",
  pending: "New applications not yet reviewed",
  under_review: "Being evaluated by our team",
  interview: "Selected for interview or currently interviewing",
  offer: "Offer has been extended, awaiting response",
  hired: "Candidate accepted and joined the team",
  rejected: "Application declined",
  withdrawn: "Candidate withdrew their application",
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "under_review", label: "Under Review" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_ACTIONS = [
  { key: "under_review", label: "Review", icon: Eye },
  { key: "interview", label: "Interview", icon: CalendarCheck },
  { key: "offer", label: "Offer", icon: FileCheck },
  { key: "hired", label: "Hire", icon: UserCheck },
  { key: "rejected", label: "Reject", icon: XIcon },
];

const TOAST_LABELS = {
  under_review: "moved to Under Review",
  interview: "moved to Interview",
  offer: "sent an offer",
  hired: "marked as Hired",
  rejected: "rejected",
};

function StatusPill({ status, withTooltip = true }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const pill = (
    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
  if (!withTooltip) return pill;
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-block cursor-default">{pill}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-slate-900 text-white">
        {STATUS_TOOLTIPS[status] || STATUS_TOOLTIPS.pending}
      </TooltipContent>
    </Tooltip>
  );
}

function Field({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap">{value}</div>
      </div>
    </div>
  );
}

function ApplicationDetailModal({ application, onClose, onStatusAction }) {
  if (!application) return null;
  const a = application;
  const fullName = a.name || [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";

  return (
    <Dialog open={!!application} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-light text-[#0D1B2A]">{fullName}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            {a.job_title && <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> {a.job_title}</span>}
            {a.partner_name && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {a.partner_name}</span>}
            {a.job_location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {a.job_location}</span>}
            {a.status && <StatusPill status={a.status} />}
          </DialogDescription>
        </DialogHeader>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-100">
          {STATUS_ACTIONS.map((act) => (
            <button
              key={act.key}
              onClick={() => onStatusAction(act.key, a)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                act.key === "rejected"
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : act.key === "hired"
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <act.icon className="w-3.5 h-3.5" /> {act.label}
            </button>
          ))}
        </div>

        <div className="space-y-5 mt-2">
          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            {a.email && <Field label="Email" value={a.email} icon={Mail} />}
            {a.phone && <Field label="Phone" value={a.phone} icon={Phone} />}
            {a.location && <Field label="Location" value={a.location} icon={MapPin} />}
            {a.linkedin_profile && (
              <div className="flex items-start gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">LinkedIn</div>
                  <a href={a.linkedin_profile} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">{a.linkedin_profile}</a>
                </div>
              </div>
            )}
          </div>

          {/* Address */}
          {(a.address_line_1 || a.city || a.state_region || a.postal_code) && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Address</div>
              <div className="text-sm text-slate-700">
                {[a.address_line_1, a.address_line_2, [a.city, a.state_region, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
              </div>
            </div>
          )}

          {/* Resume */}
          {a.resume_file_url && (
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <FileText className="w-5 h-5 text-[#C9A96E] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">{a.resume_file_name || "Resume"}</div>
                {a.resume_profile && <div className="text-[11px] text-slate-400 truncate">{a.resume_profile}</div>}
              </div>
              <a href={a.resume_file_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-[#C9A96E] hover:text-[#b8935a]">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </div>
          )}

          {/* Long-form fields */}
          {a.cover_letter && <Field label="Cover Letter" value={a.cover_letter} icon={FileText} />}
          {a.job_history && <Field label="Job History" value={a.job_history} icon={Briefcase} />}
          {a.education && <Field label="Education" value={a.education} icon={GraduationCap} />}
          {a.skills && <Field label="Skills" value={a.skills} icon={Wrench} />}

          {/* Employment details */}
          <div className="grid grid-cols-2 gap-4">
            {a.availability && <Field label="Availability" value={a.availability} icon={Clock} />}
            {a.work_authorization && <Field label="Work Authorization" value={a.work_authorization} />}
            {a.salary_expectations && <Field label="Salary Expectations" value={a.salary_expectations} icon={DollarSign} />}
            {a.experience_notes && <Field label="Experience Notes" value={a.experience_notes} />}
          </div>

          {/* Source / dates */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            {a.source && <Field label="Source" value={a.source} />}
            {a.created_date && <Field label="Applied On" value={new Date(a.created_date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} icon={Calendar} />}
            {a.job_url && (
              <div className="flex items-start gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Job URL</div>
                  <a href={a.job_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">{a.job_url}</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function JobApplicationsTable({ filterByPartnerName, showPartnerColumn = true }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [statusModal, setStatusModal] = useState(null); // { action, application }
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["job-applications", filterByPartnerName || "all"],
    queryFn: () => sb.list("job_applications"),
  });

  const applications = useMemo(() => {
    let items = data?.items || [];
    if (filterByPartnerName) {
      const target = filterByPartnerName.toLowerCase().trim();
      items = items.filter((a) => (a.partner_name || "").toLowerCase().trim() === target);
    }
    if (statusFilter !== "all") {
      const s = statusFilter;
      items = items.filter((a) => (a.status || "pending") === s);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((a) =>
        [a.name, a.email, a.phone, a.job_title, a.partner_name, a.job_location, a.first_name, a.last_name]
          .filter(Boolean).some((v) => v.toLowerCase().includes(q))
      );
    }
    return items;
  }, [data, filterByPartnerName, statusFilter, search]);

  const fmtDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleStatusChange = async (action, application, { partner_facing_message, admin_notes }) => {
    const user = await base44.auth.me();
    const now = new Date().toISOString();

    await sb.update("job_applications", application.id, {
      status: action,
      admin_notes: admin_notes || null,
      partner_facing_message: partner_facing_message || null,
      reviewed_by: user.email,
      reviewed_at: now,
    });

    // Email candidate (non-blocking)
    base44.functions.invoke("sendJobApplicationEmail", {
      applicationId: application.id,
      newStatus: action,
      partnerFacingMessage: partner_facing_message,
    }).catch((e) => console.warn("Email send failed (non-fatal):", e?.message));

    // Audit trail
    const candidateName = application.name ||
      [application.first_name, application.last_name].filter(Boolean).join(" ") || "Unknown";
    try {
      await base44.entities.AuditEntry.create({
        actor_email: user.email,
        actor_role: user.role === "admin" ? "admin" : "partner",
        action: `Application status changed to ${action}`,
        entity_type: "JobApplication",
        entity_id: String(application.id),
        target_name: candidateName,
        partner_name: application.partner_name || undefined,
        old_value: application.status || "pending",
        new_value: action,
        details: partner_facing_message || admin_notes || undefined,
      });
    } catch (e) {
      console.warn("Audit entry failed (non-fatal):", e?.message);
    }

    toast({
      title: `Candidate ${TOAST_LABELS[action]}`,
      description: partner_facing_message ? "Candidate has been notified by email." : undefined,
    });

    // Refresh table data
    qc.invalidateQueries({ queryKey: ["job-applications"] });

    // Update selected application so detail modal reflects new status
    if (selected?.id === application.id) {
      setSelected({ ...selected, status: action, admin_notes, partner_facing_message, reviewed_by: user.email, reviewed_at: now });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse h-14" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
    <>
      {/* Search + Status filter chips */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, job title..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E]/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Tooltip key={f.key} delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setStatusFilter(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    statusFilter === f.key
                      ? "bg-[#0D1B2A] text-white"
                      : "bg-slate-50 border border-slate-200 text-slate-600 hover:border-[#C9A96E] hover:text-[#0D1B2A]"
                  }`}
                >
                  {f.label}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-slate-900 text-white">
                {STATUS_TOOLTIPS[f.key]}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-slate-500 text-sm">No job applications found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Applicant</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Position</th>
                  {showPartnerColumn && (
                    <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Partner</th>
                  )}
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Applied</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {applications.map((a) => {
                  const name = a.name || [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#0D1B2A]">{name}</div>
                        {a.location && <div className="text-xs text-slate-400">{a.location}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {a.email && <div className="text-slate-600 truncate max-w-[180px]">{a.email}</div>}
                        {a.phone && <div className="text-xs text-slate-400">{a.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700">{a.job_title || "—"}</div>
                        {a.job_location && <div className="text-xs text-slate-400">{a.job_location}</div>}
                      </td>
                      {showPartnerColumn && (
                        <td className="px-4 py-3 text-slate-600">{a.partner_name || "—"}</td>
                      )}
                      <td className="px-4 py-3">
                        <StatusPill status={a.status || "pending"} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(a.created_date)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {STATUS_ACTIONS.map((act) => (
                            <button
                              key={act.key}
                              onClick={() => setStatusModal({ action: act.key, application: a })}
                              title={act.label}
                              className={`p-1.5 rounded-lg transition-colors ${
                                act.key === "rejected"
                                  ? "text-slate-400 hover:text-red-500 hover:bg-red-50"
                                  : act.key === "hired"
                                  ? "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                  : "text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100"
                              }`}
                            >
                              <act.icon className="w-3.5 h-3.5" />
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ApplicationDetailModal
        application={selected}
        onClose={() => setSelected(null)}
        onStatusAction={(action, app) => {
          setStatusModal({ action, application: app });
        }}
      />

      <JobStatusChangeModal
        open={!!statusModal}
        onOpenChange={(v) => !v && setStatusModal(null)}
        action={statusModal?.action}
        candidateName={
          statusModal?.application
            ? statusModal.application.name ||
              [statusModal.application.first_name, statusModal.application.last_name].filter(Boolean).join(" ")
            : null
        }
        jobTitle={statusModal?.application?.job_title}
        onConfirm={async ({ partner_facing_message, admin_notes }) => {
          if (statusModal?.application) {
            await handleStatusChange(statusModal.action, statusModal.application, {
              partner_facing_message,
              admin_notes,
            });
          }
        }}
      />
    </>
    </TooltipProvider>
  );
}