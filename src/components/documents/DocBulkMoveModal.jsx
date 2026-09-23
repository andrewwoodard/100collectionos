import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen } from "lucide-react";

function buildTree(folders, parentId = null, depth = 0) {
  return folders
    .filter(f => (f.parent_id || null) === parentId)
    .flatMap(f => [{ ...f, _depth: depth }, ...buildTree(folders, f.id, depth + 1)]);
}

export default function DocBulkMoveModal({ open, onClose, folders, count, onConfirm }) {
  const [selected, setSelected] = useState(null);
  const tree = buildTree(folders);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move {count} document{count !== 1 ? "s" : ""} to folder</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-64 rounded border border-gray-100 p-2">
          <button
            className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 mb-1 ${selected === null ? "bg-slate-800 text-white" : "hover:bg-gray-50 text-gray-700"}`}
            onClick={() => setSelected(null)}
          >
            <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" /> Root (no folder)
          </button>
          {tree.map(f => (
            <button
              key={f.id}
              className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 ${selected === f.id ? "bg-slate-800 text-white" : "hover:bg-gray-50 text-gray-700"}`}
              style={{ paddingLeft: `${12 + f._depth * 16}px` }}
              onClick={() => setSelected(f.id)}
            >
              <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" /> {f.name}
            </button>
          ))}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selected)} className="bg-slate-800 hover:bg-slate-700 text-white">
            Move Here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}