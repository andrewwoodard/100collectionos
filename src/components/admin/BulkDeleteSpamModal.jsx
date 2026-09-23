import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Confirmation modal for the bulk spam hard-delete. Fetches a dry-run preview
// from the bulkDeleteSpamApplications backend function on open, shows the
// count + a few example records, and requires typing "DELETE SPAM" to
// confirm. Runs the real deletion on confirm and toasts the result.
export default function BulkDeleteSpamModal({ open, onOpenChange, onDone }) {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setConfirmText("");
      setSaving(false);
      setError(null);
      return;
    }
    setLoadingPreview(true);
    setError(null);
    base44.functions
      .invoke("bulkDeleteSpamApplications", { dry_run: true })
      .then((res) => setPreview(res.data || null))
      .catch((e) => setError(e?.response?.data?.error || e?.message || "Failed to load preview"))
      .finally(() => setLoadingPreview(false));
  }, [open]);

  const canConfirm = confirmText === "DELETE SPAM" && !loadingPreview && (preview?.delete_count || 0) > 0;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("bulkDeleteSpamApplications", { dry_run: false });
      const data = res.data || {};
      onDone?.(data);
      onOpenChange(false);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Deletion failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteCount = preview?.delete_count ?? 0;
  const examples = (preview?.delete_preview || []).slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#FAFAF8]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" /> Bulk Delete Spam Applications
          </DialogTitle>
        </DialogHeader>

        <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-4">
          <p className="text-sm text-red-800 leading-relaxed">
            This permanently hard-deletes spam-signaled applications (rejected, spam-review, and
            spam-scored pending) and their in-app notifications. Legitimate applications, existing
            partner/user emails, and records flagged "keep" or "real" are preserved. This cannot
            be undone — each deletion is logged to the audit trail.
          </p>
        </div>

        {loadingPreview && (
          <div className="text-sm text-slate-500 py-4 text-center">Scanning applications…</div>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            {error}
          </div>
        )}

        {preview && !loadingPreview && (
          <div className="space-y-3 mb-4">
            <div className="flex gap-3 text-center">
              <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-2xl font-light text-red-600">{deleteCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">To delete</div>
              </div>
              <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-2xl font-light text-emerald-600">{preview.preserved_count ?? 0}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Preserved</div>
              </div>
              <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-2xl font-light text-slate-500">{preview.scanned ?? 0}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Scanned</div>
              </div>
            </div>

            {examples.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Example records
                </div>
                <div className="space-y-1.5">
                  {examples.map((r) => (
                    <div key={r.id} className="text-xs text-slate-600 flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className="font-medium text-[#0D1B2A]">{r.full_name}</span>
                        {r.company_name ? <span className="text-slate-400"> · {r.company_name}</span> : null}
                        <span className="text-slate-400"> · {r.email}</span>
                      </span>
                      <span className="text-[10px] text-red-500 flex-shrink-0">{(r.signals || []).slice(0, 2).join(", ")}</span>
                    </div>
                  ))}
                  {deleteCount > examples.length && (
                    <div className="text-[11px] text-slate-400 pt-1">+ {deleteCount - examples.length} more</div>
                  )}
                </div>
              </div>
            )}

            {deleteCount === 0 && (
              <p className="text-sm text-slate-500">No spam-signaled applications found to delete.</p>
            )}

            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2 block">
                Type <span className="font-mono font-bold text-red-600">DELETE SPAM</span> to confirm
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE SPAM"
                className="font-mono"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || saving}
            className="bg-red-600 hover:bg-red-700 text-white border-red-600"
          >
            {saving ? "Deleting…" : <span className="flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Delete {deleteCount || ""}</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}