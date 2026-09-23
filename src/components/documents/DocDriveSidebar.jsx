import React, { useState, useMemo } from "react";
import {
  Clock, Pin, FileText, AlertCircle, FolderOpen, Upload,
  Folder, Home, Tag, ChevronDown, ChevronRight, Plus, Search
} from "lucide-react";
import { cn } from "@/lib/utils";

const SMART_VIEWS = [
  {
    id: "all-contracts",
    label: "All Contracts",
    icon: FileText,
    color: "text-blue-600",
  },
  {
    id: "pending-review",
    label: "Pending Review",
    icon: AlertCircle,
    color: "text-amber-600",
  },
  {
    id: "drive-imported",
    label: "Drive Imported",
    icon: FolderOpen,
    color: "text-green-600",
  },
  {
    id: "unattributed",
    label: "Unattributed",
    icon: AlertCircle,
    color: "text-red-500",
  },
  {
    id: "recent-uploads",
    label: "Recent Uploads",
    icon: Upload,
    color: "text-purple-600",
  },
];

function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center justify-between px-2 pt-4 pb-1">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{children}</span>
      {action}
    </div>
  );
}

function SidebarItem({ icon: Icon, label, active, onClick, color, count }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left",
        active
          ? "bg-slate-900 text-white"
          : "text-gray-700 hover:bg-gray-100"
      )}
    >
      <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-white" : (color || "text-gray-400"))} />
      <span className="flex-1 leading-snug">{label}</span>
      {count != null && (
        <span className={cn("text-xs px-1.5 py-0.5 rounded-full", active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500")}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function DocDriveSidebar({
  folders,
  documents,
  selectedFolderId,
  selectedView,
  selectedTag,
  onSelectFolder,
  onSelectView,
  onSelectTag,
  onAddFolder,
  pinnedCount = 0,
  recentCount = 0,
}) {
  const [showAllTags, setShowAllTags] = useState(false);

  const rootFolders = useMemo(() => folders.filter(f => !f.parent_id), [folders]);

  const topTags = useMemo(() => {
    const counts = {};
    documents.forEach(d => (d.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, showAllTags ? 30 : 10).map(([t]) => t);
  }, [documents, showAllTags]);

  const folderDocCounts = useMemo(() => {
    const counts = {};
    documents.forEach(d => { if (d.folder_id) counts[d.folder_id] = (counts[d.folder_id] || 0) + 1; });
    return counts;
  }, [documents]);

  const getSubtreeCount = (folderId) => {
    const children = folders.filter(f => f.parent_id === folderId);
    const own = folderDocCounts[folderId] || 0;
    return own + children.reduce((s, c) => s + getSubtreeCount(c.id), 0);
  };

  const isActive = (type, value) => {
    if (type === "root") return selectedFolderId === null && !selectedView && !selectedTag;
    if (type === "view") return selectedView === value && !selectedFolderId && !selectedTag;
    if (type === "folder") return selectedFolderId === value && !selectedView && !selectedTag;
    if (type === "tag") return selectedTag === value && !selectedFolderId && !selectedView;
    if (type === "recent") return selectedView === "recent";
    if (type === "pinned") return selectedView === "pinned";
    return false;
  };

  return (
    <div className="w-52 flex-shrink-0 self-start sticky top-6">
      <div className="bg-white rounded-xl border border-gray-100 py-2 px-1 space-y-0.5">

        {/* Quick Access */}
        <SectionLabel>Quick Access</SectionLabel>
        <SidebarItem
          icon={Clock}
          label="Recent"
          active={isActive("recent")}
          onClick={() => onSelectView("recent")}
          color="text-gray-500"
          count={recentCount || undefined}
        />
        <SidebarItem
          icon={Pin}
          label="Pinned"
          active={isActive("pinned")}
          onClick={() => onSelectView("pinned")}
          color="text-amber-500"
          count={pinnedCount || undefined}
        />

        {/* Smart Views */}
        <SectionLabel>Smart Views</SectionLabel>
        {SMART_VIEWS.map(v => (
          <SidebarItem
            key={v.id}
            icon={v.icon}
            label={v.label}
            active={isActive("view", v.id)}
            onClick={() => onSelectView(v.id)}
            color={v.color}
          />
        ))}

        {/* Folders */}
        <SectionLabel action={
          <button onClick={() => onAddFolder(null)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="New root folder">
            <Plus className="w-3 h-3" />
          </button>
        }>Folders</SectionLabel>

        <SidebarItem
          icon={Home}
          label="All Documents"
          active={isActive("root")}
          onClick={() => onSelectFolder(null)}
          color="text-[#C9A96E]"
        />

        {rootFolders.map(f => (
          <SidebarItem
            key={f.id}
            icon={Folder}
            label={f.name}
            active={isActive("folder", f.id)}
            onClick={() => onSelectFolder(f.id)}
            color="text-[#C9A96E]"
            count={getSubtreeCount(f.id) || undefined}
          />
        ))}

        {/* Tags */}
        {topTags.length > 0 && (
          <>
            <SectionLabel>Tags</SectionLabel>
            <div className="px-2 flex flex-wrap gap-1.5 pb-1">
              {topTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => onSelectTag(tag)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border transition-colors",
                    selectedTag === tag
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
            {!showAllTags && (
              <button
                onClick={() => setShowAllTags(true)}
                className="flex items-center gap-1 px-2.5 text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                More tags… <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}