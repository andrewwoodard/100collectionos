import React, { createContext, useContext, useState, useCallback } from "react";

const SelectionContext = createContext(null);

export function DocSelectionProvider({ children, allDocIds = [] }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedId, setLastSelectedId] = useState(null);

  const toggle = useCallback((id, shiftKey, orderedIds) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedId && orderedIds) {
        const a = orderedIds.indexOf(lastSelectedId);
        const b = orderedIds.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
          for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastSelectedId(id);
  }, [lastSelectedId]);

  const selectAll = useCallback((ids) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);
  const count = selectedIds.size;

  return (
    <SelectionContext.Provider value={{ selectedIds, toggle, selectAll, clearSelection, isSelected, count }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useDocSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useDocSelection must be used inside DocSelectionProvider");
  return ctx;
}