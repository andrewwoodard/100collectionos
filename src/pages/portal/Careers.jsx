import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PortalLayout from "../../components/portal/PortalLayout";
import JobFormModal from "../../components/portal/JobFormModal";
import JobApplicationsTable from "../../components/job-applications/JobApplicationsTable";
import { useUnreadJobApplications } from "@/hooks/useUnreadJobApplications";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Briefcase, PlusCircle, Pencil, Trash2, MapPin, Clock, Calendar, FileText, AlertCircle, CheckCircle2, XCircle, RotateCcw, UserCheck } from "lucide-react";
import CompanyLogo from "../../components/shared/CompanyLogo";
import CloseJobPostingModal from "../../components/portal/CloseJobPostingModal";
import { useToast } from "@/components/ui/use-toast";

const JOB_TYPE_LABELS = {
  full_time: "Full Time", part_time: "Part Time",
  contract: "Contract", seasonal: "Seasonal", internship: "Internship",
};

const DEPT_LABELS = {
  operations: "Operations", guest_services: "Guest Services",
  housekeeping: "Housekeeping", maintenance: "Maintenance",
  marketing: "Marketing", management: "Management", other: "Other",
};

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700",
  draft: "bg-slate-100 text-slate-500",
  closed: "bg-red-50 text-red-600",
};

