import React, { useState } from "react";
import { Ban, ChevronUp, ChevronDown, MoreHorizontal, ExternalLink, Eye, FolderInput, Archive, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import StatusBadge from "../shared/StatusBadge";
import { useDocSelection } from "./DocSelectionContext";

function uploaderDisplay(uploaded_by) {
  if (!uploaded_by) return null;
  if (uploaded_by.includes("@")) return uploaded_by.split("@")[0];
  return uploaded_by;
}

const COLUMNS = [
  { key: "title", label: "Name" },
  { key: "doc_type", label: "Type" },
  { key: "partner_name", label: "Partner" },
  { key: "status", label: "Status" },
  { key: "updated_date", label: "Modified" },
  { key: "created_date", label: "Uploaded" },
  { key: "uploaded_by", label: "Owner" },
];

export default function DocumentListView({ documents, folders, onDelete, onMove, onPreview, onArchive, onToast, externalSort, externalDir, onExternalSortChange }) {
  const { isSelected, toggle, selectAll, clearSelection, count } = useDocSelection();
  const [internalSortKey, setInternalSortKey] = useState("updated_date");
  const [internalSortDir, setInternalSortDir] = useState("desc");

  const sortKey = externalSort || internalSortKey;
  const sortDir = externalSort ? externalDir : internalSortDir;

  const orderedIds = documents.map(d => d.id);
  const allSelected = count === documents.length && documents.length > 0;

  const handleHeaderClick = (key) => {
    if (onExternalSortChange) {
      onExternalSortChange(key, sortKey === key && sortDir === "asc" ? "desc" : "asc");
    } else {
      if (sortKey === key) setInternalSortDir(d => d === "asc" ? "desc" : "asc");
      else { setInternalSortKey(key); setInternalSortDir("desc"); }
    }
  };

  const sorted = [...documents].sort((a, b) => {
    let av = a[sortKey] || "", bv = b[sortKey] || "";
    if (sortKey === "updated_date" || sortKey === "created_date") {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    } else {
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleRowClick = (doc, e) => {
    if (e.target.closest("[data-radix-dropdown-menu-trigger]") || e.target.closest("[data-radix-popper-content-wrapper]")) return;
    if (e.target.closest("[data-checkbox]")) return;
    if (count > 0) { toggle(doc.id, e.shiftKey, orderedIds); return; }
    if (onPreview) onPreview(doc);
    else if (doc.file_url || doc.drive_file_url) window.open(doc.file_url || doc.drive_file_url, "_blank");
    else if (doc.google_sheet_url) window.open(doc.google_sheet_url, "_blank");
    else onToast?.("No file linked yet");
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-gray-300 ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-gray-600 ml-1" />
      : <ChevronDown className="w-3 h-3 text-gray-600 ml-1" />;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {/* Select-all checkbox */}
              <th className="w-10 px-3 py-2.5">
                <div
                  data-checkbox
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                    allSelected ? "bg-slate-800 border-slate-800" : "bg-white border-gray-300 hover:border-slate-500"
                  }`}
                  onClick={() => allSelected ? clearSelection() : selectAll(orderedIds)}
                >
                  {allSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleHeaderClick(col.key)}
                  className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
                >
                  <span className="flex items-center">
                    {col.label} <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map(doc => {
              const selected = isSelected(doc.id);
              const isSheet = doc.doc_type === "google_sheet" || !!doc.google_sheet_id;
              const uploader = uploaderDisplay(doc.uploaded_by);
              const typeLabel = doc.doc_type ? doc.doc_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "—";
              return (
                <tr
                  key={doc.id}
                  onClick={e => handleRowClick(doc, e)}
                  className={`cursor-pointer group transition-colors ${selected ? "bg-slate-50 ring-1 ring-inset ring-slate-200" : "hover:bg-slate-50"}`}
                >
                  {/* Row checkbox */}
                  <td className="px-3 py-2" data-checkbox onClick={e => { e.stopPropagation(); toggle(doc.id, e.shiftKey, orderedIds); }}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      selected ? "bg-slate-800 border-slate-800" : "bg-white border-gray-300 group-hover:border-slate-400"
                    }`}>
                      {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </td>
                  {/* Name */}
                  <td className="px-3 py-2 max-w-[220px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-medium text-gray-900 truncate block">{doc.title}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{doc.title}</TooltipContent>
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-xs text-gray-500">{typeLabel}</span>
                  </td>
                  <td className="px-3 py-2">
                    {doc.partner_name ? (
                      <span className="text-xs text-gray-600 truncate block max-w-[140px]">{doc.partner_name}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        <Ban className="w-3 h-3" /> Unattributed
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={doc.status} /></td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400">
                    {doc.updated_date ? format(new Date(doc.updated_date), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400">
                    {doc.created_date ? format(new Date(doc.created_date), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                    {uploader || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild data-radix-dropdown-menu-trigger>
                        <button onClick={e => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-opacity">
                          <MoreHorizontal className="w-4 h-4 text-gray-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
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
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove(doc.id, null); }}>📁 Root</DropdownMenuItem>
                            {folders.map(f => (
                              <DropdownMenuItem key={f.id} onClick={(e) => { e.stopPropagation(); onMove(doc.id, f.id); }}>📁 {f.name}</DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(doc); }}><Archive className="w-3.5 h-3.5 mr-2" /> Archive</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}><Trash2 className="w-3.5 h-3.5 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}