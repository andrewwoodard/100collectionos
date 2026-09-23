import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import JobPostingDetailModal from "./JobPostingDetailModal";
import { Search, Briefcase } from "lucide-react";

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

export default function JobPostingsTable({ initialPostingId }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["admin-job-postings"],
    queryFn: () => base44.entities.JobPosting.list("-created_date", 500),
  });

  useEffect(() => {
    if (initialPostingId && jobs.length > 0 && !autoOpened) {
      const job = jobs.find(j => j.id === initialPostingId);
      if (job) {
        setSelectedJob(job);
        markReviewed(job);
        setAutoOpened(true);
      }
    }
  }, [initialPostingId, jobs, autoOpened]);

  const markReviewed = (job) => {
    if (!job.admin_reviewed_at) {
      base44.entities.JobPosting.update(job.id, {
        admin_reviewed_at: new Date().toISOString(),
      }).then(() => {
        qc.invalidateQueries({ queryKey: ["admin-job-postings"] });
        qc.invalidateQueries({ queryKey: ["admin-job-posting-badge"] });
      }).catch(() => {});
    }
  };

  const partners = useMemo(() => {
    const set = new Set();
    jobs.forEach(j => { if (j.partner_name) set.add(j.partner_name); });
    return Array.from(set).sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    let items = jobs;
    if (partnerFilter !== "all") items = items.filter(j => j.partner_name === partnerFilter);
    if (statusFilter !== "all") items = items.filter(j => j.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(j =>
        (j.title || "").toLowerCase().includes(q) ||
        (j.description || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [jobs, partnerFilter, statusFilter, search]);

  const fmtDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleRowClick = (job) => {
    setSelectedJob(job);
    markReviewed(job);
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
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or description…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E]/50"
          />
        </div>
        <select
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
        >
          <option value="all">All Partners</option>
          {partners.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-slate-500 text-sm">No job postings found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Partner</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Dept</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Compensation</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(job => (
                  <tr
                    key={job.id}
                    onClick={() => handleRowClick(job)}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                      selectedJob?.id === job.id ? "bg-[#C9A96E]/5" : ""
                    } ${!job.admin_reviewed_at && job.admin_notified_at ? "border-l-4 border-l-red-400" : ""}`}
                  >
                    <td className="px-4 py-3 text-slate-600">{job.partner_name || "—"}</td>
                    <td className="px-4 py-3 font-medium text-[#0D1B2A]">{job.title}</td>
                    <td className="px-4 py-3 text-slate-600">{job.location || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{job.job_type ? JOB_TYPE_LABELS[job.job_type] || job.job_type : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{job.department ? DEPT_LABELS[job.department] || job.department : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{job.compensation || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_STYLES[job.status] || STATUS_STYLES.draft}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(job.created_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <JobPostingDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
    </>
  );
}