import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const TEMPLATES = {
  under_review: [
    "Thanks for applying, we're reviewing your application now",
    "Your resume looks strong, our team is reviewing",
  ],
  interview: [
    "We'd like to schedule a first-round interview",
    "Impressed by your background, let's set up a call",
    "Available for a 30-min video interview this week?",
  ],
  offer: [
    "We're pleased to extend an offer for this role",
    "Would love to have you join the team",
  ],
  hired: [
    "Welcome to the team, excited to have you on board",
  ],
  rejected: [
    "After careful review, we've decided to move forward with other candidates",
    "Strong application, but not the right fit for this specific role at this time",
    "Position has been filled, we appreciate your interest",
  ],
};

const TITLES = {
  under_review: "Move to Under Review",
  interview: "Invite to Interview",
  offer: "Extend Offer",
  hired: "Mark as Hired",
  rejected: "Reject Application",
};

const CONFIRM_LABELS = {
  under_review: "Move to Under Review and notify candidate",
  interview: "Move to Interview and notify candidate",
  offer: "Extend Offer and notify candidate",
  hired: "Mark as Hired and notify candidate",
  rejected: "Reject and notify candidate",
};

export default function JobStatusChangeModal({ open, onOpenChange, action, candidateName, jobTitle, onConfirm }) {
  const [message, setMessage] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMessage("");
      setAdminNotes("");
      setSaving(false);
    }
  }, [open]);

  if (!action) return null;

  const templates = TEMPLATES[action] || [];
  const messageRequired = action !== "under_review";
  const title = TITLES[action];
  const confirmLabel = CONFIRM_LABELS[action];

  const handleConfirm = async () => {
    if (messageRequired && !message.trim()) return;
    setSaving(true);
    try {
      await onConfirm({ partner_facing_message: message.trim(), admin_notes: adminNotes.trim() });
    } finally {
      setSaving(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#FAFAF8] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#0D1B2A]">{title}</DialogTitle>
          {candidateName && (
            <p className="text-sm text-slate-500">
              {candidateName}{jobTitle ? ` · ${jobTitle}` : ""}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2 block">
              Message to candidate{" "}
              {messageRequired ? (
                <span className="text-red-400">*</span>
              ) : (
                <span className="text-slate-400 font-normal">(optional)</span>
              )}
            </label>
            {templates.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {templates.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMessage(t)}
                    className="text-xs px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 hover:border-[#C9A96E] hover:text-[#0D1B2A] transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Write the message the candidate will receive in their email..."
              className="resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2 block">
              Internal notes{" "}
              <span className="text-slate-400 font-normal">(optional, not shown to candidate)</span>
            </label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes for the team..."
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={(messageRequired && !message.trim()) || saving}
            className="bg-[#0D1B2A] hover:bg-[#1a2e45] text-white"
          >
            {saving ? "Saving..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}