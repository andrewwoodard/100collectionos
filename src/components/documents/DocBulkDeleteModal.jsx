import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function DocBulkDeleteModal({ open, onClose, count, onConfirm }) {
  const [hard, setHard] = useState(false);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" /> Delete {count} document{count !== 1 ? "s" : ""}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          {hard
            ? "This will permanently remove these documents and cannot be undone."
            : "Documents will be archived (soft-delete). You can restore them later."}
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hard}
            onChange={e => setHard(e.target.checked)}
            className="rounded border-gray-300"
          />
          Permanently delete (cannot be undone)
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { onConfirm(hard); onClose(); }}
            className={hard ? "bg-red-600 hover:bg-red-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}
          >
            {hard ? "Permanently Delete" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}