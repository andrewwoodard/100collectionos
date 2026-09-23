import { useState, useEffect, useCallback } from "react";

/**
 * Manages preview modal state + keyboard navigation for a list of items.
 * Returns: { previewItem, previewIndex, openPreview, closePreview, goPrev, goNext }
 */
export function usePreview(items = []) {
  const [previewId, setPreviewId] = useState(null);

  const previewIndex = items.findIndex(i => i.id === previewId);
  const previewItem = previewIndex >= 0 ? items[previewIndex] : null;

  const openPreview = useCallback((item) => setPreviewId(item?.id ?? null), []);
  const closePreview = useCallback(() => setPreviewId(null), []);
  const goPrev = useCallback(() => {
    if (previewIndex > 0) setPreviewId(items[previewIndex - 1].id);
  }, [previewIndex, items]);
  const goNext = useCallback(() => {
    if (previewIndex < items.length - 1) setPreviewId(items[previewIndex + 1].id);
  }, [previewIndex, items]);

  // Keyboard: Left / Right arrows, Spacebar to open if nothing open
  useEffect(() => {
    const handler = (e) => {
      if (!previewItem) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewItem, goPrev, goNext]);

  // URL param sync: ?preview=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("preview");
    if (id) setPreviewId(id);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (previewId) {
      url.searchParams.set("preview", previewId);
    } else {
      url.searchParams.delete("preview");
    }
    window.history.replaceState(null, "", url.toString());
  }, [previewId]);

  return { previewItem, previewIndex, openPreview, closePreview, goPrev, goNext };
}