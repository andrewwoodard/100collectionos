import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-700" },
  { value: "signed", label: "Signed", color: "bg-green-100 text-green-700" },
  { value: "archived", label: "Archived", color: "bg-red-100 text-red-700" },
];

export default function DocBulkStatusModal({ open, onClose, count, onConfirm }) {
  const [selected, setSelected] = useState(null);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Change status for {count} doc{count !== 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setSelected(s.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                selected === s.value ? "border-slate-800 " + s.color : "border-transparent " + s.color + " opacity-70 hover:opacity-100"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selected}
            onClick={() => { onConfirm(selected); setSelected(null); onClose(); }}
            className="bg-slate-800 hover:bg-slate-700 text-white"
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}