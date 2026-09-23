import React, { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MarkFullyLiveModal({ partnerName, onConfirm, onClose }) {
  const [confirming, setConfirming] = React.useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Mark as fully live
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-600 leading-relaxed">
            Mark <strong className="text-gray-900">{partnerName}</strong> as fully live?
            This will set every onboarding sub-task to <strong>Complete</strong> and move
            their funnel stage to <strong>listed</strong>.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleConfirm} disabled={confirming}
              className="bg-green-600 hover:bg-green-700 text-white">
              {confirming ? "Working…" : "Mark fully live"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}