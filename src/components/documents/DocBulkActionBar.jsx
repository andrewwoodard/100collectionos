import React, { useState } from "react";
import { X, FolderInput, Tag, UserCheck, Home, Eye, Archive, Trash2, Download, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocSelection } from "./DocSelectionContext";
import DocBulkMoveModal from "./DocBulkMoveModal";
import DocBulkTagModal from "./DocBulkTagModal";
import DocBulkPartnerModal from "./DocBulkPartnerModal";
import DocBulkStatusModal from "./DocBulkStatusModal";
import DocBulkVisibilityModal from "./DocBulkVisibilityModal";
import DocBulkDeleteModal from "./DocBulkDeleteModal";

export default function DocBulkActionBar({
  selectedDocs,
  folders,
  partners,
  properties,
  onBulkUpdate,
  onBulkDelete,
  onExportCSV,
}) {
  const { clearSelection, count } = useDocSelection();
  const [modal, setModal] = useState(null); // 'move' | 'tag_add' | 'tag_remove' | 'partner' | 'property' | 'status' | 'visibility' | 'delete'
  const [isWorking, setIsWorking] = useState(false);

  if (count === 0) return null;

  const handleAction = async (action, payload) => {
    setIsWorking(true);
    setModal(null);
    await onBulkUpdate(action, selectedDocs, payload);
    setIsWorking(false);
  };

  const handleDelete = async (hard) => {
    setIsWorking(true);
    setModal(null);
    await onBulkDelete(selectedDocs, hard);
    setIsWorking(false);
  };

  return (
    <>
      <div className="sticky top-0 z-20 bg-slate-800 text-white rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap shadow-lg">
        <div className="flex items-center gap-2 mr-auto">
          {isWorking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="text-sm font-medium">{count} selected</span>
          )}
          <button
            onClick={clearSelection}
            className="text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <BulkBtn icon={FolderInput} label="Move" onClick={() => setModal("move")} disabled={isWorking} />
          <BulkBtn icon={Tag} label="Add Tags" onClick={() => setModal("tag_add")} disabled={isWorking} />
          <BulkBtn icon={Tag} label="Remove Tags" onClick={() => setModal("tag_remove")} disabled={isWorking} />
          <BulkBtn icon={UserCheck} label="Set Partner" onClick={() => setModal("partner")} disabled={isWorking} />
          <BulkBtn icon={Home} label="Set Property" onClick={() => setModal("property")} disabled={isWorking} />
          <BulkBtn icon={ChevronDown} label="Status" onClick={() => setModal("status")} disabled={isWorking} />
          <BulkBtn icon={Eye} label="Visibility" onClick={() => setModal("visibility")} disabled={isWorking} />
          <BulkBtn icon={Archive} label="Archive" onClick={() => handleAction("archive", {})} disabled={isWorking} variant="amber" />
          <BulkBtn icon={Download} label="Export CSV" onClick={onExportCSV} disabled={isWorking} />
          <BulkBtn icon={Trash2} label="Delete" onClick={() => setModal("delete")} disabled={isWorking} variant="red" />
        </div>
      </div>

      <DocBulkMoveModal
        open={modal === "move"}
        onClose={() => setModal(null)}
        folders={folders}
        count={count}
        onConfirm={(folderId) => handleAction("move", { folder_id: folderId })}
      />
      <DocBulkTagModal
        open={modal === "tag_add" || modal === "tag_remove"}
        mode={modal === "tag_add" ? "add" : "remove"}
        onClose={() => setModal(null)}
        selectedDocs={selectedDocs}
        onConfirm={(tags) => handleAction(modal === "tag_add" ? "add_tags" : "remove_tags", { tags })}
      />
      <DocBulkPartnerModal
        open={modal === "partner" || modal === "property"}
        mode={modal === "property" ? "property" : "partner"}
        onClose={() => setModal(null)}
        partners={partners}
        properties={properties}
        count={count}
        onConfirm={(payload) => handleAction(modal === "property" ? "set_property" : "set_partner", payload)}
      />
      <DocBulkStatusModal
        open={modal === "status"}
        onClose={() => setModal(null)}
        count={count}
        onConfirm={(status) => handleAction("set_status", { status })}
      />
      <DocBulkVisibilityModal
        open={modal === "visibility"}
        onClose={() => setModal(null)}
        selectedDocs={selectedDocs}
        count={count}
        onConfirm={(visibility) => handleAction("set_visibility", { visibility })}
      />
      <DocBulkDeleteModal
        open={modal === "delete"}
        onClose={() => setModal(null)}
        count={count}
        onConfirm={handleDelete}
      />
    </>
  );
}

function BulkBtn({ icon: Icon, label, onClick, disabled, variant }) {
  const base = "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40";
  const color =
    variant === "red" ? "bg-red-600 hover:bg-red-500 text-white" :
    variant === "amber" ? "bg-amber-600 hover:bg-amber-500 text-white" :
    "bg-slate-700 hover:bg-slate-600 text-slate-100";
  return (
    <button className={`${base} ${color}`} onClick={onClick} disabled={disabled}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}