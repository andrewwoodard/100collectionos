import React, { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { compressImage } from "@/lib/imageCompression";
import { Upload, X, FolderOpen, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES = ["photo", "video", "logo", "pdf", "brand_asset", "other"];

function guessType(file) {
  const mime = file.type || "";
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

export default function MediaUploadModal({ open, onOpenChange, partners = [], properties = [], folders = [], defaultFolderId, onSave }) {
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({}); // fileIndex -> "uploading"|"done"|"error"
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // webkitdirectory must be set as a DOM attribute, not a JSX prop
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const addFiles = useCallback((newFiles) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      const toAdd = Array.from(newFiles).filter(f => !existing.has(f.name + f.size));
      return [...prev, ...toAdd];
    });
  }, []);

  const readEntriesRecursively = (entry) => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(file => resolve([file]), () => resolve([]));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const allEntries = [];
        const readBatch = () => {
          reader.readEntries(async (entries) => {
            if (!entries.length) {
              const nested = await Promise.all(allEntries.map(readEntriesRecursively));
              resolve(nested.flat());
            } else {
              allEntries.push(...entries);
              readBatch();
            }
          }, () => resolve([]));
        };
        readBatch();
      } else {
        resolve([]);
      }
    });
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const items = e.dataTransfer.items;
    if (items) {
      const entries = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
        else if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) entries.push({ isFile: true, file: (cb) => cb(f), isDirectory: false });
        }
      }
      const allFiles = (await Promise.all(entries.map(readEntriesRecursively))).flat();
      addFiles(allFiles.filter(Boolean));
    } else {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUploadAll = async () => {
    if (!files.length) return;
    setUploading(true);
    const partner = partners.find(p => p.id === partnerId);
    const resolvedFolderId = folderId || defaultFolderId || null;

    for (let i = 0; i < files.length; i++) {
      setProgress(prev => ({ ...prev, [i]: "uploading" }));
      // Re-create as a plain File to strip any webkitRelativePath issues
      const originalFile = files[i];
      const cleanFile = new File([originalFile], originalFile.name, { type: originalFile.type });
      const optimized = await compressImage(cleanFile);
      const res = await base44.integrations.Core.UploadFile({ file: optimized });
      const file_url = res.file_url;
      await onSave({
        asset_name: files[i].name.replace(/\.[^/.]+$/, ""),
        asset_type: guessType(files[i]),
        file_url,
        thumbnail_url: file_url,
        folder_id: resolvedFolderId,
        partner_id: partnerId || null,
        partner_name: partner?.partner_name || "",
        property_name: "",
        market: "",
        approval_status: "pending",
      });
      setProgress(prev => ({ ...prev, [i]: "done" }));
    }

    setUploading(false);
    setFiles([]);
    setProgress({});
    setPartnerId("");
    setFolderId("");
    onOpenChange(false);
  };

  const handleClose = () => {
    if (uploading) return;
    setFiles([]);
    setProgress({});
    setPartnerId("");
    setFolderId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Upload Assets</DialogTitle></DialogHeader>
        <div className="space-y-4">

          {/* Drop zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
              isDragOver ? "border-[#C9A96E] bg-amber-50" : "border-gray-200 hover:border-[#C9A96E] hover:bg-gray-50"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className={cn("w-8 h-8 mx-auto mb-3 transition-colors", isDragOver ? "text-[#C9A96E]" : "text-gray-400")} />
            <p className="text-sm font-medium text-gray-700">Drag & drop files here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
            <div className="flex justify-center gap-3 mt-3">
              <button
                type="button"
                className="text-xs text-[#C9A96E] hover:underline"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Select files
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1"
                onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
              >
                <FolderOpen className="w-3 h-3" /> Select folder
              </button>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={folderInputRef} type="file" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {/* File queue */}
          {files.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-gray-50">
                  {progress[i] === "uploading" && <Loader2 className="w-3.5 h-3.5 text-[#C9A96E] animate-spin flex-shrink-0" />}
                  {progress[i] === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                  {!progress[i] && <div className="w-3.5 h-3.5 rounded-full border border-gray-300 flex-shrink-0" />}
                  <span className="flex-1 truncate text-gray-700">{f.name}</span>
                  <span className="text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                  {!uploading && (
                    <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Optional metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Partner (optional)</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {folders.length > 0 && (
              <div>
                <Label className="text-xs">Folder (optional)</Label>
                <Select value={folderId || defaultFolderId || ""} onValueChange={setFolderId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>No folder</SelectItem>
                    {folders.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancel</Button>
          <Button
            onClick={handleUploadAll}
            disabled={!files.length || uploading}
            className="bg-[#0F172A] hover:bg-[#1E293B] text-white"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Uploading {Object.values(progress).filter(v => v === "done").length}/{files.length}...</>
            ) : (
              <><Upload className="w-4 h-4 mr-1.5" /> Upload {files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""}` : "Assets"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}