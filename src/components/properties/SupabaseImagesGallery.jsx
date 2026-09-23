import React, { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, ImageIcon, GripVertical, UploadCloud } from "lucide-react";
import { normalizeStorageUrl } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { getImageUrl } from "@/lib/imageUrl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import AiPhotoPullButton from "./AiPhotoPullButton";
import PasteHtmlButton from "./PasteHtmlButton";

/**
 * Editable image gallery backed by the `propertiesbase44.images` column.
 * Supports drag-to-reorder, file upload, URL add, and delete — all of which
 * write the updated array back to Supabase via the supabaseProperties function.
 */
export default function SupabaseImagesGallery({ images: propImages = [], supabasePropertyId, sbQueryKey, listingUrl }) {
  const queryClient = useQueryClient();
  const [localImages, setLocalImages] = useState(propImages);
  const [addOpen, setAddOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState(null);
  const dragSourceRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Sync local state when the prop changes (after Supabase update resolves)
  useEffect(() => {
    setLocalImages(propImages);
  }, [propImages]);

  // Persist the images array to propertiesbase44.images
  const saveImages = useCallback(async (newImages) => {
    if (!supabasePropertyId) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("supabaseProperties", {
        action: "update",
        id: supabasePropertyId,
        data: { images: newImages },
      });
      if (res.data?.property) {
        queryClient.setQueryData(["supabase-property", sbQueryKey], res.data.property);
        queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
      }
    } catch {
    } finally {
      setSaving(false);
    }
  }, [supabasePropertyId, sbQueryKey, queryClient]);

  // Upload files via the Add Image dialog
  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const res = await base44.integrations.Core.UploadFile({ file: await compressImage(file) });
        if (res?.file_url) urls.push(res.file_url);
      }
      if (urls.length > 0) {
        const updated = [...localImages, ...urls];
        setLocalImages(updated);
        await saveImages(updated);
      }
      setAddOpen(false);
    } catch {
    } finally {
      setUploading(false);
    }
  }, [localImages, saveImages]);

  // Upload files dropped directly onto the grid
  const handleDropUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setDropActive(false);
    setDropUploading(true);
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const res = await base44.integrations.Core.UploadFile({ file: await compressImage(file) });
        if (res?.file_url) urls.push(res.file_url);
      }
      if (urls.length > 0) {
        const updated = [...localImages, ...urls];
        setLocalImages(updated);
        await saveImages(updated);
      }
    } catch {
    } finally {
      setDropUploading(false);
    }
  }, [localImages, saveImages]);

  // Add image by URL
  const handleAddUrl = async () => {
    if (!newUrl.trim()) return;
    const updated = [...localImages, newUrl.trim()];
    setLocalImages(updated);
    setNewUrl("");
    setAddOpen(false);
    await saveImages(updated);
  };

  // Delete image by index
  const handleDelete = async (index) => {
    if (!confirm("Remove this image?")) return;
    setDeletingIndex(index);
    const updated = localImages.filter((_, i) => i !== index);
    setLocalImages(updated);
    await saveImages(updated);
    setDeletingIndex(null);
  };

  // Drag-and-drop reorder
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const sourceIndex = dragSourceRef.current;
    dragSourceRef.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === dropIndex) return;
    const reordered = Array.from(localImages);
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setLocalImages(reordered);
    setReordering(true);
    saveImages(reordered).finally(() => setReordering(false));
  };

  return (
    <div
      className={`space-y-4 relative transition-colors ${
        dropActive ? "bg-blue-50 ring-2 ring-blue-400 ring-inset rounded-xl" : ""
      }`}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (dragSourceRef.current === null) setDropActive(true); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragSourceRef.current === null) setDropActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); if (dragSourceRef.current === null) setDropActive(false); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation();
        if (dragSourceRef.current === null && e.dataTransfer.files.length > 0) {
          handleDropUpload(e.dataTransfer.files);
        }
        setDropActive(false);
      }}
    >
      {dropActive && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-blue-50/90 rounded-xl pointer-events-none">
          <UploadCloud className="w-10 h-10 text-blue-500 mb-2" />
          <p className="text-sm font-medium text-blue-700">Drop images to upload</p>
        </div>
      )}
      {dropUploading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 rounded-xl">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2" />
          <p className="text-xs text-gray-500">Uploading…</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {localImages.length} image{localImages.length !== 1 ? "s" : ""}
          {reordering ? " · saving order…" : ""}
          {saving && !reordering ? " · saving…" : ""}
        </p>
        <div className="flex items-center gap-2">
          <AiPhotoPullButton
            listingUrl={listingUrl}
            supabasePropertyId={supabasePropertyId}
            sbQueryKey={sbQueryKey}
            currentImages={localImages}
          />
          <PasteHtmlButton
            listingUrl={listingUrl}
            supabasePropertyId={supabasePropertyId}
            sbQueryKey={sbQueryKey}
            currentImages={localImages}
          />
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Image
          </Button>
        </div>
      </div>

      {localImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <ImageIcon className="w-10 h-10 mb-3" />
          <p className="text-sm">No images yet. Drag & drop images here, or click Add Image.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Image
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {localImages.map((url, index) => (
            <div
              key={index}
              className={`relative ${dragOverIndex === index && dragSourceRef.current !== null ? "ring-2 ring-blue-400 rounded-lg" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div
                draggable
                onDragStart={() => { dragSourceRef.current = index; }}
                onDragEnd={() => { dragSourceRef.current = null; setDragOverIndex(null); }}
                className={`relative group rounded-lg overflow-hidden border bg-gray-50 aspect-video cursor-grab active:cursor-grabbing ${
                  dragSourceRef.current === index ? "opacity-40" : ""
                } border-gray-100`}
              >
                <img
                  src={getImageUrl(normalizeStorageUrl(url) || url, "small")}
                  alt={`Property image ${index + 1}`}
                  className="w-full h-full object-cover pointer-events-none"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
                <div
                  className="absolute top-2 left-2 bg-black/40 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(index); }}
                  draggable={false}
                  disabled={deletingIndex === index}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50"
                >
                  {deletingIndex === index ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                setDragActive(false);
                handleFiles(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                dragActive ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => document.getElementById("sb-image-file-input")?.click()}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-xs text-gray-500">Uploading…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-2">
                  <UploadCloud className="w-7 h-7 text-gray-400" />
                  <p className="text-xs text-gray-500">Drag & drop images here, or click to browse</p>
                </div>
              )}
              <input
                id="sb-image-file-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddUrl(); }}
                placeholder="…or paste an image URL"
                className="text-sm"
              />
              <Button size="sm" onClick={handleAddUrl} disabled={!newUrl.trim()}>
                Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}