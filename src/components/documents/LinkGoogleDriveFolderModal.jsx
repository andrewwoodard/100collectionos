import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Info, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Sync request timed out. The import may still be running in the background — check /Documents in a few minutes, then click Sync again to continue."
            )
          ),
        ms
      )
    ),
  ]);

export default function LinkGoogleDriveFolderModal({ open, onOpenChange, folders, defaultFolderId, onSync }) {
  const [folderName, setFolderName] = useState("");
  const [googleFolderId, setGoogleFolderId] = useState("");
  const [selectedDestFolderId, setSelectedDestFolderId] = useState(defaultFolderId || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const handleSync = async () => {
    if (!googleFolderId.trim()) {
      setError("Please enter a Google Drive folder ID");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await withTimeout(
        base44.functions.invoke("syncGoogleDriveFolder", {
          googleFolderId: googleFolderId.trim(),
          destFolderId: selectedDestFolderId,
          folderName: folderName.trim() || "Imported from Drive",
        }),
        55_000
      );
      const data = res.data || {};
      const imported = data.imported ?? 0;
      const skipped = data.skipped_duplicates ?? 0;
      const scanned = data.folders_scanned ?? 0;
      const deferred = data.deferred_folders ?? 0;

      if (data.in_progress) {
        setProgress({
          imported,
          skipped,
          scanned,
          deferred,
          preload_ms: data.preload_ms,
          walk_ms: data.walk_ms,
          errors: data.errors || [],
          folders_failed: data.folders_failed ?? 0,
        });
        if (onSync) onSync();
      } else {
        toast({
          title: "Drive sync complete",
          description: `Imported ${imported} document${imported !== 1 ? "s" : ""} from ${scanned} folder${scanned !== 1 ? "s" : ""}.`,
        });
        if (onSync) onSync();
        setFolderName("");
        setGoogleFolderId("");
        setSelectedDestFolderId(defaultFolderId || null);
        setProgress(null);
        onOpenChange(false);
      }
    } catch (err) {
      const backendMsg = err.response?.data?.error;
      setError(backendMsg || err.message || "Failed to sync folder");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link Google Drive Folder</DialogTitle>
          <DialogDescription>Import all documents from a Google Drive folder</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Google Folder ID or URL</label>
            <Input
              placeholder="Paste folder ID or full Google Drive URL"
              value={googleFolderId}
              onChange={(e) => setGoogleFolderId(e.target.value)}
              disabled={loading}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Paste the full Google Drive folder URL or just the folder ID
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Destination Folder (optional)</label>
            <select
              value={selectedDestFolderId || ""}
              onChange={(e) => setSelectedDestFolderId(e.target.value || null)}
              disabled={loading}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Root (All Documents)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {progress && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm text-green-800 flex-1">
                  <p className="font-medium">
                    Imported {progress.imported} so far — {progress.deferred} folders remain.
                  </p>
                  <p className="text-green-700 mt-1">
                    Click "Continue sync" to pick up where we left off. Already-imported files are
                    automatically skipped.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetails((s) => !s)}
                className="mt-2 flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium"
              >
                {showDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Sync details
              </button>
              {showDetails && (
                <div className="mt-2 space-y-1 text-xs text-green-700 border-t border-green-200 pt-2">
                  <div className="flex justify-between">
                    <span>Pre-load time:</span>
                    <span className="font-mono">{progress.preload_ms ?? "—"}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Walk time:</span>
                    <span className="font-mono">{progress.walk_ms ?? "—"}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Folders scanned:</span>
                    <span className="font-mono">{progress.scanned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duplicates skipped:</span>
                    <span className="font-mono">{progress.skipped}</span>
                  </div>
                  {progress.folders_failed > 0 && (
                    <div className="flex justify-between text-red-700">
                      <span>Folders failed:</span>
                      <span className="font-mono">{progress.folders_failed}</span>
                    </div>
                  )}
                  {progress.errors?.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium text-red-700 mb-1">Errors ({progress.errors.length}):</p>
                      <ul className="space-y-1 max-h-32 overflow-y-auto">
                        {progress.errors.map((e, i) => (
                          <li key={i} className="text-red-600">
                            <span className="font-medium">{e.folder || e.file}:</span> {e.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSync} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? "Syncing..." : progress ? "Continue sync" : "Sync Folder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}