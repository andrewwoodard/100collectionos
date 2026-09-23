import React, { useMemo } from "react";
import {
  Clock, Pin, Image, CheckCircle2, XCircle, AlertCircle, Folder, Home, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

const SMART_VIEWS = [
  { id: "recent", label: "Recent", icon: Clock, color: "text-gray-500" },
  { id: "pinned", label: "Approved", icon: CheckCircle2, color: "text-green-600" },
  { id: "pending", label: "Pending Review", icon: AlertCircle, color: "text-amber-600" },
  { id: "rejected", label: "Rejected", icon: XCircle, color: "text-red-500" },
  { id: "unattributed", label: "Unattributed", icon: AlertCircle, color: "text-red-400" },
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
        active ? "bg-slate-900 text-white" : "text-gray-700 hover:bg-gray-100"
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

export default function MediaDriveSidebar({
  folders,
  assets,
  selectedFolderId,
  selectedView,
  onSelectFolder,
  onSelectView,
  onAddFolder,
}) {
  const rootFolders = useMemo(() => folders.filter(f => !f.parent_id), [folders]);

  const folderCounts = useMemo(() => {
    const counts = {};
    assets.forEach(a => { if (a.folder_id) counts[a.folder_id] = (counts[a.folder_id] || 0) + 1; });
    return counts;
  }, [assets]);

  const getSubtreeCount = (folderId) => {
    const children = folders.filter(f => f.parent_id === folderId);
    const own = folderCounts[folderId] || 0;
    return own + children.reduce((s, c) => s + getSubtreeCount(c.id), 0);
  };

  const isActive = (type, value) => {
    if (type === "root") return selectedFolderId === null && !selectedView;
    if (type === "view") return selectedView === value;
    if (type === "folder") return selectedFolderId === value && !selectedView;
    return false;
  };

  return (
    <div className="w-52 flex-shrink-0 self-start sticky top-6">
      <div className="bg-white rounded-xl border border-gray-100 py-2 px-1 space-y-0.5">
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

        <SectionLabel action={
          <button onClick={() => onAddFolder(null)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="New folder">
            <Plus className="w-3 h-3" />
          </button>
        }>Folders</SectionLabel>

        <SidebarItem
          icon={Home}
          label="All Media"
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
      </div>
    </div>
  );
}