import React, { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, ImageIcon, GripVertical, UploadCloud } from "lucide-react";
import { imageUrlFromMetadata, normalizeStorageUrl } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { getImageUrl } from "@/lib/imageUrl";
import { uploadPropertyImage } from "@/lib/propertyImagesBlob";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import SupabaseImagesGallery from "./SupabaseImagesGallery";
import AiPhotoPullButton from "./AiPhotoPullButton";
import PasteHtmlButton from "./PasteHtmlButton";

export default function PropertyImagesTab({ listingUrl, propertyImages = [], supabasePropertyId, sbQueryKey }) {
  const syncedImages = Array.isArray(propertyImages) ? propertyImages : [];
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newAlt, setNewAlt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [reordering, setReordering] = useState(false);
  const dragSourceRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const fileUrl = await uploadPropertyImage(await compressImage(file));
        if (fileUrl) {
          await base44.functions.invoke("imageMetadata", {
            action: "create",
            data: {
              original_url: fileUrl,
              alttext: file.name.replace(/\.[^.]+$/, ""),
              proppage: listingUrl,
              property_url: listingUrl,
            },
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["property-images", listingUrl] });
      setAddOpen(false);
    } catch {
    } finally {
      setUploading(false);
    }
  }, [listingUrl, queryClient]);

  // Upload dropped files directly into the images grid (no dialog needed)
  const [dropUploading, setDropUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const handleDropUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setDropActive(false);
    setDropUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const fileUrl = await uploadPropertyImage(await compressImage(file));
        if (fileUrl) {
          await base44.functions.invoke("imageMetadata", {
            action: "create",
            data: {
              original_url: fileUrl,
              alttext: file.name.replace(/\.[^.]+$/, ""),
              proppage: listingUrl,
              property_url: listingUrl,
            },
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["property-images", listingUrl] });
    } catch {
    } finally {
      setDropUploading(false);
    }
  }, [listingUrl, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["property-images", listingUrl],
    queryFn: async () => {
      const res = await base44.functions.invoke("imageMetadata", { action: "list", property_url: listingUrl });
      return res.data;
    },
    enabled: !!listingUrl,
  });

  const images = Array.isArray(data?.images) ? data.images : [];

  const handleDelete = async (id) => {
    if (!confirm("Remove this image?")) return;
    setDeletingId(id);
    await base44.functions.invoke("imageMetadata", { action: "delete", id });
    queryClient.invalidateQueries({ queryKey: ["property-images", listingUrl] });
    setDeletingId(null);
  };

  const handleAdd = async () => {
    if (!newUrl.trim()) return;
    setSaving(true);
    await base44.functions.invoke("imageMetadata", {
      action: "create",
      data: {
        original_url: newUrl.trim(),
        alttext: newAlt.trim() || null,
        proppage: listingUrl,
        property_url: listingUrl,
      },
    });
    queryClient.invalidateQueries({ queryKey: ["property-images", listingUrl] });
    setNewUrl("");
    setNewAlt("");
    setSaving(false);
    setAddOpen(false);
  };

  const saveOrder = useCallback(async (reordered) => {
    const newOrderedIds = reordered.map((img) => img.id);
    setReordering(true);
    try {
      await base44.functions.invoke("imageMetadata", {
        action: "reorder",
        data: { property_url: listingUrl, ordered_image_ids: newOrderedIds },
      });
      await queryClient.refetchQueries({ queryKey: ["property-images", listingUrl] });
    } catch {
    } finally {
      setReordering(false);
    }
  }, [listingUrl, queryClient]);

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const sourceIndex = dragSourceRef.current;
    dragSourceRef.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === dropIndex) return;
    const reordered = Array.from(images);
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    saveOrder(reordered);
  };

  if (!listingUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <ImageIcon className="w-10 h-10 mb-3" />
        <p className="text-sm">No listing URL set for this property. Images are linked via the listing URL.</p>
      </div>
    );
  }

  // propertiesbase44 `images` is the source of truth. When present and we have
  // a Supabase property ID, show the editable gallery that writes reorder/add/delete
  // changes back to the images column. Otherwise fall back to read-only or the
  // image_metadata management gallery below.
  if (syncedImages.length > 0 && supabasePropertyId) {
    return (
      <SupabaseImagesGallery
        images={syncedImages}
        supabasePropertyId={supabasePropertyId}
        sbQueryKey={sbQueryKey}
        listingUrl={listingUrl}
      />
    );
  }

  // No Supabase property ID — show read-only gallery as fallback.
  if (syncedImages.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{syncedImages.length} image{syncedImages.length !== 1 ? "s" : ""}</p>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Synced from website</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {syncedImages.map((url, index) => (
            <div key={index} className="relative group rounded-lg overflow-hidden border border-gray-100 bg-gray-50 aspect-video">
              <img
                src={getImageUrl(normalizeStorageUrl(url), "small")}
                alt={`Property image ${index + 1}`}
                className="w-full h-full object-cover pointer-events-none"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-video bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

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
          {images.length} image{images.length !== 1 ? "s" : ""}{reordering ? " · saving order…" : ""}
        </p>
        <div className="flex items-center gap-2">
          <AiPhotoPullButton
            listingUrl={listingUrl}
            supabasePropertyId={supabasePropertyId}
            sbQueryKey={sbQueryKey}
            currentImages={syncedImages}
          />
          <PasteHtmlButton
            listingUrl={listingUrl}
            supabasePropertyId={supabasePropertyId}
            sbQueryKey={sbQueryKey}
            currentImages={syncedImages}
          />
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Image
          </Button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <ImageIcon className="w-10 h-10 mb-3" />
          <p className="text-sm">No images found for this property.</p>
          <p className="text-xs mt-1">Drag & drop images here, or click Add Image</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Image
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div
              key={String(img.id)}
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
                  src={getImageUrl(imageUrlFromMetadata(img), "small")}
                  alt={img.alttext || "Property image"}
                  className="w-full h-full object-cover pointer-events-none"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
                {img.alttext && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {img.alttext}
                  </div>
                )}
                <div
                  className="absolute top-2 left-2 bg-black/40 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(img.id); }}
                  draggable={false}
                  disabled={deletingId === img.id}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50"
                >
                  {deletingId === img.id ? (
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
              onClick={() => document.getElementById("image-file-input")?.click()}
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
                id="image-file-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
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