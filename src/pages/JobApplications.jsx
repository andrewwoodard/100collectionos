import React from "react";
import { useSearchParams } from "react-router-dom";
import JobApplicationsTable from "@/components/job-applications/JobApplicationsTable";
import JobPostingsTable from "@/components/job-applications/JobPostingsTable";
import { Briefcase, FileText } from "lucide-react";

export default function JobApplications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "applications" ? "applications" : "postings";
  const postingId = searchParams.get("postingId");

  const setTab = (newTab) => {
    if (newTab === "postings") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", newTab);
    }
    searchParams.delete("postingId");
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#C9A96E]/10 rounded-xl flex items-center justify-center">
          <Briefcase className="w-5 h-5 text-[#C9A96E]" />
        </div>
        <div>
          <h1 className="text-2xl font-light text-[#0D1B2A] tracking-tight">Careers</h1>
          <p className="text-sm text-slate-400 mt-0.5">Review partner job postings and track applications.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
        <button
          onClick={() => setTab("postings")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "postings"
              ? "border-[#C9A96E] text-[#0D1B2A]"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Briefcase className="w-4 h-4" /> Postings
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
        </button>
      </div>

      {/* Tab content */}
      {tab === "postings" ? (
        <JobPostingsTable initialPostingId={postingId} />
      ) : (
        <JobApplicationsTable filterByPartnerName={null} showPartnerColumn={true} />
      )}
    </div>
  );
}