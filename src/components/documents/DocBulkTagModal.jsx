import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export default function DocBulkTagModal({ open, mode, onClose, selectedDocs, onConfirm }) {
  const [input, setInput] = useState("");
  const [tags, setTags] = useState([]);

  // For remove mode: only show tags present on selected docs
  const availableTags = useMemo(() => {
    if (mode !== "remove") return [];
    const set = new Set();
    selectedDocs.forEach(d => (d.tags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }, [selectedDocs, mode]);

  const addTag = (t) => {
    const trimmed = t.trim();
    if (trimmed && !tags.includes(trimmed)) setTags(prev => [...prev, trimmed]);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(input); }
  };

  const handleClose = () => { setTags([]); setInput(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add tags to" : "Remove tags from"} {selectedDocs.length} doc{selectedDocs.length !== 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>

        {mode === "remove" ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Select tags to remove from all selected documents:</p>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map(t => (
                <button
                  key={t}
                  onClick={() => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    tags.includes(t) ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
                  }`}
                >
                  {t}
                </button>
              ))}
              {availableTags.length === 0 && <p className="text-xs text-gray-400 italic">No tags on selected docs.</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 min-h-[32px]">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-full text-xs text-gray-700 font-medium">
                  {t}
                  <button onClick={() => setTags(prev => prev.filter(x => x !== t))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <Input
              placeholder="Type a tag and press Enter…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => input.trim() && addTag(input)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={() => { onConfirm(tags); handleClose(); }}
            disabled={tags.length === 0}
            className="bg-slate-800 hover:bg-slate-700 text-white"
          >
            {mode === "add" ? "Add Tags" : "Remove Tags"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}