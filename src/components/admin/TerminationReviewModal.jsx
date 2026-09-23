import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { X, Check, XCircle, Loader2, AlertTriangle } from "lucide-react";

export default function TerminationReviewModal({ submission, onClose, onDecided }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adminMessage, setAdminMessage] = useState("");
  const [loading, setLoading] = useState(null); // 'approve' | 'reject' | null

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-submissions"] });
    qc.invalidateQueries({ queryKey: ["termination-requests"] });
    qc.invalidateQueries({ queryKey: ["offboarding-properties"] });
    qc.invalidateQueries({ queryKey: ["properties"] });
    qc.invalidateQueries({ queryKey: ["propertiesbase44"] });
  };

  const decide = async (action, successMsg) => {
    setLoading(action);
    try {
      await base44.functions.invoke("manageOffboarding", {
        action,
        submissionId: submission.id,
        adminMessage: adminMessage.trim(),
      });
      toast({ title: successMsg });
      invalidate();
      onDecided?.();
    } catch (err) {
      toast({ variant: "destructive", title: "Action failed", description: err?.message || "Please try again." });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-light text-[#0D1B2A]">Review Termination Request</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0D1B2A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Property info */}
        <div className="bg-slate-50 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-[#0D1B2A]">{submission.property_name}</div>
          <div className="text-xs text-slate-500 mt-0.5">Partner: {submission.partner_name}</div>
          {submission.listing_url && (
            <a href={submission.listing_url} target="_blank" rel="noreferrer" className="text-xs text-[#C9A96E] hover:underline mt-1 inline-block">
              View listing
            </a>
          )}
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5 block">
            Partner's Reason
          </label>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 leading-relaxed whitespace-pre-wrap">
            {submission.offboarding_reason || submission.notes_to_team || "No reason provided."}
          </div>
        </div>

        {/* Warning */}
        <div className="bg-gradient-to-r from-amber-50 to-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-relaxed">
              Approving will permanently terminate this property, cancel its license, and depublish it from the website. Review for refund or proration.
            </p>
          </div>
        </div>

        {/* Admin message */}
        <div className="mb-5">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5 block">
            Message to Partner <span className="text-slate-400 normal-case">(sent with the decision)</span>
          </label>
          <textarea
            value={adminMessage}
            onChange={e => setAdminMessage(e.target.value)}
            rows={3}
            placeholder="Add a note for the partner..."
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E] resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => decide("reject_termination", "Termination request rejected")}
            disabled={loading !== null}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            {loading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Reject
          </button>
          <button
            onClick={() => decide("approve_termination", "Termination approved and processed")}
            disabled={loading !== null}
            className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40"
          >
            {loading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Approve Termination
          </button>
        </div>
      </div>
    </div>
  );
}