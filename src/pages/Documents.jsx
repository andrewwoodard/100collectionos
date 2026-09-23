import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sheet, LayoutGrid, List, X, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmptyState from "../components/shared/EmptyState";
import DocumentFormModal from "../components/documents/DocumentFormModal";
import FolderModal from "../components/documents/FolderModal";
import DocumentGrid from "../components/documents/DocumentGrid";
import DocumentListView from "../components/documents/DocumentListView";
import LinkGoogleSheetModal from "../components/documents/LinkGoogleSheetModal";
import LinkGoogleDriveFolderModal from "../components/documents/LinkGoogleDriveFolderModal";
import DocFilterBar from "../components/documents/DocFilterBar";
import DocBulkActionBar from "../components/documents/DocBulkActionBar";
import { DocSelectionProvider, useDocSelection } from "../components/documents/DocSelectionContext";
import { useToast } from "@/components/ui/use-toast";
import PreviewModal from "../components/preview/PreviewModal";
import { usePreview } from "../components/preview/usePreview";
import DocDriveSidebar from "../components/documents/DocDriveSidebar";
import DocBreadcrumb from "../components/documents/DocBreadcrumb";
import FolderCards from "../components/documents/FolderCards";
import CmdKSearch from "../components/documents/CmdKSearch";

const DOC_TYPES = [
  "all", "contract", "addendum", "tax_doc", "onboarding_form", "invoice",
  "brand_guidelines", "photography_release", "miscellaneous", "google_sheet",
  "google_doc", "msa", "nda", "vendor_agreement", "receipt",
  "financial_statement", "marketing_asset", "sop", "reference",
  "hr_doc", "insurance_doc", "crm_export",
];

const SORT_OPTIONS = [
  { value: "updated_date_desc", label: "Recently modified" },
  { value: "created_date_desc", label: "Recently uploaded" },
  { value: "title_asc", label: "Name A–Z" },
  { value: "title_desc", label: "Name Z–A" },
  { value: "doc_type_asc", label: "Type" },
  { value: "partner_name_asc", label: "Partner A–Z" },
];

const PAGE_SIZE = 50;