export default function Careers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "applications" ? "applications" : "roles";
  const { user } = useCurrentUser();
  const [partner, setPartner] = React.useState(null);
  const [partnerProfile, setPartnerProfile] = React.useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [markedRead, setMarkedRead] = useState(false);
  const [closeModal, setCloseModal] = useState(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: unreadJobApps = 0 } = useUnreadJobApplications(
    partner?.partner_name,
    partner?.job_apps_last_viewed_at
  );

  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const records = await base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } });
      if (cancelled) return;
      if (records.length > 0) {
        setPartner(records[0]);
        const profiles = await base44.entities.PartnerProfile.filter({ partner_email: user.email });
        if (cancelled) return;
        if (profiles.length > 0) setPartnerProfile(profiles[0]);
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  // Mark applications as viewed when the Applications tab is opened
  useEffect(() => {
    if (tab === "applications" && partner?.id && !markedRead) {
      setMarkedRead(true);
      const now = new Date().toISOString();
      base44.entities.Partner.update(partner.id, { job_apps_last_viewed_at: now })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["unread-job-applications"] });
          qc.invalidateQueries({ queryKey: ["partner-team"] });
        })
        .catch(() => {});
    }
    if (tab !== "applications") setMarkedRead(false);
  }, [tab, partner?.id, markedRead, qc]);

  const setTab = (newTab) => {
    if (newTab === "roles") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", newTab);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["partner-jobs", partner?.id],
    queryFn: () => base44.entities.JobPosting.filter({ partner_id: partner.id }),
    enabled: !!partner?.id,
  });

  const handleDelete = async (jobId) => {
    if (!window.confirm("Delete this job posting?")) return;
    await base44.entities.JobPosting.delete(jobId);
    qc.invalidateQueries({ queryKey: ["partner-jobs"] });
  };

  const handleEdit = (job) => {
    setEditingJob(job);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingJob(null);
    setShowModal(true);
  };

  const handleConfirmClose = async (payload) => {
    const { mode, hired_person_name, hired_person_start_date, hired_from_application_id, closed_reason, customMessage } = payload;
    const job = closeModal?.job;
    if (!job) return;

    const now = new Date().toISOString();
    await base44.entities.JobPosting.update(job.id, {
      status: "closed",
      closed_at: now,
      closed_reason,
      hired_person_name: hired_person_name || null,
      hired_person_start_date: hired_person_start_date || null,
      hired_from_application_id: hired_from_application_id || null,
    });

    let notifiedCount = 0;
    try {
      const res = await base44.functions.invoke("sendPositionFilledEmails", {
        jobPostingId: job.id,
        mode,
        customMessage: customMessage || undefined,
        hiredFromApplicationId: hired_from_application_id || undefined,
      });
      notifiedCount = res?.data?.notifiedCount ?? 0;
    } catch (e) {
      console.warn("Notification function failed:", e?.message);
    }

    toast({
      title: mode === "filled" ? "Position marked as filled" : "Position closed",
      description: notifiedCount > 0 ? `${notifiedCount} candidate${notifiedCount === 1 ? "" : "s"} were notified.` : undefined,
    });

    // Notify admins that the posting was closed/filled
    try {
      await base44.functions.invoke("notifyAdminsJobPostingClosed", {
        job_posting_id: job.id,
      });
    } catch (e) {
      console.warn("Admin close notification failed:", e?.message);
    }

    qc.invalidateQueries({ queryKey: ["partner-jobs"] });
    setCloseModal(null);
  };

  const handleReopen = async (job) => {
    await base44.entities.JobPosting.update(job.id, {
      status: "active",
      closed_at: null,
      closed_reason: null,
      hired_person_name: null,
      hired_person_start_date: null,
      hired_from_application_id: null,
    });
    qc.invalidateQueries({ queryKey: ["partner-jobs"] });
    toast({ title: "Position reopened", description: `${job.title} is active again.` });
  };

  const activeJobs = jobs.filter(j => j.status === "active");
  const draftJobs = jobs.filter(j => j.status === "draft");
  const closedJobs = jobs.filter(j => j.status === "closed");

  return (
    <PortalLayout>
      {showModal && (
        <JobFormModal
          job={editingJob}
          partnerId={partner?.id}
          partnerName={partner?.partner_name}
          onClose={() => { setShowModal(false); setEditingJob(null); }}
        />
      )}

      {closeModal && (
        <CloseJobPostingModal
          mode={closeModal.mode}
          job={closeModal.job}
          partnerName={partner?.partner_name}
          onClose={() => setCloseModal(null)}
          onConfirm={handleConfirmClose}
        />
      )}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Partner Portal</div>
          <h1 className="text-2xl font-light text-[#0D1B2A] tracking-tight">Careers</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your open positions and track applicants.</p>
        </div>
        {tab === "roles" && (
          <button
            onClick={handleNew}
            className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm px-4 py-2.5 rounded-xl hover:bg-[#1a2e45] transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> Post a Job
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
        <button
          onClick={() => setTab("roles")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "roles"
              ? "border-[#C9A96E] text-[#0D1B2A]"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Briefcase className="w-4 h-4" /> Open Roles
        </button>
        <button
          onClick={() => setTab("applications")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "applications"
              ? "border-[#C9A96E] text-[#0D1B2A]"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <FileText className="w-4 h-4" /> Applications
          {unreadJobApps > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none">
              {unreadJobApps > 99 ? "99+" : unreadJobApps}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === "roles" ? (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Active", count: activeJobs.length, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Drafts", count: draftJobs.length, color: "text-slate-500", bg: "bg-slate-100" },
              { label: "Closed", count: closedJobs.length, color: "text-red-500", bg: "bg-red-50" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className={`text-2xl font-light ${s.color} mb-0.5`}>{s.count}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Jobs list */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse h-24" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm mb-5">No job postings yet. Attract great talent by posting your first opening.</p>
              <button
                onClick={handleNew}
                className="inline-flex items-center gap-2 bg-[#0D1B2A] text-white text-sm px-5 py-2.5 rounded-xl hover:bg-[#1a2e45] transition-colors"
              >
                <PlusCircle className="w-4 h-4" /> Post a Job
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <div key={job.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
                  <CompanyLogo
                    logoUrl={partnerProfile?.company_logo_url}
                    companyName={partner?.partner_name}
                    size={44}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-medium text-[#0D1B2A] text-sm">{job.title}</div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {job.location && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <MapPin className="w-3 h-3" /> {job.location}
                            </span>
                          )}
                          {job.job_type && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Clock className="w-3 h-3" /> {JOB_TYPE_LABELS[job.job_type]}
                            </span>
                          )}
                          {job.closes_at && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Calendar className="w-3 h-3" /> Closes {new Date(job.closes_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                          {job.department && (
                            <span className="text-xs text-slate-400">{DEPT_LABELS[job.department]}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_STYLES[job.status] || "bg-slate-100 text-slate-500"}`}>
                          {job.status}
                        </span>
                        {job.status === "active" && (
                          <>
                            <button
                              onClick={() => setCloseModal({ mode: "filled", job })}
                              className="flex items-center gap-1 text-xs font-medium text-white bg-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Filled
                            </button>
                            <button
                              onClick={() => setCloseModal({ mode: "close", job })}
                              className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg hover:bg-slate-200 hover:text-slate-700 transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Close
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleEdit(job)}
                          className="p-1.5 text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {job.description && (
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">{job.description}</p>
                    )}
                    {job.compensation && (
                      <div className="mt-2 text-xs text-[#C9A96E] font-medium">{job.compensation}</div>
                    )}
                    {job.status === "draft" && job.admin_review_note && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-amber-700 mb-0.5">Your posting was returned for revision</div>
                            <p className="text-xs text-amber-600">Note from admin: {job.admin_review_note}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {job.status === "closed" && (
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${job.closed_reason === "filled" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {job.closed_reason === "filled" ? "Filled" : "Closed"}
                        </span>
                        {job.hired_person_name && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <UserCheck className="w-3.5 h-3.5" /> Hired: {job.hired_person_name}
                          </span>
                        )}
                        <button
                          onClick={() => handleReopen(job)}
                          className="flex items-center gap-1 text-xs font-medium text-[#C9A96E] hover:text-[#b8935a] transition-colors ml-auto"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Reopen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {partner ? (
            <JobApplicationsTable filterByPartnerName={partner.partner_name} showPartnerColumn={false} allowStatusChange={false} />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm">No partner profile found for your account.</p>
            </div>
          )}
        </>
      )}
    </PortalLayout>
  );
}