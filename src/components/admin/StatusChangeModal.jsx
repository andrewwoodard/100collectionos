import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const REJECTION_TEMPLATES = [
  "Photos don't meet our quality standards",
  "Property is outside our current markets",
  "Needs professional listing photography",
  "Missing key amenity or design information",
  "Not a fit for our luxury positioning",
];

const REVISION_TEMPLATES = [
  "Photos need higher resolution",
  "Description needs more detail",
  "Missing amenities list",
  "Please clarify pricing and availability",
  "Add unique features and design notes",
];

export default function StatusChangeModal({ open, onOpenChange, action, propertyName, onConfirm, title, confirmLabel, hideTemplates, messageLabel }) {
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

  const isRejection = action === "rejected";
  const templates = isRejection ? REJECTION_TEMPLATES : REVISION_TEMPLATES;
  const resolvedTitle = title ?? (isRejection ? "Reject Submission" : "Request Revisions");
  const resolvedConfirmLabel = confirmLabel ?? (isRejection ? "Reject and notify partner" : "Request revisions and notify partner");
  const resolvedMessageLabel = messageLabel ?? "Message to partner";

  const handleConfirm = async () => {
    if (!message.trim()) return;
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#FAFAF8]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#0D1B2A]">{resolvedTitle}</DialogTitle>
          {propertyName && <p className="text-sm text-slate-500">{propertyName}</p>}
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2 block">
              {resolvedMessageLabel} <span className="text-red-400">*</span>
            </label>
            {!hideTemplates && (
              <div className="flex flex-wrap gap-2 mb-3">
                {templates.map(t => (
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
              onChange={e => setMessage(e.target.value)}
              rows={5}
              placeholder="Write the feedback the partner will receive in their email and portal notification..."
              className="resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2 block">
              Internal admin notes <span className="text-slate-400 font-normal">(optional, not shown to partner)</span>
            </label>
            <Textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes for the team..."
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!message.trim() || saving}
            className="bg-[#0D1B2A] hover:bg-[#1a2e45] text-white"
          >
            {saving ? "Saving..." : resolvedConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}