function sortDocuments(docs, sortValue) {
  const parts = sortValue.split("_");
  const dir = parts.pop();
  const key = parts.join("_");
  return [...docs].sort((a, b) => {
    let av = a[key] || "", bv = b[key] || "";
    if (key === "updated_date" || key === "created_date") {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    } else {
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

function scoreSearch(doc, q) {
  if (!q) return 1;
  const ql = q.toLowerCase();
  if (doc.title?.toLowerCase().includes(ql)) return 3;
  if ((doc.tags || []).some(t => t.toLowerCase() === ql)) return 2;
  if (doc.doc_type?.toLowerCase().includes(ql)) return 1.5;
  if (doc.partner_name?.toLowerCase().includes(ql)) return 1;
  if (doc.property_name?.toLowerCase().includes(ql)) return 1;
  if (doc.notes?.toLowerCase().includes(ql)) return 0.5;
  return 0;
}

function applySmartView(docs, view, folders) {
  const now = new Date();
  if (view === "recent") {
    const cutoff = new Date(now - 14 * 24 * 60 * 60 * 1000);
    return docs.filter(d => d.updated_date && new Date(d.updated_date) >= cutoff).slice(0, 10);
  }
  if (view === "pinned") {
    return docs.filter(d => (d.pinned_by || []).length > 0);
  }
  if (view === "all-contracts") {
    return docs.filter(d => ["contract", "msa", "addendum", "vendor_agreement"].includes(d.doc_type));
  }
  if (view === "pending-review") {
    const cutoff7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    return docs.filter(d =>
      ["sent", "under_review"].includes(d.status) ||
      (d.status === "draft" && d.updated_date && new Date(d.updated_date) < cutoff7)
    );
  }
  if (view === "drive-imported") {
    return docs.filter(d => d.drive_file_id);
  }
  if (view === "unattributed") {
    return docs.filter(d => !d.partner_id);
  }
  if (view === "recent-uploads") {
    const cutoff7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    return docs.filter(d => d.created_date && new Date(d.created_date) >= cutoff7);
  }
  return docs;
}

function exportToCSV(docs) {
  const headers = ["title", "doc_type", "partner_name", "property_name", "status", "visibility", "tags", "drive_file_url", "created_date"];
  const rows = docs.map(d => headers.map(h => {
    let v = d[h];
    if (Array.isArray(v)) v = v.join("; ");
    if (v == null) v = "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "documents_export.csv"; a.click();
  URL.revokeObjectURL(url);
}

// URL param helpers
function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    folder: p.get("folder") || null,
    view: p.get("view") || null,
    tag: p.get("tag") || null,
    preview: p.get("preview") || null,
  };
}

function setUrlParam(key, value) {
  const p = new URLSearchParams(window.location.search);
  if (value) p.set(key, value); else p.delete(key);
  const newUrl = `${window.location.pathname}${p.toString() ? "?" + p.toString() : ""}`;
  window.history.pushState({}, "", newUrl);
}

function clearUrlParams() {
  window.history.pushState({}, "", window.location.pathname);
}

function DocumentsInner({ documents, folders, partners, properties, queryClient, toast }) {
  const { selectedIds, clearSelection, count } = useDocSelection();

  // Navigation state — driven by URL params
  const [navState, setNavState] = useState(() => {
    const p = getUrlParams();
    return { folder: p.folder, view: p.view, tag: p.tag };
  });

  const selectedFolderId = navState.folder;
  const selectedView = navState.view;
  const selectedTag = navState.tag;

  const navigate = useCallback((updates) => {
    const next = { folder: null, view: null, tag: null, ...updates };
    setNavState(next);
    const p = new URLSearchParams();
    if (next.folder) p.set("folder", next.folder);
    if (next.view) p.set("view", next.view);
    if (next.tag) p.set("tag", next.tag);
    const url = `${window.location.pathname}${p.toString() ? "?" + p.toString() : ""}`;
    window.history.pushState({}, "", url);
    clearSelection();
  }, [clearSelection]);

  const onSelectFolder = useCallback((id) => navigate({ folder: id }), [navigate]);
  const onSelectView = useCallback((v) => navigate({ view: v }), [navigate]);
  const onSelectTag = useCallback((t) => { if (selectedTag === t) navigate({}); else navigate({ tag: t }); }, [navigate, selectedTag]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => {
      const p = getUrlParams();
      setNavState({ folder: p.folder, view: p.view, tag: p.tag });
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [advFilters, setAdvFilters] = useState({});
  const [docModal, setDocModal] = useState(false);
  const [sheetModal, setSheetModal] = useState(false);
  const [folderModal, setFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [driveFolderModal, setDriveFolderModal] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [draggingDocId, setDraggingDocId] = useState(null);
  const [page, setPage] = useState(1);
  const [bulkError, setBulkError] = useState(null);
  const [cmdKOpen, setCmdKOpen] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  useEffect(() => {
    base44.auth.me().then(u => {
      setUserEmail(u?.email || "");
      setUserId(u?.id || "");
    }).catch(() => {});
  }, []);

  const sortKey = userEmail ? `doc_sort_${userEmail}` : "doc_sort";
  const viewKey = userEmail ? `doc_view_${userEmail}` : "doc_view";
  const [sortValue, setSortValue] = useState(() => localStorage.getItem("doc_sort") || "updated_date_desc");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("doc_view") || "card");
  const updateSort = (v) => { setSortValue(v); localStorage.setItem(sortKey, v); };
  const updateView = (v) => { setViewMode(v); localStorage.setItem(viewKey, v); };
  useEffect(() => {
    if (!userEmail) return;
    const s = localStorage.getItem(`doc_sort_${userEmail}`);
    const v = localStorage.getItem(`doc_view_${userEmail}`);
    if (s) setSortValue(s);
    if (v) setViewMode(v);
  }, [userEmail]);

  // Cmd+K global shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdKOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const searchRef = useRef(null);
  useEffect(() => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchRef.current);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, typeFilter, advFilters, selectedFolderId, selectedView, selectedTag]);

  // For smart view / tag views, show all descendants; for folder nav show direct children only
  const allFiltered = useMemo(() => {
    let result = documents;

    // When a search term is active, skip folder/view/tag scoping and search globally
    if (debouncedSearch) {
      result = result.filter(d => scoreSearch(d, debouncedSearch) > 0);
    } else if (selectedView) {
      result = applySmartView(result, selectedView, folders);
    } else if (selectedTag) {
      result = result.filter(d => (d.tags || []).map(t => t.toLowerCase()).includes(selectedTag.toLowerCase()));
    } else if (selectedFolderId !== null) {
      result = result.filter(d => d.folder_id === selectedFolderId);
    } else {
      result = result.filter(d => !d.folder_id);
    }

    if (typeFilter !== "all") result = result.filter(d => d.doc_type === typeFilter);

    const f = advFilters;
    if (f.statuses?.length) result = result.filter(d => f.statuses.includes(d.status));
    if (f.visibilities?.length) result = result.filter(d => f.visibilities.includes(d.visibility));
    if (f.partnerIds?.length) result = result.filter(d => f.partnerIds.includes(d.partner_id));
    if (f.propertyIds?.length) result = result.filter(d => f.propertyIds.includes(d.property_id));
    if (f.uploaders?.length) result = result.filter(d => f.uploaders.includes(d.uploaded_by));
    if (f.tags?.length) result = result.filter(d => f.tags.every(t => (d.tags || []).map(x => x.toLowerCase()).includes(t.toLowerCase())));
    if (f.dateFrom) result = result.filter(d => !d.updated_date || new Date(d.updated_date) >= new Date(f.dateFrom));
    if (f.dateTo) result = result.filter(d => !d.updated_date || new Date(d.updated_date) <= new Date(f.dateTo + "T23:59:59"));
    if (f.driveOnly) result = result.filter(d => d.drive_file_id);
    if (f.unattributed) result = result.filter(d => !d.partner_name);

    return sortDocuments(result, sortValue);
  }, [documents, debouncedSearch, typeFilter, advFilters, selectedFolderId, selectedView, selectedTag, sortValue, folders]);

  const { previewItem, openPreview, closePreview } = usePreview(allFiltered);

  const paginated = allFiltered.slice(0, page * PAGE_SIZE);
  const hasMore = paginated.length < allFiltered.length;

  const allTags = useMemo(() => {
    const set = new Set();
    documents.forEach(d => (d.tags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }, [documents]);

  const allUploaders = useMemo(() => {
    const set = new Set();
    documents.forEach(d => d.uploaded_by && set.add(d.uploaded_by));
    return [...set].sort();
  }, [documents]);

  const selectedDocs = useMemo(() => documents.filter(d => selectedIds.has(d.id)), [documents, selectedIds]);

  const activeFilterCount = [
    typeFilter !== "all" ? 1 : 0,
    ...Object.values(advFilters).map(v => (Array.isArray(v) ? (v.length > 0 ? 1 : 0) : v ? 1 : 0)),
  ].reduce((a, b) => a + b, 0);

  // Counts for sidebar
  const recentCount = useMemo(() => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    return documents.filter(d => d.updated_date && new Date(d.updated_date) >= cutoff).length;
  }, [documents]);
  const pinnedCount = useMemo(() => documents.filter(d => (d.pinned_by || []).length > 0).length, [documents]);

  // Mutations
  const createDocMutation = useMutation({ mutationFn: (data) => base44.entities.Document.create(data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }) });
  const deleteDocMutation = useMutation({ mutationFn: (id) => base44.entities.Document.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }) });
  const moveDocMutation = useMutation({ mutationFn: ({ id, folder_id }) => base44.entities.Document.update(id, { folder_id: folder_id || null }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }) });
  const updateDocMutation = useMutation({ mutationFn: ({ id, data }) => base44.entities.Document.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }) });
  const moveFolderMutation = useMutation({ mutationFn: ({ id, parent_id }) => base44.entities.DocumentFolder.update(id, { parent_id: parent_id || null }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document-folders"] }) });
  const createFolderMutation = useMutation({ mutationFn: (data) => base44.entities.DocumentFolder.create(data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document-folders"] }) });
  const updateFolderMutation = useMutation({ mutationFn: ({ id, data }) => base44.entities.DocumentFolder.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document-folders"] }) });
  const deleteFolderMutation = useMutation({ mutationFn: (id) => base44.entities.DocumentFolder.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document-folders"] }) });

  const handleFolderSave = async (data) => {
    if (editingFolder) await updateFolderMutation.mutateAsync({ id: editingFolder.id, data: { name: data.name } });
    else await createFolderMutation.mutateAsync(data);
    setEditingFolder(null);
  };

  const handleOpenFolderModal = (parentId) => { setEditingFolder(null); setNewFolderParentId(parentId); setFolderModal(true); };
  const handleRenameFolder = (folder) => { setEditingFolder(folder); setFolderModal(true); };
  const handleDeleteFolder = async (folder) => {
    if (!confirm(`Delete folder "${folder.name}"? Documents inside will be moved to root.`)) return;
    const docsInFolder = documents.filter(d => d.folder_id === folder.id);
    await Promise.all(docsInFolder.map(d => base44.entities.Document.update(d.id, { folder_id: null })));
    const childFolders = folders.filter(f => f.parent_id === folder.id);
    await Promise.all(childFolders.map(f => base44.entities.DocumentFolder.update(f.id, { parent_id: null })));
    await deleteFolderMutation.mutateAsync(folder.id);
    if (selectedFolderId === folder.id) onSelectFolder(null);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["document-folders"] });
  };

  const handleArchive = (doc) => { updateDocMutation.mutate({ id: doc.id, data: { status: "archived", archived_at: new Date().toISOString() } }); toast({ title: "Archived", description: `"${doc.title}" archived.` }); };

  const handleBulkUpdate = async (action, docs, payload) => {
    setBulkError(null);
    const failed = [];
    const now = new Date().toISOString();
    const CHUNK = 20;
    const updates = docs.map(doc => {
      if (action === "move") return { id: doc.id, data: { folder_id: payload.folder_id } };
      if (action === "add_tags") return { id: doc.id, data: { tags: [...new Set([...(doc.tags || []), ...(payload.tags || [])])] } };
      if (action === "remove_tags") return { id: doc.id, data: { tags: (doc.tags || []).filter(t => !payload.tags.includes(t)) } };
      if (action === "set_partner") return { id: doc.id, data: { partner_id: payload.partner_id, partner_name: payload.partner_name } };
      if (action === "set_property") return { id: doc.id, data: { property_id: payload.property_id, property_name: payload.property_name } };
      if (action === "set_status") return { id: doc.id, data: { status: payload.status, ...(payload.status === "archived" ? { archived_at: now } : {}) } };
      if (action === "set_visibility") {
        if (payload.visibility === "partner_visible" && !doc.partner_id) return null;
        return { id: doc.id, data: { visibility: payload.visibility } };
      }
      if (action === "archive") return { id: doc.id, data: { status: "archived", archived_at: now } };
      return null;
    }).filter(Boolean);

    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const results = await Promise.allSettled(chunk.map(u => base44.entities.Document.update(u.id, u.data)));
      results.forEach((r, idx) => { if (r.status === "rejected") failed.push(chunk[idx].id); });
    }
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    clearSelection();
    const successCount = updates.length - failed.length;
    const labels = { move: "Moved", add_tags: "Tags added to", remove_tags: "Tags removed from", set_partner: "Partner set on", set_property: "Property set on", set_status: "Status changed for", set_visibility: "Visibility set for", archive: "Archived" };
    if (failed.length > 0) setBulkError({ message: `${failed.length} document${failed.length !== 1 ? "s" : ""} failed.` });
    else toast({ title: `${labels[action] || "Updated"} ${successCount} document${successCount !== 1 ? "s" : ""}` });
  };

  const handleBulkDelete = async (docs, hard) => {
    setBulkError(null);
    const now = new Date().toISOString();
    const results = await Promise.allSettled(docs.map(doc =>
      hard ? base44.entities.Document.delete(doc.id) : base44.entities.Document.update(doc.id, { status: "archived", archived_at: now })
    ));
    const failed = results.filter(r => r.status === "rejected").length;
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    clearSelection();
    if (failed > 0) setBulkError({ message: `${failed} document${failed !== 1 ? "s" : ""} failed.` });
    else toast({ title: hard ? `Permanently deleted ${docs.length} documents` : `Archived ${docs.length} documents` });
  };

  // Whether we're in a "browseable" folder view (not smart view / tag)
  const isFolderMode = !selectedView && !selectedTag;
  // Subfolders to show as cards (immediate children of current folder)
  const visibleSubfolders = useMemo(() => {
    if (!isFolderMode) return [];
    return folders.filter(f => selectedFolderId === null ? !f.parent_id : f.parent_id === selectedFolderId);
  }, [folders, selectedFolderId, isFolderMode]);

  // Show folder count header
  const totalCount = allFiltered.length + (isFolderMode ? visibleSubfolders.length : 0);

  return (
    <div className="flex gap-5 animate-fade-up" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Drive-style slim sidebar */}
      <DocDriveSidebar
        folders={folders}
        documents={documents}
        selectedFolderId={selectedFolderId}
        selectedView={selectedView}
        selectedTag={selectedTag}
        onSelectFolder={onSelectFolder}
        onSelectView={onSelectView}
        onSelectTag={onSelectTag}
        onAddFolder={handleOpenFolderModal}
        pinnedCount={pinnedCount}
        recentCount={recentCount}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-3">

        {/* Top bar: breadcrumb + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <DocBreadcrumb
              selectedFolderId={selectedFolderId}
              selectedView={selectedView}
              selectedTag={selectedTag}
              folders={folders}
              onSelectFolder={onSelectFolder}
              onSelectView={onSelectView}
            />
            <p className="text-xs text-gray-400">
              {allFiltered.length} document{allFiltered.length !== 1 ? "s" : ""}
              {isFolderMode && visibleSubfolders.length > 0 && `, ${visibleSubfolders.length} folder${visibleSubfolders.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCmdKOpen(true)}
              className="text-gray-500 border-gray-200 gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs text-gray-400">⌘K</span>
            </Button>
            <Button onClick={() => setDriveFolderModal(true)} variant="outline" size="sm" className="border-blue-200 text-blue-700 hover:bg-blue-50">
              <Sheet className="w-4 h-4 mr-1.5" /> Link Drive Folder
            </Button>
            <Button onClick={() => setSheetModal(true)} variant="outline" size="sm" className="border-green-200 text-green-700 hover:bg-green-50">
              <Sheet className="w-4 h-4 mr-1.5" /> Link Sheet
            </Button>
            <Button onClick={() => setDocModal(true)} size="sm" className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Upload Document
            </Button>
          </div>
        </div>

        {bulkError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start justify-between gap-3">
            <p className="text-sm text-red-800">{bulkError.message}</p>
            <button onClick={() => setBulkError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
          </div>
        )}

        <DocBulkActionBar
          selectedDocs={selectedDocs}
          folders={folders}
          partners={partners}
          properties={properties}
          onBulkUpdate={handleBulkUpdate}
          onBulkDelete={handleBulkDelete}
          onExportCSV={() => exportToCSV(selectedDocs)}
        />

        {/* Search + type + sort toolbar */}
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name, partner, property…"
              className="pl-9 bg-white"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map(t => (
                <SelectItem key={t} value={t}>
                  {t === "all" ? "All Types" : t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortValue} onValueChange={updateSort}>
            <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button onClick={() => updateView("card")} className={`p-2 transition-colors ${viewMode === "card" ? "bg-slate-800 text-white" : "text-gray-400 hover:text-gray-600"}`} title="Card view"><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => updateView("list")} className={`p-2 transition-colors ${viewMode === "list" ? "bg-slate-800 text-white" : "text-gray-400 hover:text-gray-600"}`} title="List view"><List className="w-4 h-4" /></button>
          </div>
        </div>

        <DocFilterBar
          filters={advFilters}
          onFiltersChange={setAdvFilters}
          partners={partners}
          properties={properties}
          allTags={allTags}
          allUploaders={allUploaders}
        />

        {activeFilterCount > 0 && (
          <p className="text-xs text-gray-400">
            Active filters: {activeFilterCount} ·{" "}
            <button onClick={() => { setAdvFilters({}); setTypeFilter("all"); }} className="underline hover:text-gray-600">Clear all</button>
          </p>
        )}

        {/* Folder cards (only in folder browsing mode) */}
        {isFolderMode && visibleSubfolders.length > 0 && (
          <FolderCards
            folders={visibleSubfolders}
            allFolders={folders}
            documents={documents}
            parentId={selectedFolderId}
            onNavigate={onSelectFolder}
          />
        )}

        {/* Documents */}
        {allFiltered.length === 0 && visibleSubfolders.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="This folder is empty"
            description="Upload a document or drag one into this folder"
            actionLabel="Upload Document"
            onAction={() => setDocModal(true)}
          />
        ) : allFiltered.length === 0 ? null : viewMode === "list" ? (
          <DocumentListView
            documents={paginated}
            folders={folders}
            onDelete={(id) => { if (confirm("Delete this document?")) deleteDocMutation.mutate(id); }}
            onMove={(docId, folderId) => moveDocMutation.mutate({ id: docId, folder_id: folderId })}
            onPreview={openPreview}
            onArchive={handleArchive}
            onToast={(msg) => toast({ title: msg })}
          />
        ) : (
          <DocumentGrid
            documents={paginated}
            folders={folders}
            onDelete={(id) => { if (confirm("Delete this document?")) deleteDocMutation.mutate(id); }}
            onMove={(docId, folderId) => moveDocMutation.mutate({ id: docId, folder_id: folderId })}
            onDragStart={setDraggingDocId}
            onPreview={openPreview}
            onArchive={handleArchive}
            onToast={(msg) => toast({ title: msg })}
          />
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setPage(p => p + 1)}>
              Load more ({allFiltered.length - paginated.length} remaining)
            </Button>
          </div>
        )}
      </div>

      {/* Modals */}
      <DocumentFormModal open={docModal} onOpenChange={setDocModal} partners={partners} properties={properties} folders={folders} defaultFolderId={selectedFolderId}
        onSave={async (data) => { await createDocMutation.mutateAsync(data); setDocModal(false); }} />
      <LinkGoogleSheetModal open={sheetModal} onOpenChange={(o) => { if (!o) setSheetModal(false); }} partners={partners} properties={properties} folders={folders} defaultFolderId={selectedFolderId}
        onSave={async (data) => { await createDocMutation.mutateAsync(data); setSheetModal(false); }} />
      <FolderModal open={folderModal} onOpenChange={setFolderModal} folder={editingFolder} parentId={newFolderParentId} onSave={handleFolderSave} />
      <LinkGoogleDriveFolderModal open={driveFolderModal} onOpenChange={setDriveFolderModal} folders={folders} defaultFolderId={selectedFolderId}
        onSync={() => queryClient.invalidateQueries({ queryKey: ["documents"] })} />

      {previewItem && (
        <PreviewModal
          item={previewItem}
          items={allFiltered}
          onClose={closePreview}
          onNavigate={openPreview}
          onUpdate={async (id, data) => { await updateDocMutation.mutateAsync({ id, data }); }}
          onArchive={handleArchive}
          onDelete={(id) => deleteDocMutation.mutate(id)}
          folders={folders}
          partners={partners}
          properties={properties}
          isMedia={false}
        />
      )}

      <CmdKSearch
        open={cmdKOpen}
        onClose={() => setCmdKOpen(false)}
        documents={documents}
        folders={folders}
        onOpenDoc={openPreview}
        onNavigateFolder={onSelectFolder}
      />
    </div>
  );
}

export default function Documents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: documents = [] } = useQuery({ queryKey: ["documents"], queryFn: () => base44.entities.Document.list("-created_date", 1000) });
  const { data: folders = [] } = useQuery({ queryKey: ["document-folders"], queryFn: () => base44.entities.DocumentFolder.list("name", 500) });
  const { data: partners = [] } = useQuery({ queryKey: ["partners"], queryFn: () => base44.entities.Partner.list("partner_name", 500) });
  const { data: properties = [] } = useQuery({ queryKey: ["properties"], queryFn: () => fetchAllProperties("property_name") });

  return (
    <DocSelectionProvider allDocIds={documents.map(d => d.id)}>
      <DocumentsInner
        documents={documents}
        folders={folders}
        partners={partners}
        properties={properties}
        queryClient={queryClient}
        toast={toast}
      />
    </DocSelectionProvider>
  );
}