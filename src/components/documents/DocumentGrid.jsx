import React from "react";
import DocumentCard from "./DocumentCard";
import { useDocSelection } from "./DocSelectionContext";

export default function DocumentGrid({ documents, folders, onDelete, onMove, onDragStart, onPreview, onArchive, onToast }) {
  const { selectAll, clearSelection, count } = useDocSelection();
  const orderedIds = documents.map(d => d.id);
  const allSelected = count === documents.length && documents.length > 0;

  return (
    <div>
      {/* Grid select-all toolbar */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
              allSelected ? "bg-slate-800 border-slate-800" : "bg-white border-gray-300 hover:border-slate-500"
            }`}
            onClick={() => allSelected ? clearSelection() : selectAll(orderedIds)}
          >
            {allSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
          Select all on this page
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {documents.map(doc => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            folders={folders}
            onDelete={onDelete}
            onMove={onMove}
            onDragStart={onDragStart}
            onPreview={onPreview}
            onArchive={onArchive}
            onToast={onToast}
            orderedIds={orderedIds}
          />
        ))}
      </div>
    </div>
  );
}