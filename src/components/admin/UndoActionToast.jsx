import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Undo2, X } from "lucide-react";

const NAVY = "#0D1B2A";
const FIVE_MINUTES = 5 * 60 * 1000;

// Persistent undo toast. After an access-queue action fires, the parent passes
// a payload { requestId, name, email, actionLabel }. The toast stays on screen
// for five minutes (or until dismissed) and offers a single Undo that reverts
// the queue row and cancels the scheduled email if it hasn't sent yet.
export default function UndoActionToast({ undoState, onUndo, onDismiss, undoing }) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!undoState) return;
    const expiresAt = undoState.expiresAt || (Date.now() + FIVE_MINUTES);
    setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    const tick = setInterval(() => {
      const left = Math.round((expiresAt - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(tick);
        onDismiss();
      } else {
        setSecondsLeft(left);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [undoState]);

  if (!undoState) return null;

  const mins = Math.floor((secondsLeft || 0) / 60);
  const secs = (secondsLeft || 0) % 60;
  const countdown = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="fixed bottom-5 right-5 z-[100] w-[360px] max-w-[calc(100vw-2.5rem)]">
      <div className="rounded-xl shadow-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-800">
              {undoState.actionLabel} sent to{" "}
              <span className="font-medium">{undoState.name}</span>
            </div>
            <div className="text-xs text-slate-500 truncate">{undoState.email}</div>
            <div className="text-[11px] text-slate-400 mt-1">Undo available for {countdown}</div>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={onUndo}
            disabled={undoing}
            className="text-[#0D1B2A] border-[#0D1B2A] hover:bg-[#0D1B2A] hover:text-white"
          >
            <Undo2 className="w-3.5 h-3.5 mr-1" /> Undo
          </Button>
        </div>
      </div>
    </div>
  );
}