import React from "react";
import { FileText, Sheet, Ban } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, FolderInput, Archive, ExternalLink, Eye } from "lucide-react";
import StatusBadge from "../shared/StatusBadge";
import { format } from "date-fns";
import { useDocSelection } from "./DocSelectionContext";

const TYPE_COLORS = {
  contract: "bg-blue-50 text-blue-700",
  addendum: "bg-purple-50 text-purple-700",
  tax_doc: "bg-red-50 text-red-700",
  onboarding_form: "bg-green-50 text-green-700",
  invoice: "bg-orange-50 text-orange-700",
  brand_guidelines: "bg-pink-50 text-pink-700",
  photography_release: "bg-teal-50 text-teal-700",
  miscellaneous: "bg-gray-50 text-gray-700",
};

function uploaderDisplay(uploaded_by) {
  if (!uploaded_by) return null;
  if (uploaded_by.includes("@")) return uploaded_by.split("@")[0];
  return uploaded_by;
}

export default function DocumentCard({ doc, folders, onDelete, onMove, onDragStart, onPreview, onArchive, onToast, orderedIds }) {
  const { isSelected, toggle, count } = useDocSelection();
  const selected = isSelected(doc.id);
  const anySelected = count > 0;
  const isSheet = doc.doc_type === "google_sheet" || !!doc.google_sheet_id;
  const uploader = uploaderDisplay(doc.uploaded_by);

  const handleCardClick = (e) => {
    if (e.target.closest("[data-radix-dropdown-menu-trigger]") || e.target.closest("[data-radix-popper-content-wrapper]")) return;
    if (e.target.closest("[data-checkbox]")) return;
    // If any selected, clicking toggles selection
    if (anySelected) { toggle(doc.id, e.shiftKey, orderedIds); return; }
    if (onPreview) onPreview(doc);
    else if (doc.file_url || doc.drive_file_url) window.open(doc.file_url || doc.drive_file_url, "_blank");
    else if (doc.google_sheet_url) window.open(doc.google_sheet_url, "_blank");
    else onToast?.("No file linked yet");
  };

  const handleCheck = (e) => {
    e.stopPropagation();
    toggle(doc.id, e.shiftKey, orderedIds);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        draggable={!anySelected}
        onDragStart={() => !anySelected && onDragStart(doc.id)}
        onClick={handleCardClick}
        className={`relative bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer group
          ${selected ? "ring-2 ring-slate-800 border-slate-300" : isSheet ? "border-green-100 hover:border-green-300" : "border-gray-100 hover:border-slate-300"}`}
      >
        {/* Checkbox — visible on hover or when any selected */}
        <div
          data-checkbox
          className={`absolute top-2.5 left-2.5 z-10 transition-opacity ${anySelected || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          onClick={handleCheck}
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            selected ? "bg-slate-800 border-slate-800" : "bg-white border-gray-300 hover:border-slate-500"
          }`}>
            {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
        </div>

        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${isSheet ? "bg-green-50 text-green-700" : TYPE_COLORS[doc.doc_type] || "bg-gray-50 text-gray-700"}`}>
            {isSheet ? <Sheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild data-radix-dropdown-menu-trigger>
              <button
                onClick={e => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-opacity"
              >
                <MoreHorizontal className="w-4 h-4 text-gray-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPreview?.(doc); }}>
                <Eye className="w-3.5 h-3.5 mr-2" /> Preview
              </DropdownMenuItem>
              {(doc.file_url || doc.drive_file_url || doc.google_sheet_url) && (
                <DropdownMenuItem asChild>
                  <a href={doc.drive_file_url || doc.file_url || doc.google_sheet_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    <ExternalLink className="w-3.5 h-3.5 mr-2" /> Open in Drive
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><FolderInput className="w-3.5 h-3.5 mr-2" /> Move to Folder</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-48 overflow-y-auto">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove(doc.id, null); }}>📁 Root (no folder)</DropdownMenuItem>
                  {folders.map(f => (
                    <DropdownMenuItem key={f.id} onClick={(e) => { e.stopPropagation(); onMove(doc.id, f.id); }}>📁 {f.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(doc); }}>
                <Archive className="w-3.5 h-3.5 mr-2" /> Archive
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2 leading-snug">
              {doc.title}
              {isSheet && <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium inline-block align-middle">Sheets</span>}
            </p>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">{doc.title}</TooltipContent>
        </Tooltip>

        {doc.partner_name ? (
          <p className="text-xs text-gray-400 mb-2 truncate">{doc.partner_name}</p>
        ) : (
          <div className="flex items-center gap-1 mb-2">
            <Ban className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Unattributed</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <StatusBadge status={doc.status} />
          <div className="text-right">
            <span className="text-xs text-gray-400 block">
              {doc.updated_date ? format(new Date(doc.updated_date), "MMM d") : ""}
            </span>
            {uploader && (
              <span className="text-[10px] text-gray-400 block">by {uploader}</span>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}