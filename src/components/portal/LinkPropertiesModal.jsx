import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { X, Search, CheckSquare, Square, Link2, Loader2, Edit2 } from "lucide-react";

export default function LinkPropertiesModal({ partner, onClose, onEditProperty }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // All properties not yet linked to this partner
  const { data: allProperties = [], isLoading } = useQuery({
    queryKey: ["all-properties-for-link"],
    queryFn: () => fetchAllProperties(),
  });

  const isLinkedToPartner = (p) =>
    (partner.id && p.partner_id === partner.id) ||
    (partner.email && p.partner_email === partner.email);

  const unlinked = allProperties.filter(p => {
    const notLinked = !isLinkedToPartner(p);
    const matchesSearch = !search ||
      p.property_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.partner_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.market?.toLowerCase().includes(search.toLowerCase());
    return notLinked && matchesSearch;
  });

  const alreadyLinked = allProperties.filter(p => isLinkedToPartner(p));

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleLink = async () => {
    setSaving(true);
    await Promise.all(
      [...selected].map(id =>
        base44.entities.Property.update(id, {
          ...(partner.id && { partner_id: partner.id }),
          ...(partner.name && { partner_name: partner.name }),
          ...(partner.email && { partner_email: partner.email }),
        })
      )
    );
    setSaving(false);
    setDone(true);
    queryClient.invalidateQueries({ queryKey: ["all-properties-for-link"] });
    queryClient.invalidateQueries({ queryKey: ["all-submissions-partners"] });
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-[#0D1B2A]">Link Properties</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assigning to <span className="font-medium text-[#C9A96E]">{partner.name}</span>
              {alreadyLinked.length > 0 && <> · {alreadyLinked.length} already linked</>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search properties by name, partner, or market…"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading properties…
            </div>
          ) : unlinked.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">No unlinked properties found.</p>
          ) : unlinked.map(p => (
            <div
              key={p.id}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                selected.has(p.id)
                  ? "border-[#C9A96E] bg-[#C9A96E]/5"
                  : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
              }`}
            >
              <button
                onClick={() => toggle(p.id)}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                {selected.has(p.id)
                  ? <CheckSquare className="w-4 h-4 text-[#C9A96E] shrink-0" />
                  : <Square className="w-4 h-4 text-slate-300 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-[#0D1B2A] truncate">{p.property_name}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {[p.partner_name, p.market, p.property_type].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                p.status === "active" ? "bg-emerald-50 text-emerald-700" :
                p.status === "paused" ? "bg-amber-50 text-amber-700" :
                "bg-slate-100 text-slate-500"
              }`}>{p.status}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditProperty?.(p);
                }}
                className="text-slate-400 hover:text-[#C9A96E] p-1 shrink-0"
                title="Edit property details"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <span className="text-xs text-slate-500">
            {selected.size > 0 ? `${selected.size} selected` : "Select properties to link"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleLink}
              disabled={selected.size === 0 || saving || done}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0D1B2A] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#1a2f47] transition-colors"
            >
              {done ? "Linked!" : saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Linking…</> : <><Link2 className="w-3 h-3" /> Link {selected.size > 0 ? selected.size : ""} Properties</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}