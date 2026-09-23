import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle, Clock, Home, AlertCircle, Link2 } from "lucide-react";

// Pending = awaiting admin decision (published/active submissions are excluded).
const PENDING_STATUSES = ["submitted", "under_review"];

const STATUS_STYLES = {
  submitted:        { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Submitted" },
  under_review:    { cls: "bg-purple-50 text-purple-700 border-purple-200", label: "Under Review" },
  needs_revision:  { cls: "bg-orange-50 text-orange-700 border-orange-200", label: "Needs Revision" },
  approved:        { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Approved" },
  active:          { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Published" },
  rejected:        { cls: "bg-red-50 text-red-700 border-red-200", label: "Rejected" },
  draft:           { cls: "bg-slate-50 text-slate-600 border-slate-200", label: "Draft" },
  imported:        { cls: "bg-slate-50 text-slate-600 border-slate-200", label: "Imported" },
  partner_reviewing:{ cls: "bg-slate-50 text-slate-600 border-slate-200", label: "Partner Reviewing" },
  licensed:        { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Licensed" },
  billed:          { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Billed" },
};

export default function PropertySubmissionsList() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [confirming, setConfirming] = useState(null); // submission row being confirmed
  const [approvingId, setApprovingId] = useState(null);
  const [linkingId, setLinkingId] = useState(null);
  const [toast, setToast] = useState(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["admin-submissions"],
    queryFn: () => base44.entities.PropertySubmission.list("-created_date", 200),
  });

  const eligible = submissions.filter(s => s.submission_type !== "termination_request");
  const pendingCount = eligible.filter(s => PENDING_STATUSES.includes(s.status)).length;

  const rows = eligible.filter(s => {
    if (statusFilter === "pending") return PENDING_STATUSES.includes(s.status);
    if (statusFilter === "resolved") return ["approved", "active", "rejected", "needs_revision", "licensed", "billed"].includes(s.status);
    return true;
  });

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const handleApprove = async (s) => {
    setApprovingId(s.id);
    try {
      await base44.functions.invoke("approvePropertySubmission", { submissionId: s.id });
      showToast(`"${s.property_name}" published and license record created.`);
      qc.invalidateQueries(["admin-submissions"]);
      setConfirming(null);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Approval failed.";
      showToast(msg, true);
    } finally {
      setApprovingId(null);
    }
  };

  const handleLinkToProperty = async (s) => {
    setLinkingId(s.id);
    try {
      const res = await base44.functions.invoke("linkSubmissionToProperty", { submissionId: s.id });
      const created = res?.data?.created;
      showToast(
        created
          ? `"${s.property_name}" added to Properties (draft) and tied to ${s.partner_name || "partner"}.`
          : `"${s.property_name}" already linked — partner tie verified.`
      );
      qc.invalidateQueries(["admin-submissions"]);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Link to property failed.";
      showToast(msg, true);
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${toast.isError ? "bg-red-600 text-white" : "bg-[#0D1B2A] text-white"}`}>
          {toast.isError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4 text-[#C9A96E]" />} {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center mb-3"><Home className="w-4 h-4 text-slate-600" /></div>
          <div className="text-2xl font-light text-[#0D1B2A]">{eligible.length}</div>
          <div className="text-xs text-slate-400">Total Submissions</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center mb-3"><Clock className="w-4 h-4 text-amber-600" /></div>
          <div className="text-2xl font-light text-[#0D1B2A]">{pendingCount}</div>
          <div className="text-xs text-slate-400">Pending Review</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center mb-3"><CheckCircle className="w-4 h-4 text-emerald-600" /></div>
          <div className="text-2xl font-light text-[#0D1B2A]">{eligible.filter(s => s.status === "active").length}</div>
          <div className="text-xs text-slate-400">Published</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 mb-5">
        {["pending", "resolved", "all"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-all ${statusFilter === s ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center">
            <Home className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No property submissions in this category</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-6 py-3 bg-slate-50/70 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              <span>Property</span><span>Partner</span><span>Location</span><span>Status</span><span />
            </div>
            {rows.map(s => {
              const st = STATUS_STYLES[s.status] || { cls: "bg-slate-50 text-slate-600 border-slate-200", label: s.status };
              const canApprove = PENDING_STATUSES.includes(s.status);
              return (
                <div key={s.id} className="px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm text-[#0D1B2A] truncate">{s.property_name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {s.partner_name || "—"}{s.location_full ? ` · ${s.location_full}` : ""}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 flex-shrink-0">{s.submitted_date ? new Date(s.submitted_date).toLocaleDateString() : new Date(s.created_date).toLocaleDateString()}</div>
                    <button onClick={() => handleLinkToProperty(s)} disabled={linkingId === s.id}
                      title="Add to Properties and tie to partner"
                      className="flex items-center gap-1.5 text-xs text-[#0D1B2A] border border-slate-300 bg-white px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0 disabled:opacity-60">
                      <Link2 className="w-3.5 h-3.5" /> {linkingId === s.id ? "Linking…" : "Add to Properties"}
                    </button>
                    {canApprove && (
                      <button onClick={() => setConfirming(s)}
                        className="flex items-center gap-1.5 text-xs text-white bg-emerald-600 border border-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex-shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approve confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-base font-semibold text-[#0D1B2A] mb-2">Approve &amp; Publish Property</h3>
            <p className="text-sm text-slate-500 mb-1">This will publish <strong>{confirming.property_name}</strong> to The 100 Collection and:</p>
            <ul className="text-sm text-slate-600 space-y-1 mb-5 list-disc list-inside">
              <li>Create a Property record</li>
              <li>Create an active license record</li>
              <li>Notify the partner by email</li>
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setConfirming(null)} disabled={!!approvingId}
                className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
              <button onClick={() => handleApprove(confirming)} disabled={!!approvingId}
                className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 font-medium">
                {approvingId === confirming.id ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}