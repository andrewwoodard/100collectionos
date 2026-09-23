import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export default function DocBulkPartnerModal({ open, mode, onClose, partners, properties, count, onConfirm }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // null = "clear", or { id, name }

  const isProperty = mode === "property";
  const items = isProperty ? properties : partners;
  const nameField = isProperty ? "property_name" : "partner_name";

  const filtered = items.filter(i =>
    (i[nameField] || "").toLowerCase().includes(query.toLowerCase())
  ).slice(0, 30);

  const handleClose = () => { setQuery(""); setSelected(undefined); onClose(); };

  const handleConfirm = () => {
    if (selected === null) {
      // clear
      onConfirm(isProperty ? { property_id: null, property_name: null } : { partner_id: null, partner_name: null });
    } else if (selected) {
      onConfirm(isProperty
        ? { property_id: selected.id, property_name: selected.name }
        : { partner_id: selected.id, partner_name: selected.name }
      );
    }
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set {isProperty ? "property" : "partner"} on {count} doc{count !== 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder={`Search ${isProperty ? "properties" : "partners"}…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <div className="max-h-52 overflow-y-auto space-y-0.5 rounded border border-gray-100 p-1">
          <button
            className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 ${selected === null ? "bg-red-50 text-red-700 font-medium" : "hover:bg-gray-50 text-gray-500"}`}
            onClick={() => setSelected(null)}
          >
            <X className="w-3 h-3" /> Clear {isProperty ? "property" : "partner"}
          </button>
          {filtered.map(item => (
            <button
              key={item.id}
              className={`w-full text-left px-3 py-1.5 rounded text-sm ${selected?.id === item.id ? "bg-slate-800 text-white" : "hover:bg-gray-50 text-gray-700"}`}
              onClick={() => setSelected({ id: item.id, name: item[nameField] })}
            >
              {item[nameField]}
            </button>
          ))}
          {filtered.length === 0 && <p className="text-xs text-gray-400 italic px-3 py-2">No results</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={selected === undefined}
            className="bg-slate-800 hover:bg-slate-700 text-white"
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}