import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink, Download, Archive, Trash2, FolderInput, Tag, Plus, Save, XCircle, Eye, EyeOff, Globe, AlertCircle, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/shared/StatusBadge";

// ── helpers ──────────────────────────────────────────────────────────────────

function getIframeSrc(doc) {
  if (!doc) return null;
  const mime = doc.drive_mime_type || "";
  const id = doc.drive_file_id;
  if (!id) return null;
  if (mime === "application/vnd.google-apps.spreadsheet") return `https://docs.google.com/spreadsheets/d/${id}/preview`;
  if (mime === "application/vnd.google-apps.document") return `https://docs.google.com/document/d/${id}/preview`;
  if (mime === "application/vnd.google-apps.presentation") return `https://docs.google.com/presentation/d/${id}/preview`;
  return `https://drive.google.com/file/d/${id}/preview`;
}

function getFileType(item) {
  if (!item) return "unknown";
  const url = item.file_url || item.drive_file_url || "";
  const mime = item.drive_mime_type || "";
  if (item.drive_file_id) return "drive";
  if (mime.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(url)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|avi)(\?|$)/i.test(url)) return "video";
  if (mime === "application/pdf" || /\.pdf(\?|$)/i.test(url)) return "pdf";
  if (item.asset_type === "photo" || item.asset_type === "logo") return "image";
  if (item.asset_type === "video") return "video";
  if (item.file_url) return "uploaded_other";
  return "unknown";
}

function getOpenUrl(item) {
  if (!item) return null;
  return item.drive_file_url || item.google_sheet_url || item.file_url || null;
}

function getDownloadUrl(item) {
  if (!item) return null;
  if (item.drive_file_id) return `https://drive.google.com/uc?export=download&id=${item.drive_file_id}`;
  return item.file_url || null;
}

const VISIBILITY_LABELS = {
  internal: { label: "Internal", icon: EyeOff, tip: "Visible only to internal admins", color: "bg-gray-100 text-gray-600" },
  partner_visible: { label: "Partner", icon: Eye, tip: "Visible to assigned partner in their portal", color: "bg-blue-50 text-blue-700" },
  public: { label: "Public", icon: Globe, tip: "Visible to anyone with the link", color: "bg-green-50 text-green-700" },
};

// ── Preview renderer ──────────────────────────────────────────────────────────

function PreviewPane({ item, iframeCache }) {
  const [loading, setLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const fileType = getFileType(item);
  const iframeSrc = fileType === "drive" ? getIframeSrc(item) : null;
  const cacheKey = item?.id;

  useEffect(() => {
    setLoading(true);
    setIframeError(false);
    // If cached, skip loading state
    if (cacheKey && iframeCache.current[cacheKey]) {
      setLoading(false);
    }
  }, [item?.id]);

  const handleLoad = () => {
    setLoading(false);
    if (cacheKey) iframeCache.current[cacheKey] = Date.now();
  };

  if (!item) return null;

  if (fileType === "drive" && iframeSrc) {
    return (
      <div className="relative w-full h-full bg-gray-50">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 text-slate-400 animate-spin" />
              <p className="text-sm text-gray-400">Loading preview…</p>
            </div>
          </div>
        )}
        {iframeError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-50">
            <AlertCircle className="w-10 h-10 text-gray-300" />
            <p className="text-sm text-gray-500 text-center">Couldn't preview this file.<br />It may require Drive access.</p>
            <a href={getOpenUrl(item)} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1.5" />Open in Drive</Button>
            </a>
          </div>
        ) : (
          <iframe
            key={item.id}
            src={iframeSrc}
            title={item.title || item.asset_name}
            className="w-full h-full border-0"
            onLoad={handleLoad}
            onError={() => { setIframeError(true); setLoading(false); }}
            allow="autoplay"
          />
        )}
      </div>
    );
  }

  if (fileType === "image") {
    const url = item.file_url || item.thumbnail_url;
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 p-4">
        <img src={url} alt={item.title || item.asset_name} className="max-w-full max-h-full object-contain rounded" />
      </div>
    );
  }

  if (fileType === "video") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <video controls src={item.file_url} className="max-w-full max-h-full" />
      </div>
    );
  }

  if (fileType === "pdf") {
    return (
      <div className="w-full h-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <Loader2 className="w-7 h-7 text-slate-400 animate-spin" />
          </div>
        )}
        <embed src={item.file_url} type="application/pdf" className="w-full h-full" onLoad={() => setLoading(false)} />
      </div>
    );
  }

  // Fallback
  const openUrl = getOpenUrl(item);
  const downloadUrl = getDownloadUrl(item);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gray-50 p-8">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
        <ExternalLink className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-base font-medium text-gray-700 text-center">{item.title || item.asset_name}</p>
      <p className="text-sm text-gray-400 text-center">Preview not available for this file type.</p>
      <div className="flex gap-2">
        {openUrl && (
          <a href={openUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1.5" />Open</Button>
          </a>
        )}
        {downloadUrl && (
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download>
            <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1.5" />Download</Button>
          </a>
        )}
      </div>
    </div>
  );
}

