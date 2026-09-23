import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

export default function TerminationConfirmModal({ open, onOpenChange, propertyName, partnerName, onConfirm }) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setReason(""); setConfirmText(""); setSaving(false); }
  }, [open]);

  const canConfirm = reason.trim().length > 0 && confirmText === "TERMINATE";

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSaving(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#FAFAF8]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" /> Approve Termination
          </DialogTitle>
          {propertyName && <p className="text-sm text-slate-700 font-medium">{propertyName}</p>}
          {partnerName && <p className="text-xs text-slate-400">Partner: {partnerName}</p>}
        </DialogHeader>

        <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-4">
          <p className="text-sm text-red-800 leading-relaxed">
            This is a termination request. Approving this will remove <strong>{propertyName}</strong> from The 100 Collection, cancel the associated license, and depublish from theonehundredcollection.com. This cannot be undone.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2 block">
              Reason for approval <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              placeholder="Explain why this termination is being approved. This is sent to the partner and recorded on the submission."
              className="resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2 block">
              Type <span className="font-mono font-bold text-red-600">TERMINATE</span> to confirm <span className="text-red-400">*</span>
            </label>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="TERMINATE"
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || saving}
            className="bg-red-600 hover:bg-red-700 text-white border-red-600"
          >
            {saving ? "Processing..." : "Approve Termination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}