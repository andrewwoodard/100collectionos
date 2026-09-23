import React from "react";
import { Folder, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function FolderCard({ folder, docCount, subfolderCount, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all group"
    >
      <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
        <Folder className="w-5 h-5 text-[#C9A96E]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm leading-snug">{folder.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {subfolderCount > 0 && `${subfolderCount} folder${subfolderCount !== 1 ? "s" : ""}, `}
          {docCount} doc{docCount !== 1 ? "s" : ""}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
    </div>
  );
}

export default function FolderCards({ folders, allFolders, documents, parentId, onNavigate }) {
  // Only immediate children of parentId
  const subfolders = folders.filter(f => (parentId === null ? !f.parent_id : f.parent_id === parentId));

  if (subfolders.length === 0) return null;

  const getSubtreeCount = (folderId) => {
    const children = allFolders.filter(f => f.parent_id === folderId);
    const own = documents.filter(d => d.folder_id === folderId).length;
    return own + children.reduce((s, c) => s + getSubtreeCount(c.id), 0);
  };

  const getSubfolderCount = (folderId) => allFolders.filter(f => f.parent_id === folderId).length;

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Folders</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {subfolders.map(f => (
          <FolderCard
            key={f.id}
            folder={f}
            docCount={getSubtreeCount(f.id)}
            subfolderCount={getSubfolderCount(f.id)}
            onClick={() => onNavigate(f.id)}
          />
        ))}
      </div>
    </div>
  );
}