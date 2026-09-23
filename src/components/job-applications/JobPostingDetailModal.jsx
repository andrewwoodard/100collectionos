import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, XCircle, Send, Trash2, AlertCircle, Mail, Link as LinkIcon,
} from "lucide-react";

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
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-slate-100 text-slate-500 border-slate-200",
  closed: "bg-red-50 text-red-600 border-red-200",
};

function MetaField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm text-slate-700 whitespace-pre-wrap mt-0.5">{value}</div>
    </div>
  );
}

export default function JobPostingDetailModal({ job, onClose }) {
  const qc = useQueryClient();
  const [action, setAction] = useState(null);
  const [sendBackNote, setSendBackNote] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  if (!job) return null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-job-postings"] });
    qc.invalidateQueries({ queryKey: ["admin-job-posting-badge"] });
  };

  const handleActivate = async () => {
    setSaving(true);
    try {
      await base44.entities.JobPosting.update(job.id, {
        status: "active",
        admin_reviewed_at: new Date().toISOString(),
      });
      invalidate();
      onClose();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClosePosting = async () => {
    setSaving(true);
    try {
      await base44.entities.JobPosting.update(job.id, {
        status: "closed",
        admin_reviewed_at: new Date().toISOString(),
      });
      invalidate();
      onClose();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendBack = async () => {
    if (!sendBackNote.trim()) return;
    setSaving(true);
    try {
      await base44.entities.JobPosting.update(job.id, {
        status: "draft",
        admin_review_note: sendBackNote.trim(),
        admin_reviewed_at: new Date().toISOString(),
      });
      invalidate();
      onClose();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== job.title) return;
    setSaving(true);
    try {
      await base44.entities.JobPosting.delete(job.id);
      invalidate();
      onClose();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-light text-[#0D1B2A]">{job.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap mt-1">
            {job.partner_name && <span>{job.partner_name}</span>}
            {job.location && <span>· {job.location}</span>}
            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border capitalize ${STATUS_STYLES[job.status] || STATUS_STYLES.draft}`}>
              {job.status}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Details */}
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            {job.job_type && <MetaField label="Type" value={JOB_TYPE_LABELS[job.job_type] || job.job_type} />}
            {job.department && <MetaField label="Department" value={DEPT_LABELS[job.department] || job.department} />}
            {job.compensation && <MetaField label="Compensation" value={job.compensation} />}
            {job.closes_at && <MetaField label="Closes" value={new Date(job.closes_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />}
          </div>

          {job.description && <MetaField label="Description" value={job.description} />}
          {job.requirements && <MetaField label="Requirements" value={job.requirements} />}

          {(job.application_email || job.application_url) && (
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              {job.application_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Application Email</div>
                    <a href={`mailto:${job.application_email}`} className="text-sm text-blue-600 hover:underline">{job.application_email}</a>
                  </div>
                </div>
              )}
              {job.application_url && (
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Application URL</div>
                    <a href={job.application_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">{job.application_url}</a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            {job.created_date && <MetaField label="Posted" value={new Date(job.created_date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} />}
            {job.admin_notified_at && <MetaField label="Admin Notified" value={new Date(job.admin_notified_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} />}
            {job.admin_reviewed_at && <MetaField label="Reviewed" value={new Date(job.admin_reviewed_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} />}
          </div>

          {job.admin_review_note && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-700 mb-0.5">Admin review note (sent to partner)</div>
                  <p className="text-xs text-amber-600">{job.admin_review_note}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Admin Actions */}
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          {action === null ? (
            <div className="flex flex-wrap gap-2">
              {job.status === "draft" && (
                <Button onClick={handleActivate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle className="w-4 h-4" /> Approve &amp; Activate
                </Button>
              )}
              {job.status === "active" && (
                <Button onClick={handleClosePosting} disabled={saving} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                  <XCircle className="w-4 h-4" /> Close Posting
                </Button>
              )}
              <Button onClick={() => setAction("send_back")} variant="outline" disabled={saving}>
                <Send className="w-4 h-4" /> Send Back to Partner
              </Button>
              <Button onClick={() => setAction("delete")} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={saving}>
                <Trash2 className="w-4 h-4" /> Delete Posting
              </Button>
            </div>
          ) : action === "send_back" ? (
            <div className="space-y-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                <Send className="w-4 h-4" /> Send back to partner
              </div>
              <p className="text-xs text-amber-600">The posting will be set to draft status. The partner will see your note on their Careers page.</p>
              <textarea
                value={sendBackNote}
                onChange={(e) => setSendBackNote(e.target.value)}
                placeholder="Enter your note to the partner…"
                rows={3}
                className="w-full text-sm rounded-lg border border-amber-200 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setAction(null); setSendBackNote(""); }} disabled={saving}>Cancel</Button>
                <Button onClick={handleSendBack} disabled={saving || !sendBackNote.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {saving ? "Sending…" : "Send Back"}
                </Button>
              </div>
            </div>
          ) : action === "delete" ? (
            <div className="space-y-3 p-4 bg-red-50 rounded-xl border border-red-200">
              <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                <Trash2 className="w-4 h-4" /> Delete posting
              </div>
              <p className="text-xs text-red-600">This will permanently delete the posting. Type the job title to confirm:</p>
              <p className="text-sm font-medium text-[#0D1B2A]">"{job.title}"</p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={`Type "${job.title}" to confirm`}
                className="w-full text-sm rounded-lg border border-red-200 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setAction(null); setDeleteConfirm(""); }} disabled={saving}>Cancel</Button>
                <Button onClick={handleDelete} disabled={saving || deleteConfirm !== job.title} className="bg-red-600 hover:bg-red-700 text-white">
                  {saving ? "Deleting…" : "Delete Permanently"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}