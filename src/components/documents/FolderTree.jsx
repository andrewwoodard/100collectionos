import React, { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, MoreHorizontal, Trash2, Edit2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function FolderNode({ folder, folders, selectedId, onSelect, onAddChild, onRename, onDelete, level = 0, dragOverId, onDragOver, onDrop, onDragStart, draggingFolderId }) {
  const [open, setOpen] = useState(true);
  const children = folders.filter(f => f.parent_id === folder.id);
  const isSelected = selectedId === folder.id;
  const isDragOver = dragOverId === folder.id;
  const isDragging = draggingFolderId === folder.id;

  // Prevent dropping a folder into itself or its own descendants
  const isDescendant = (potentialAncestorId, folderId) => {
    if (potentialAncestorId === folderId) return true;
    const children = folders.filter(f => f.parent_id === potentialAncestorId);
    return children.some(c => isDescendant(c.id, folderId));
  };

  const canDrop = !draggingFolderId || (draggingFolderId !== folder.id && !isDescendant(draggingFolderId, folder.id));

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData("folderId", folder.id);
          onDragStart(folder.id);
        }}
        onDragEnd={() => onDragStart(null)}
        className={cn(
          "group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing text-sm transition-colors",
          isSelected ? "bg-[#0F172A] text-white" : "hover:bg-gray-100 text-gray-700",
          isDragOver && canDrop && !isSelected && "bg-blue-50 border border-blue-200",
          isDragging && "opacity-40"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(folder.id)}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (canDrop) onDragOver(folder.id); }}
        onDragLeave={(e) => { e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const draggedFolderId = e.dataTransfer.getData("folderId");
          if (draggedFolderId && canDrop) {
            onDrop(folder.id, draggedFolderId);
          } else if (!draggedFolderId) {
            // document drop
            onDrop(folder.id, null);
          }
        }}
      >
        <button
          className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        >
          {children.length > 0 ? (
            open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : <span className="w-3" />}
        </button>
        {isSelected || open ? (
          <FolderOpen className="w-4 h-4 flex-shrink-0 text-[#C9A96E]" />
        ) : (
          <Folder className="w-4 h-4 flex-shrink-0 text-[#C9A96E]" />
        )}
        <span className="flex-1 truncate font-medium">{folder.name}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          <button
            className="p-0.5 hover:bg-black/10 rounded"
            onClick={() => onAddChild(folder.id)}
            title="Add subfolder"
          >
            <Plus className="w-3 h-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-0.5 hover:bg-black/10 rounded">
                <MoreHorizontal className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => onRename(folder)}>
                <Edit2 className="w-3.5 h-3.5 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => onDelete(folder)}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {open && children.map(child => (
        <FolderNode
          key={child.id}
          folder={child}
          folders={folders}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onRename={onRename}
          onDelete={onDelete}
          level={level + 1}
          dragOverId={dragOverId}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragStart={onDragStart}
          draggingFolderId={draggingFolderId}
        />
      ))}
    </div>
  );
}

export default function FolderTree({ folders, selectedId, onSelect, onAddFolder, onRename, onDelete, dragOverId, onDragOver, onDrop, onFolderMove }) {
  const roots = folders.filter(f => !f.parent_id);
  const [draggingFolderId, setDraggingFolderId] = useState(null);

  const handleDrop = (targetFolderId, draggedFolderId) => {
    onDragOver(null);
    if (draggedFolderId) {
      // folder-onto-folder: reparent
      onFolderMove(draggedFolderId, targetFolderId);
    } else {
      // document drop
      onDrop(targetFolderId);
    }
  };

  return (
    <div className="space-y-0.5">
      {/* All Documents root — drop zone to move folder/doc to root */}
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors",
          selectedId === null ? "bg-[#0F172A] text-white" : "hover:bg-gray-100 text-gray-700",
          dragOverId === "root" && "bg-blue-50 border border-blue-200 text-gray-700"
        )}
        onClick={() => onSelect(null)}
        onDragOver={(e) => { e.preventDefault(); onDragOver("root"); }}
        onDragLeave={() => onDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          const draggedFolderId = e.dataTransfer.getData("folderId");
          if (draggedFolderId) {
            onFolderMove(draggedFolderId, null); // move to root
          } else {
            onDrop(null); // move doc to root
          }
          onDragOver(null);
          setDraggingFolderId(null);
        }}
      >
        <Home className="w-4 h-4 flex-shrink-0 text-[#C9A96E]" />
        <span className="font-medium">All Documents</span>
      </div>

      {roots.map(folder => (
        <FolderNode
          key={folder.id}
          folder={folder}
          folders={folders}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddFolder}
          onRename={onRename}
          onDelete={onDelete}
          dragOverId={dragOverId}
          onDragOver={onDragOver}
          onDrop={handleDrop}
          onDragStart={setDraggingFolderId}
          draggingFolderId={draggingFolderId}
        />
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-gray-500 hover:text-gray-700 mt-2 text-xs"
        onClick={() => onAddFolder(null)}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" /> New Folder
      </Button>
    </div>
  );
}