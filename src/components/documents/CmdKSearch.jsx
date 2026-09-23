import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, FileText, Folder, Users, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const RECENT_KEY = "doc_recent_searches";

function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveSearch(q) {
  if (!q.trim()) return;
  const prev = getRecentSearches().filter(s => s !== q);
  localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, 5)));
}

function typeLabel(doc) {
  if (doc.drive_file_id) return "Drive";
  return (doc.doc_type || "doc").replace(/_/g, " ");
}

function FolderPath({ folderId, folders }) {
  if (!folderId) return null;
  const parts = [];
  let cur = folderId;
  let guard = 0;
  while (cur && guard++ < 10) {
    const f = folders.find(x => x.id === cur);
    if (!f) break;
    parts.unshift(f.name);
    cur = f.parent_id;
  }
  const path = parts.join(" › ");
  return <span className="text-xs text-gray-400 truncate">{path}</span>;
}

export default function CmdKSearch({ open, onClose, documents, folders, onOpenDoc, onNavigateFolder }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const recentSearches = useMemo(() => getRecentSearches(), [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const results = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    if (!q) return { docs: [], folderResults: [] };

    const scoredDocs = documents.map(d => {
      let score = 0;
      if (d.title?.toLowerCase() === q) score = 10;
      else if (d.title?.toLowerCase().startsWith(q)) score = 7;
      else if (d.title?.toLowerCase().includes(q)) score = 5;
      if ((d.tags || []).some(t => t.toLowerCase().includes(q))) score = Math.max(score, 3);
      if (d.partner_name?.toLowerCase().includes(q)) score = Math.max(score, 2);
      if (d.property_name?.toLowerCase().includes(q)) score = Math.max(score, 2);
      if (d.doc_type?.toLowerCase().replace(/_/g, " ").includes(q)) score = Math.max(score, 1);
      if (d.notes?.toLowerCase().includes(q)) score = Math.max(score, 1);
      return { doc: d, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(x => x.doc);

    const folderResults = folders.filter(f => f.name?.toLowerCase().includes(q)).slice(0, 4);

    return { docs: scoredDocs, folderResults };
  }, [debouncedQuery, documents, folders]);

  const flatItems = useMemo(() => [
    ...results.docs.map(d => ({ type: "doc", item: d })),
    ...results.folderResults.map(f => ({ type: "folder", item: f })),
  ], [results]);

  useEffect(() => { setCursor(0); }, [debouncedQuery]);

  const handleKey = useCallback((e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, flatItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === "Enter") {
      const sel = flatItems[cursor];
      if (!sel) return;
      saveSearch(query);
      if (sel.type === "doc") onOpenDoc(sel.item);
      else onNavigateFolder(sel.item.id);
      onClose();
    }
  }, [flatItems, cursor, query, onClose, onOpenDoc, onNavigateFolder]);

  if (!open) return null;

  const hasResults = debouncedQuery && (results.docs.length > 0 || results.folderResults.length > 0);
  const noResults = debouncedQuery && results.docs.length === 0 && results.folderResults.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[620px] mx-4 overflow-hidden border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search documents, folders, partners…"
            className="flex-1 text-base bg-transparent outline-none text-gray-900 placeholder-gray-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-gray-300 hover:text-gray-500">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto">
          {!debouncedQuery && (
            <div className="px-4 py-3 space-y-3">
              {recentSearches.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Recent searches</p>
                  {recentSearches.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(s)}
                      className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
                    >
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Quick links</p>
                <div className="flex flex-wrap gap-2">
                  {["recent", "pinned", "recent-uploads"].map(v => (
                    <button key={v} onClick={() => { onClose(); }} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 capitalize">
                      {v.replace(/-/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {noResults && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              No results for <span className="font-medium text-gray-600">"{debouncedQuery}"</span>. Try a different search.
            </div>
          )}

          {hasResults && (
            <div className="py-1">
              {results.docs.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 pt-2 pb-1">Documents</p>
                  {results.docs.map((doc, i) => {
                    const idx = i;
                    return (
                      <button
                        key={doc.id}
                        onClick={() => { saveSearch(query); onOpenDoc(doc); onClose(); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          cursor === idx ? "bg-slate-50" : "hover:bg-gray-50"
                        )}
                      >
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400 capitalize">{typeLabel(doc)}</span>
                            {doc.partner_name && <span className="text-xs text-gray-400">· {doc.partner_name}</span>}
                            <FolderPath folderId={doc.folder_id} folders={folders} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {results.folderResults.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 pt-3 pb-1">Folders</p>
                  {results.folderResults.map((f, i) => {
                    const idx = results.docs.length + i;
                    return (
                      <button
                        key={f.id}
                        onClick={() => { onNavigateFolder(f.id); onClose(); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          cursor === idx ? "bg-slate-50" : "hover:bg-gray-50"
                        )}
                      >
                        <Folder className="w-4 h-4 text-[#C9A96E] flex-shrink-0" />
                        <span className="text-sm text-gray-900">{f.name}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
          <span><kbd className="border border-gray-200 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-gray-200 rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-gray-200 rounded px-1">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}