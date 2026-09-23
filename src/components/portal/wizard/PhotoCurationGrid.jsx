import React, { useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { compressImage } from "@/lib/imageCompression";
import { getImageUrl } from "@/lib/imageUrl";
import { useToast } from "@/components/ui/use-toast";
import { Star, Trash2, Upload, GripVertical, ImageIcon, Loader2 } from "lucide-react";

const MAX_PHOTOS = 100;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

function isAcceptedType(file) {
  // Some browsers don't set MIME for heic/heif; fall back to extension check
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
}

export default function PhotoCurationGrid({ photos, onChange, propertyName = "Property" }) {
  const { toast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingItems, setUploadingItems] = useState([]); // [{ id, name }] placeholder tiles
  const [batchProgress, setBatchProgress] = useState(null); // { completed, total } | null
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const inputRef = useRef();
  const dragCounter = useRef(0);
  // Always-current snapshot of photos so mid-batch edits (remove/reorder) aren't overwritten
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const setCover = (idx) => {
    if (idx === 0) return;
    const next = [...photos];
    const [item] = next.splice(idx, 1);
    next.unshift(item);
    onChange(next);
  };

  const removePhoto = (idx) => {
    onChange(photos.filter((_, i) => i !== idx));
  };

  // Core upload routine — validates, uploads, and appends URLs one by one
  const processFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    // Enforce the 100-photo cap (existing + new)
    const remaining = MAX_PHOTOS - (photos?.length || 0) - uploadingItems.length;
    if (remaining <= 0) {
      toast({
        variant: "destructive",
        title: "Photo limit reached",
        description: "Maximum 100 photos per property. Remove existing photos before adding more.",
      });
      return;
    }

    // Per-file validation: type + size
    const accepted = [];
    for (const file of files) {
      if (!isAcceptedType(file)) {
        toast({
          variant: "destructive",
          title: "Unsupported file type",
          description: `"${file.name}" was skipped — only JPG, PNG, WebP, HEIC, and HEIF are allowed.`,
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`,
        });
        continue;
      }
      accepted.push(file);
    }

    // Cap the batch if it would exceed the limit
    let batch = accepted;
    if (accepted.length > remaining) {
      batch = accepted.slice(0, remaining);
      toast({
        variant: "destructive",
        title: "Photo limit reached",
        description: `Only ${remaining} more photo${remaining !== 1 ? "s" : ""} can be added (max 100). ${accepted.length - remaining} file${accepted.length - remaining !== 1 ? "s" : ""} skipped.`,
      });
    }

    if (!batch.length) return;

    // Register placeholder tiles so the user sees immediate feedback
    const placeholders = batch.map((f, i) => ({ id: `${Date.now()}-${i}-${f.name}`, name: f.name }));
    setUploadingItems(prev => [...prev, ...placeholders]);
    setBatchProgress({ completed: 0, total: batch.length });

    let completed = 0;

    // Upload sequentially so progress is predictable and we don't hammer the API
    for (let i = 0; i < batch.length; i++) {
      const file = batch[i];
      const placeholderId = placeholders[i].id;
      try {
        // Re-wrap as a plain File to avoid any webkitRelativePath quirks
        const cleanFile = new File([file], file.name, { type: file.type });
        const compressed = await compressImage(cleanFile);
        const res = await base44.integrations.Core.UploadFile({ file: compressed });
        const url = res?.file_url;
        if (!url) throw new Error("No file URL returned");
        // Append to the latest snapshot so concurrent edits aren't overwritten
        onChange([...(photosRef.current || []), url]);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: `"${file.name}" could not be uploaded${err?.message ? `: ${err.message}` : ""}.`,
        });
      } finally {
        completed++;
        setBatchProgress({ completed, total: batch.length });
        setUploadingItems(prev => prev.filter(p => p.id !== placeholderId));
      }
    }

    setBatchProgress(null);
  }, [photos, uploadingItems.length, onChange, toast]);

  // File picker
  const handleInputChange = (e) => {
    processFiles(e.target.files);
    e.target.value = "";
  };

  // Drag-and-drop on the zone
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  // Reorder within the grid
  const handleReorderDragStart = (e, idx) => {
    if (isBusy) return;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleReorderDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleReorderDrop = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...photos];
    const [item] = next.splice(dragIdx, 1);
    next.splice(idx, 0, item);
    onChange(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleReorderDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const totalSlots = (photos?.length || 0) + uploadingItems.length;
  const isBusy = batchProgress !== null;

  return (
    <div>
      {/* Batch progress bar */}
      {isBusy && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C9A96E]" />
              Uploading {batchProgress.completed} of {batchProgress.total}…
            </span>
            <span className="text-xs text-slate-400">{Math.round((batchProgress.completed / batchProgress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C9A96E] rounded-full transition-all duration-300"
              style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Drag-and-drop zone — full width */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isBusy && inputRef.current?.click()}
        className={`relative w-full rounded-xl border-2 border-dashed transition-all cursor-pointer mb-4 ${
          isDragOver
            ? "border-[#C9A96E] bg-amber-50"
            : "border-slate-200 hover:border-[#C9A96E]/50 hover:bg-slate-50"
        } ${isBusy ? "opacity-60 pointer-events-none" : ""}`}
      >
        <div className="py-8 px-4 text-center">
          <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center transition-colors ${
            isDragOver ? "bg-[#C9A96E]/15" : "bg-slate-100"
          }`}>
            <Upload className={`w-5 h-5 ${isDragOver ? "text-[#C9A96E]" : "text-slate-400"}`} />
          </div>
          <p className="text-sm font-medium text-slate-700">
            {isDragOver ? "Drop photos to upload" : "Drag photos here, or click to select"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            JPG, PNG, WebP, HEIC · up to 25 MB each · max 100 photos
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#C9A96E] hover:underline font-medium"
          >
            Browse files
          </button>
        </div>

        {/* Drag-over overlay */}
        {isDragOver && (
          <div className="absolute inset-0 rounded-xl bg-amber-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center">
              <ImageIcon className="w-8 h-8 text-[#C9A96E] mb-2" />
              <span className="text-sm font-semibold text-[#C9A96E]">Drop to upload</span>
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Photo grid (existing + uploading placeholders) */}
      {totalSlots > 0 && (
        <>
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
            {photos?.map((url, i) => {
              const isCover = i === 0;
              const isDragging = dragIdx === i;
              const isDragTarget = dragOverIdx === i && dragIdx !== i;
              return (
                <div
                  key={`${url}-${i}`}
                  draggable={!isBusy}
                  onDragStart={(e) => handleReorderDragStart(e, i)}
                  onDragOver={(e) => handleReorderDragOver(e, i)}
                  onDrop={(e) => handleReorderDrop(e, i)}
                  onDragEnd={handleReorderDragEnd}
                  className={`relative group aspect-[4/3] rounded-xl overflow-hidden transition-all duration-200 ${
                    isBusy ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
                  } ${
                    isCover ? "ring-2 ring-[#C9A96E] ring-offset-1" : "ring-1 ring-slate-200"
                  } ${isDragging ? "opacity-40 scale-95" : ""} ${isDragTarget ? "ring-2 ring-blue-400 scale-[1.02]" : ""}`}
                >
                  <img src={getImageUrl(url, "small")} className="w-full h-full object-cover" alt={`${propertyName} - Photo ${i + 1}`} />

                  {/* Drag handle */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <GripVertical className="w-5 h-5 text-white drop-shadow-lg" />
                  </div>

                  {/* Cover badge */}
                  {isCover && (
                    <span className="absolute top-1.5 left-1.5 bg-[#C9A96E] text-white text-[10px] font-semibold px-2 py-0.5 rounded-md">
                      Cover
                    </span>
                  )}

                  {/* Star (set as cover) */}
                  {!isCover && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setCover(i)}
                      title="Set as cover photo"
                      className="absolute top-1.5 left-1.5 w-6 h-6 bg-black/40 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#C9A96E]/80 disabled:opacity-0"
                    >
                      <Star className="w-3 h-3 text-white" />
                    </button>
                  )}

                  {/* Trash */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => removePhoto(i)}
                    title="Remove photo"
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500/80 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-0"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>

                  {/* Photo number */}
                  <span className="absolute bottom-1.5 right-1.5 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded-md">
                    {i + 1}
                  </span>
                </div>
              );
            })}

            {/* Uploading placeholder tiles */}
            {uploadingItems.map((item) => (
              <div
                key={item.id}
                className="relative aspect-[4/3] rounded-xl overflow-hidden ring-1 ring-[#C9A96E]/40 bg-amber-50 flex flex-col items-center justify-center"
              >
                <Loader2 className="w-5 h-5 text-[#C9A96E] animate-spin mb-1.5" />
                <span className="text-[10px] text-slate-500 truncate max-w-[80%] px-1">{item.name}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">
            Drag to reorder · ⭐ star to set cover · {photos?.length || 0} photo{(photos?.length || 0) !== 1 ? "s" : ""}
            {totalSlots >= MAX_PHOTOS && <span className="text-amber-600 font-medium"> · limit reached</span>}
          </p>
        </>
      )}
    </div>
  );
}