// ── Metadata / action pane ────────────────────────────────────────────────────

function MetaPane({ item, folders, partners, properties, onUpdate, onArchive, onDelete, onClose, isMedia }) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setEditData({
      partner_id: item.partner_id || "",
      partner_name: item.partner_name || "",
      property_id: item.property_id || "",
      property_name: item.property_name || "",
      status: item.status || "draft",
      visibility: item.visibility || "internal",
      tags: [...(item.tags || [])],
      notes: item.notes || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(item.id, editData);
    setSaving(false);
    setEditing(false);
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t || editData.tags.includes(t)) return;
    setEditData(d => ({ ...d, tags: [...d.tags, t] }));
    setNewTag("");
  };

  const removeTag = (t) => setEditData(d => ({ ...d, tags: d.tags.filter(x => x !== t) }));

  const vis = VISIBILITY_LABELS[item.visibility] || VISIBILITY_LABELS.internal;
  const VisIcon = vis.icon;
  const folderName = item.folder_id ? folders.find(f => f.id === item.folder_id)?.name : null;
  const openUrl = getOpenUrl(item);
  const downloadUrl = getDownloadUrl(item);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header with primary actions */}
      <div className="flex-shrink-0 p-4 border-b border-gray-100 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug break-words">{item.title || item.asset_name}</h3>
        <div className="flex flex-wrap gap-1.5">
          {item.doc_type && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
              {item.doc_type.replace(/_/g, " ")}
            </span>
          )}
          {item.asset_type && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{item.asset_type}</span>
          )}
          {item.status && <StatusBadge status={item.status} />}
          {item.approval_status && (
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${item.approval_status === "approved" ? "bg-green-50 text-green-700" : item.approval_status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
              {item.approval_status}
            </span>
          )}
        </div>
        {!isMedia && item.visibility && (
          <div className="relative group/vis inline-flex">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-default ${vis.color}`}>
              <VisIcon className="w-3 h-3" />{vis.label}
            </span>
            <div className="absolute bottom-full left-0 mb-1 hidden group-hover/vis:block z-10 bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">{vis.tip}</div>
          </div>
        )}
        {/* Action buttons */}
        <div className="flex flex-col gap-1.5">
          {openUrl && (
            <a href={openUrl} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button size="sm" className="w-full bg-slate-800 hover:bg-slate-700 text-white justify-start">
                <ExternalLink className="w-3.5 h-3.5 mr-2" />Open in Drive
              </Button>
            </a>
          )}
          {downloadUrl && (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download className="w-full">
              <Button size="sm" variant="outline" className="w-full justify-start">
                <Download className="w-3.5 h-3.5 mr-2" />Download
              </Button>
            </a>
          )}
          {!editing && (
            <Button size="sm" variant="outline" className="w-full justify-start" onClick={startEdit}>
              <Tag className="w-3.5 h-3.5 mr-2" />Edit details
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {editing ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Edit Details</p>
            {!isMedia && (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Status</label>
                  <Select value={editData.status} onValueChange={v => setEditData(d => ({ ...d, status: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["draft","sent","signed","archived"].map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Visibility</label>
                  <Select value={editData.visibility} onValueChange={v => setEditData(d => ({ ...d, visibility: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal" className="text-xs">Internal</SelectItem>
                      <SelectItem value="partner_visible" className="text-xs">Partner visible</SelectItem>
                      <SelectItem value="public" className="text-xs">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Partner</label>
              <Select value={editData.partner_id || "__none__"} onValueChange={v => {
                const p = partners.find(x => x.id === v);
                setEditData(d => ({ ...d, partner_id: p?.id || "", partner_name: p?.partner_name || "" }));
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">— None —</SelectItem>
                  {partners.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.partner_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Property</label>
              <Select value={editData.property_id || "__none__"} onValueChange={v => {
                const p = properties.find(x => x.id === v);
                setEditData(d => ({ ...d, property_id: p?.id || "", property_name: p?.property_name || "" }));
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">— None —</SelectItem>
                  {properties.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.property_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Tags</label>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {editData.tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:text-red-500"><XCircle className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <Input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === "Enter" && addTag()} placeholder="Add tag…" className="h-7 text-xs flex-1" />
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={addTag}><Plus className="w-3 h-3" /></Button>
              </div>
            </div>
            {!isMedia && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes</label>
                <textarea value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} className="w-full text-xs border border-gray-200 rounded-lg p-2 resize-none min-h-[60px] focus:outline-none focus:ring-1 focus:ring-slate-400" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="bg-slate-800 hover:bg-slate-700 text-white flex-1" onClick={handleSave} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</p>
            <MetaRow label="Partner" value={item.partner_name || <span className="text-gray-300">—</span>} />
            <MetaRow label="Property" value={item.property_name || <span className="text-gray-300">—</span>} />
            {folderName && <MetaRow label="Folder" value={folderName} />}
            <MetaRow label="Uploaded by" value={item.uploaded_by ? item.uploaded_by.split("@")[0] : <span className="text-gray-300">—</span>} />
            {item.updated_date && <MetaRow label="Modified" value={format(new Date(item.updated_date), "MMM d, yyyy")} />}
            {item.created_date && <MetaRow label="Created" value={format(new Date(item.created_date), "MMM d, yyyy")} />}
            {(item.tags || []).length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Tags</span>
                <div className="flex flex-wrap gap-1">
                  {item.tags.map(t => (
                    <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {item.notes && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{item.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Danger zone */}
        {!editing && (
          <div className="pt-2 border-t border-gray-100 space-y-1.5">
            {!isMedia && (
              <Button size="sm" variant="ghost" className="w-full justify-start text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                onClick={() => onArchive(item)}>
                <Archive className="w-3.5 h-3.5 mr-2" />Archive
              </Button>
            )}
            <Button size="sm" variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => { if (confirm(`Delete "${item.title || item.asset_name}"?`)) { onDelete(item.id); onClose(); } }}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
            </Button>
          </div>
        )}

        {/* Activity stub */}
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Activity</p>
          <p className="text-xs text-gray-300">No recent activity</p>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-700">{value}</span>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function PreviewModal({
  item,           // current doc or media asset
  items,          // ordered list for prev/next navigation
  onClose,
  onNavigate,     // (item) => void — navigate to a different item
  onUpdate,       // (id, data) => Promise
  onArchive,      // (item) => void
  onDelete,       // (id) => void
  folders = [],
  partners = [],
  properties = [],
  isMedia = false,
}) {
  const iframeCache = useRef({});
  const [mobileTab, setMobileTab] = useState("preview"); // "preview" | "details"
  const overlayRef = useRef(null);

  const currentIndex = items.findIndex(i => i.id === item?.id);
  const hasPrevItem = currentIndex > 0;
  const hasNextItem = currentIndex < items.length - 1;

  const goPrev = useCallback(() => { if (hasPrevItem) onNavigate(items[currentIndex - 1]); }, [hasPrevItem, items, currentIndex, onNavigate]);
  const goNext = useCallback(() => { if (hasNextItem) onNavigate(items[currentIndex + 1]); }, [hasNextItem, items, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goPrev, goNext]);

  // Flush iframe cache on close
  useEffect(() => {
    return () => { iframeCache.current = {}; };
  }, []);

  if (!item) return null;

  const counter = items.length > 1 ? `${currentIndex + 1} of ${items.length}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-[50px]"
      style={{ background: "rgba(0,0,0,0.6)" }}
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${item.title || item.asset_name}`}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full h-full overflow-hidden" style={{ maxWidth: "min(1400px, calc(100vw - 100px))", maxHeight: "min(900px, calc(100vh - 100px))" }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Prev/Next */}
            <div className="flex items-center gap-1">
              <button
                onClick={goPrev}
                disabled={!hasPrevItem}
                aria-label="Previous document"
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={goNext}
                disabled={!hasNextItem}
                aria-label="Next document"
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <h2 className="text-sm font-semibold text-gray-900 truncate max-w-[300px]">{item.title || item.asset_name}</h2>
          </div>
          {counter && <span className="text-xs text-gray-400 flex-shrink-0">{counter}</span>}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile tab switcher */}
            <div className="flex md:hidden gap-1 border border-gray-200 rounded-lg p-0.5">
              <button onClick={() => setMobileTab("preview")} className={`text-xs px-2 py-1 rounded transition-colors ${mobileTab === "preview" ? "bg-slate-800 text-white" : "text-gray-500"}`}>Preview</button>
              <button onClick={() => setMobileTab("details")} className={`text-xs px-2 py-1 rounded transition-colors ${mobileTab === "details" ? "bg-slate-800 text-white" : "text-gray-500"}`}>Details</button>
            </div>
            <button onClick={onClose} aria-label="Close preview" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body: preview pane + meta pane */}
        <div className="flex flex-1 min-h-0">
          {/* Preview pane — hidden on mobile when details tab active */}
          <div className={`flex-1 min-w-0 relative ${mobileTab === "details" ? "hidden md:flex" : "flex"}`}>
            <div className="w-full h-full">
              <PreviewPane item={item} iframeCache={iframeCache} />
            </div>
            {/* Nav overlays on preview pane */}
            {hasPrevItem && (
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg rounded-full p-2 transition-all opacity-70 hover:opacity-100 z-10"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
            )}
            {hasNextItem && (
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg rounded-full p-2 transition-all opacity-70 hover:opacity-100 z-10"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5 text-gray-700" />
              </button>
            )}
          </div>

          {/* Meta pane */}
          <div className={`w-72 flex-shrink-0 border-l border-gray-100 ${mobileTab === "preview" ? "hidden md:flex md:flex-col" : "flex flex-col w-full md:w-72"}`}>
            <MetaPane
              item={item}
              folders={folders}
              partners={partners}
              properties={properties}
              onUpdate={onUpdate}
              onArchive={onArchive}
              onDelete={onDelete}
              onClose={onClose}
              isMedia={isMedia}
            />
          </div>
        </div>
      </div>
    </div>
  );
}