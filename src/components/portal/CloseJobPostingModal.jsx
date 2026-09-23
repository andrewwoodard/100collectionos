import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/supabase";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";

const CLOSE_REASONS = [
  { value: "no_hire", label: "Didn't find the right fit" },
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "other", label: "Other" },
];

export default function CloseJobPostingModal({ mode, job, partnerName, onClose, onConfirm }) {
  const [hiredPersonName, setHiredPersonName] = useState("");
  const [hiredStartDate, setHiredStartDate] = useState("");
  const [hiredAppId, setHiredAppId] = useState("");
  const [closeReason, setCloseReason] = useState("no_hire");
  const [customMessage, setCustomMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isFilled = mode === "filled";

  // Fetch applicants for this job (filled mode only)
  const { data: applicantsData } = useQuery({
    queryKey: ["job-apps-for-posting", partnerName, job?.title],
    queryFn: () => sb.list("job_applications", { partner_name: partnerName, job_title: job.title }),
    enabled: isFilled && !!partnerName && !!job?.title,
  });

  const applicants = useMemo(() => {
    if (!applicantsData) return [];
    const items = Array.isArray(applicantsData) ? applicantsData : (applicantsData.items || []);
    return items.filter(a => ["pending", "under_review", "interview"].includes(a.status));
  }, [applicantsData]);

  const appLabel = (a) =>
    a.name || [a.first_name, a.last_name].filter(Boolean).join(" ") || a.email || "Applicant";

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const mappedReason = closeReason === "no_longer_needed" ? "other" : closeReason;
      const payload = {
        mode,
        hired_person_name: isFilled ? hiredPersonName : null,
        hired_person_start_date: isFilled ? hiredStartDate : null,
        hired_from_application_id: isFilled && hiredAppId ? hiredAppId : null,
        closed_reason: isFilled ? "filled" : mappedReason,
        customMessage: !isFilled ? customMessage : null,
      };
      await onConfirm(payload);
      // Notify admins of the close/fill (idempotent, non-blocking)
      try {
        await base44.functions.invoke("notifyAdminsJobPostingClosed", {
          job_id: job?.id,
          partner_name: partnerName,
          title: job?.title,
          location: job?.location,
          closed_reason: payload.closed_reason,
          hired_person_name: payload.hired_person_name,
          candidates_notified_count: applicants.length,
          filled: isFilled,
        });
      } catch (e) {
        console.warn("admin notify failed", e?.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!job} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#0D1B2A]">
            {isFilled ? (
              <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Great, you hired someone!</>
            ) : (
              <><Mail className="w-5 h-5 text-slate-500" /> Close this position</>
            )}
          </DialogTitle>
          <DialogDescription>
            {isFilled
              ? `Let us know who you hired for ${job?.title}. We'll wrap up the listing and notify any remaining candidates.`
              : `Close the listing for ${job?.title}. We'll let any pending applicants know this position is no longer open.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isFilled ? (
            <>
              <div>
                <Label className="text-xs text-slate-500 mb-1.5 block">Hired person's name <span className="text-slate-300">(optional)</span></Label>
                <Input value={hiredPersonName} onChange={(e) => setHiredPersonName(e.target.value)} placeholder="e.g. Jordan Smith" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1.5 block">Start date <span className="text-slate-300">(optional)</span></Label>
                <Input type="date" value={hiredStartDate} onChange={(e) => setHiredStartDate(e.target.value)} />
              </div>
              {applicants.length > 0 && (
                <div>
                  <Label className="text-xs text-slate-500 mb-1.5 block">Hired from applicant pool? <span className="text-slate-300">(optional)</span></Label>
                  <select
                    value={hiredAppId}
                    onChange={(e) => setHiredAppId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
                  >
                    <option value="">Select an applicant...</option>
                    {applicants.map(a => (
                      <option key={a.id} value={a.id}>{appLabel(a)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <Mail className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 leading-relaxed">We'll send a warm "position filled" email to any candidates still in your pipeline.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs text-slate-500 mb-1.5 block">Reason for closing</Label>
                <select
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
                >
                  {CLOSE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1.5 block">Message to pending applicants <span className="text-slate-300">(optional)</span></Label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Add a personal note for candidates who applied..."
                  rows={3}
                />
              </div>
              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 leading-relaxed">We'll send a courtesy "position closed" email to any pending applicants.</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className={isFilled ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-[#0D1B2A] hover:bg-[#1a2e45] text-white"}
          >
            {submitting ? "Processing..." : (isFilled ? "Mark as Filled and Close" : "Close Position")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}