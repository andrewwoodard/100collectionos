import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const OPTS = [
  { value: "internal", label: "Internal", desc: "Only admins can see this" },
  { value: "partner_visible", label: "Partner Visible", desc: "Visible to the partner's portal" },
  { value: "public", label: "Public", desc: "Anyone with the link can view" },
];

export default function DocBulkVisibilityModal({ open, onClose, selectedDocs, count, onConfirm }) {
  const [selected, setSelected] = useState(null);

  const blockingDocs = useMemo(() => {
    if (selected !== "partner_visible") return [];
    return selectedDocs.filter(d => !d.partner_id);
  }, [selected, selectedDocs]);

  const partnerNames = [...new Set(selectedDocs.filter(d => d.partner_id).map(d => d.partner_name).filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set visibility for {count} doc{count !== 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {OPTS.map(o => (
            <button
              key={o.value}
              onClick={() => setSelected(o.value)}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                selected === o.value ? "border-slate-800 bg-slate-50" : "border-gray-100 hover:border-gray-300"
              }`}
            >
              <div className="font-medium text-sm text-gray-900">{o.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{o.desc}</div>
            </button>
          ))}
        </div>

        {selected === "partner_visible" && blockingDocs.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>{blockingDocs.length} doc{blockingDocs.length !== 1 ? "s" : ""}</strong> have no partner assigned and cannot be set to partner_visible.
              They will be skipped.
            </div>
          </div>
        )}

        {selected === "partner_visible" && partnerNames.length > 0 && blockingDocs.length === 0 && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            This will make {count} documents visible to: <strong>{partnerNames.join(", ")}'s</strong> portal.
          </div>
        )}

        {selected === "public" && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Anyone with the link will be able to view these {count} documents.
          </div>
        )}

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