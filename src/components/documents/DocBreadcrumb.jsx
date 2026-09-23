import React, { useMemo } from "react";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const SMART_VIEW_LABELS = {
  "recent": "Recent",
  "pinned": "Approved",
  "all-contracts": "All Contracts",
  "pending-review": "Pending Review",
  "drive-imported": "Drive Imported",
  "unattributed": "Unattributed",
  "recent-uploads": "Recent Uploads",
  "pending": "Pending Review",
  "rejected": "Rejected",
};

function buildPath(folderId, folders) {
  if (!folderId) return [];
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return [];
  return [...buildPath(folder.parent_id, folders), folder];
}

export default function DocBreadcrumb({
  selectedFolderId,
  selectedView,
  selectedTag,
  folders,
  onSelectFolder,
  onSelectView,
  rootLabel = "Documents",
}) {
  const path = useMemo(() => buildPath(selectedFolderId, folders), [selectedFolderId, folders]);

  const segments = useMemo(() => {
    if (selectedTag) {
      return [
        { label: rootLabel, onClick: () => onSelectFolder(null) },
        { label: `Tag: ${selectedTag}`, onClick: null },
      ];
    }
    if (selectedView) {
      return [
        { label: rootLabel, onClick: () => onSelectFolder(null) },
        { label: SMART_VIEW_LABELS[selectedView] || selectedView, onClick: null },
      ];
    }
    return [
      { label: rootLabel, onClick: path.length > 0 ? () => onSelectFolder(null) : null },
      ...path.map((f, i) => ({
        label: f.name,
        onClick: i < path.length - 1 ? () => onSelectFolder(f.id) : null,
      })),
    ];
  }, [selectedFolderId, selectedView, selectedTag, path]);

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      <Home className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
          {seg.onClick ? (
            <button
              onClick={seg.onClick}
              className="text-gray-500 hover:text-gray-800 transition-colors truncate max-w-[160px]"
              title={seg.label}
            >
              {seg.label}
            </button>
          ) : (
            <span className="font-semibold text-gray-900 truncate max-w-[200px]" title={seg.label}>
              {seg.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}