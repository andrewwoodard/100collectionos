import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function FolderModal({ open, onOpenChange, folder, parentId, onSave }) {
  const [name, setName] = useState("");

  useEffect(() => {
    setName(folder?.name || "");
  }, [folder, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), parent_id: folder ? folder.parent_id : parentId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{folder ? "Rename Folder" : "New Folder"}</DialogTitle>
        </DialogHeader>
        <div>
          <Label className="text-xs">Folder Name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Contracts 2024"
            autoFocus
            onKeyDown={e => e.key === "Enter" && handleSave()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            {folder ? "Rename" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}