import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Image, LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmptyState from "@/components/shared/EmptyState";
import MediaUploadModal from "@/components/media/MediaUploadModal";
import MediaFolderModal from "@/components/media/MediaFolderModal";
import MediaGrid from "@/components/media/MediaGrid";
import PreviewModal from "@/components/preview/PreviewModal";
import { usePreview } from "@/components/preview/usePreview";
import MediaDriveSidebar from "@/components/media/MediaDriveSidebar";
import DocBreadcrumb from "@/components/documents/DocBreadcrumb";
import FolderCards from "@/components/documents/FolderCards";
import CmdKSearch from "@/components/documents/CmdKSearch";

const ASSET_TYPES = ["all", "photo", "video", "logo", "pdf", "brand_asset", "other"];

function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return { folder: p.get("folder") || null, view: p.get("view") || null };
}

export default function MediaLibrary() {
  const [navState, setNavState] = useState(() => {
    const p = getUrlParams();
    return { folder: p.folder, view: p.view };
  });

  const selectedFolderId = navState.folder;
  const selectedView = navState.view;

  const navigate = useCallback((updates) => {
    const next = { folder: null, view: null, ...updates };
    setNavState(next);
    const p = new URLSearchParams();
    if (next.folder) p.set("folder", next.folder);
    if (next.view) p.set("view", next.view);
    const url = `${window.location.pathname}${p.toString() ? "?" + p.toString() : ""}`;
    window.history.pushState({}, "", url);
  }, []);

  const onSelectFolder = useCallback((id) => navigate({ folder: id }), [navigate]);
  const onSelectView = useCallback((v) => navigate({ view: v }), [navigate]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => {
      const p = getUrlParams();
      setNavState({ folder: p.folder, view: p.view });
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderModal, setFolderModal] = useState({ open: false, folder: null, parentId: null });
  const [cmdKOpen, setCmdKOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: assets = [] } = useQuery({ queryKey: ["media"], queryFn: () => base44.entities.MediaAsset.list("-created_date", 500) });
  const { data: folders = [] } = useQuery({ queryKey: ["mediaFolders"], queryFn: () => base44.entities.MediaFolder.list("name", 500) });
  const { data: partners = [] } = useQuery({ queryKey: ["partners"], queryFn: () => base44.entities.Partner.list("-created_date", 500) });
  const { data: properties = [] } = useQuery({ queryKey: ["properties"],     queryFn: () => fetchAllProperties() });

  const createAsset = useMutation({ mutationFn: d => base44.entities.MediaAsset.create(d), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }) });
  const updateAsset = useMutation({ mutationFn: ({ id, data }) => base44.entities.MediaAsset.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }) });
  const deleteAsset = useMutation({ mutationFn: id => base44.entities.MediaAsset.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }) });
  const createFolder = useMutation({ mutationFn: d => base44.entities.MediaFolder.create(d), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mediaFolders"] }) });
  const updateFolder = useMutation({ mutationFn: ({ id, data }) => base44.entities.MediaFolder.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mediaFolders"] }) });
  const deleteFolder = useMutation({
    mutationFn: async (folderId) => {
      const getAllDescendants = (id) => {
        const children = folders.filter(f => f.parent_id === id);
        return [id, ...children.flatMap(c => getAllDescendants(c.id))];
      };
      const ids = getAllDescendants(folderId);
      const affected = assets.filter(a => ids.includes(a.folder_id));
      await Promise.all(affected.map(a => base44.entities.MediaAsset.update(a.id, { folder_id: null })));
      await Promise.all(ids.map(id => base44.entities.MediaFolder.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mediaFolders"] });
      queryClient.invalidateQueries({ queryKey: ["media"] });
      onSelectFolder(null);
    }
  });

  // Cmd+K
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

  const applySmartView = (items, view) => {
    if (view === "recent") {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      return items.filter(a => a.created_date && new Date(a.created_date) >= cutoff);
    }
    if (view === "pinned") return items.filter(a => a.approval_status === "approved");
    if (view === "pending") return items.filter(a => a.approval_status === "pending");
    if (view === "rejected") return items.filter(a => a.approval_status === "rejected");
    if (view === "unattributed") return items.filter(a => !a.partner_id);
    return items;
  };

  const filtered = (() => {
    let result = assets;
    if (selectedView) {
      result = applySmartView(result, selectedView);
    } else if (selectedFolderId) {
      result = result.filter(a => a.folder_id === selectedFolderId);
    } else {
      result = result.filter(a => !a.folder_id);
    }
    if (search) result = result.filter(a => a.asset_name?.toLowerCase().includes(search.toLowerCase()));
    if (typeFilter !== "all") result = result.filter(a => a.asset_type === typeFilter);
    return result;
  })();

  const [draggedAssetId, setDraggedAssetId] = useState(null);
  const { previewItem, openPreview, closePreview } = usePreview(filtered);

  const handleSaveFolder = async (data) => {
    if (folderModal.folder) await updateFolder.mutateAsync({ id: folderModal.folder.id, data });
    else await createFolder.mutateAsync(data);
  };

  // Subfolders as cards
  const isFolderMode = !selectedView;
  const visibleSubfolders = isFolderMode
    ? folders.filter(f => selectedFolderId === null ? !f.parent_id : f.parent_id === selectedFolderId)
    : [];

  // Fake "docs" list for CmdK compatibility (media assets)
  const assetDocsForSearch = assets.map(a => ({
    ...a,
    id: a.id,
    title: a.asset_name,
    doc_type: a.asset_type,
    folder_id: a.folder_id,
  }));

  return (
    <div className="flex gap-5 animate-fade-up" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Sidebar */}
      <MediaDriveSidebar
        folders={folders}
        assets={assets}
        selectedFolderId={selectedFolderId}
        selectedView={selectedView}
        onSelectFolder={onSelectFolder}
        onSelectView={onSelectView}
        onAddFolder={(parentId) => setFolderModal({ open: true, folder: null, parentId })}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <DocBreadcrumb
              selectedFolderId={selectedFolderId}
              selectedView={selectedView}
              selectedTag={null}
              folders={folders}
              onSelectFolder={onSelectFolder}
              onSelectView={onSelectView}
              rootLabel="Media"
            />
            <p className="text-xs text-gray-400">
              {filtered.length} asset{filtered.length !== 1 ? "s" : ""}
              {isFolderMode && visibleSubfolders.length > 0 && `, ${visibleSubfolders.length} folder${visibleSubfolders.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCmdKOpen(true)} className="text-gray-500 border-gray-200 gap-1.5">
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs text-gray-400">⌘K</span>
            </Button>
            <Button onClick={() => setUploadOpen(true)} size="sm" className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Upload Asset
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search assets…" className="pl-9 bg-white" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t === "all" ? "All Types" : t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Subfolder cards */}
        {isFolderMode && visibleSubfolders.length > 0 && (
          <FolderCards
            folders={visibleSubfolders}
            allFolders={folders}
            documents={assets.map(a => ({ ...a, folder_id: a.folder_id }))}
            parentId={selectedFolderId}
            onNavigate={onSelectFolder}
          />
        )}

        {filtered.length === 0 && visibleSubfolders.length === 0 ? (
          <EmptyState icon={Image} title="No media assets" description="Upload your first asset to this folder" actionLabel="Upload Asset" onAction={() => setUploadOpen(true)} />
        ) : filtered.length > 0 ? (
          <MediaGrid
            assets={filtered}
            folders={folders}
            onDelete={(id) => deleteAsset.mutate(id)}
            onMove={(id, folderId) => updateAsset.mutate({ id, data: { folder_id: folderId } })}
            onDragStart={setDraggedAssetId}
            onPreview={openPreview}
          />
        ) : null}
      </div>

      <MediaUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        partners={partners}
        properties={properties}
        folders={folders}
        defaultFolderId={selectedFolderId}
        onSave={async (data) => { await createAsset.mutateAsync(data); }}
      />

      <MediaFolderModal
        open={folderModal.open}
        onOpenChange={(o) => setFolderModal(f => ({ ...f, open: o }))}
        folder={folderModal.folder}
        parentId={folderModal.parentId}
        onSave={handleSaveFolder}
      />

      {previewItem && (
        <PreviewModal
          item={previewItem}
          items={filtered}
          onClose={closePreview}
          onNavigate={openPreview}
          onUpdate={async (id, data) => { await updateAsset.mutateAsync({ id, data }); }}
          onArchive={() => {}}
          onDelete={(id) => { deleteAsset.mutate(id); closePreview(); }}
          folders={folders}
          partners={partners}
          properties={properties}
          isMedia={true}
        />
      )}

      <CmdKSearch
        open={cmdKOpen}
        onClose={() => setCmdKOpen(false)}
        documents={assetDocsForSearch}
        folders={folders}
        onOpenDoc={openPreview}
        onNavigateFolder={onSelectFolder}
      />
    </div>
  );
}