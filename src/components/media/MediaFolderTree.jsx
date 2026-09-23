import React, { useState } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronDown, Plus, MoreHorizontal, Edit2, Trash2, FolderPlus, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function FolderNode({ folder, allFolders, selectedFolderId, onSelect, onRename, onDelete, onAddSubfolder, dragOverId, onDragOver, onDrop, onDragStart, draggingFolderId, level = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const children = allFolders.filter(f => f.parent_id === folder.id);
  const isSelected = selectedFolderId === folder.id;
  const isDragOver = dragOverId === folder.id;
  const isDragging = draggingFolderId === folder.id;

  // Prevent dropping into self or own descendants
  const isDescendant = (ancestorId, targetId) => {
    if (ancestorId === targetId) return true;
    return allFolders.filter(f => f.parent_id === ancestorId).some(c => isDescendant(c.id, targetId));
  };
  const canDrop = !draggingFolderId || (draggingFolderId !== folder.id && !isDescendant(draggingFolderId, folder.id));

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("folderId", folder.id); onDragStart(folder.id); }}
        onDragEnd={() => onDragStart(null)}
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing text-sm transition-colors",
          isSelected ? "bg-[#0F172A] text-white" : "hover:bg-gray-100 text-gray-700",
          isDragOver && canDrop && "ring-2 ring-[#C9A96E] bg-amber-50 text-gray-700",
          isDragging && "opacity-40"
        )}
        style={{ paddingLeft: level > 0 ? undefined : undefined }}
        onClick={() => onSelect(folder.id)}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (canDrop) onDragOver(folder.id); }}
        onDragLeave={(e) => e.stopPropagation()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const draggedFolderId = e.dataTransfer.getData("folderId");
          onDrop(folder.id, draggedFolderId || null);
        }}
      >
        <button onClick={e => { e.stopPropagation(); setExpanded(!expanded); }} className="flex-shrink-0">
          {children.length > 0
            ? expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            : <span className="w-3.5" />}
        </button>
        {isSelected ? <FolderOpen className="w-4 h-4 flex-shrink-0 text-[#C9A96E]" /> : <Folder className="w-4 h-4 flex-shrink-0 text-gray-400" />}
        <span className="flex-1 truncate font-medium">{folder.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <button className={cn("opacity-0 group-hover:opacity-100 p-0.5 rounded", isSelected ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-gray-600")}>
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onAddSubfolder(folder.id)}><FolderPlus className="w-4 h-4 mr-2" />Add subfolder</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(folder)}><Edit2 className="w-4 h-4 mr-2" />Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(folder.id)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded && children.length > 0 && (
        <div className="ml-4 border-l border-gray-100 pl-1 mt-0.5 space-y-0.5">
          {children.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onAddSubfolder={onAddSubfolder}
              dragOverId={dragOverId}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragStart={onDragStart}
              draggingFolderId={draggingFolderId}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MediaFolderTree({ folders, selectedFolderId, onSelect, onRename, onDelete, onAddSubfolder, onCreateRoot, dragOverId, onDragOver, onDrop, onFolderMove }) {
  const rootFolders = folders.filter(f => !f.parent_id);
  const [draggingFolderId, setDraggingFolderId] = useState(null);

  const handleDrop = (targetFolderId, draggedFolderId) => {
    onDragOver(null);
    if (draggedFolderId) {
      onFolderMove(draggedFolderId, targetFolderId);
    } else {
      onDrop(targetFolderId);
    }
  };

  return (
    <div className="space-y-0.5">
      {/* All Media — drop zone to move to root */}
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm font-medium transition-colors",
          !selectedFolderId ? "bg-[#0F172A] text-white" : "hover:bg-gray-100 text-gray-700",
          dragOverId === "root" && "ring-2 ring-[#C9A96E] bg-amber-50 text-gray-700"
        )}
        onClick={() => onSelect(null)}
        onDragOver={(e) => { e.preventDefault(); onDragOver("root"); }}
        onDragLeave={() => onDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          const draggedFolderId = e.dataTransfer.getData("folderId");
          if (draggedFolderId) {
            onFolderMove(draggedFolderId, null);
          } else {
            onDrop(null);
          }
          onDragOver(null);
          setDraggingFolderId(null);
        }}
      >
        <Image className="w-4 h-4" />
        All Media
      </div>
      <div className="space-y-0.5">
        {rootFolders.map(folder => (
          <FolderNode
            key={folder.id}
            folder={folder}
            allFolders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            onAddSubfolder={onAddSubfolder}
            dragOverId={dragOverId}
            onDragOver={onDragOver}
            onDrop={handleDrop}
            onDragStart={setDraggingFolderId}
            draggingFolderId={draggingFolderId}
          />
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onCreateRoot} className="w-full justify-start text-gray-500 hover:text-gray-700 text-xs mt-1">
        <Plus className="w-3.5 h-3.5 mr-1.5" /> New Folder
      </Button>
    </div>
  );
}