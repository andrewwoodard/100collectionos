import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Plus, Building2, MapPin, Bed, Bath, Users as UsersIcon, EyeOff, Archive, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import PropertyFormModal from "../components/properties/PropertyFormModal";
import AddPropertyWithAiModal from "../components/properties/AddPropertyWithAiModal";
import SyncButton from "../components/shared/SyncButton";
import SyncToSupabaseButton from "../components/shared/SyncToSupabaseButton";
import PropertyFilters from "../components/shared/PropertyFilters";
import ArchiveConfirmModal from "../components/properties/ArchiveConfirmModal";
import { useToast } from "@/components/ui/use-toast";

export default function Properties() {
  const [filters, setFilters] = useState({ search: "", status: "all", partnerId: "all", partnerName: "all", propertyType: "all", onboardingStatus: "all", photoStatus: "all", minBedrooms: "all" });
  const [tab, setTab] = useState("active"); // "active" | "draft" | "archived"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [archiveModal, setArchiveModal] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  // propertiesbase44 (Supabase) is the single source of truth for property info.
  // It is the backbone of the list — properties only in Supabase are visible here.
  const { data: sbProperties = [], isLoading } = useQuery({
    queryKey: ["propertiesbase44"],
    queryFn: async () => {
      const res = await base44.functions.invoke("supabaseProperties", { action: "list", limit: 10000, lite: true });
      return res.data?.properties || [];
    },
  });
  // Base44 Property entities — fetched only for the entity ID (navigation to
  // PropertyDetail) and archive metadata (archived_at, archived_by_user_id).
  const { data: baseProperties = [] } = useQuery({
    queryKey: ["properties-b44"],
    queryFn: () => fetchAllProperties(),
  });
  const b44ByMatchKey = React.useMemo(() => {
    const m = new Map();
    for (const p of baseProperties) {
      const sbId = p.supabase_property_id;
      if (sbId && sbId !== "null" && sbId !== "undefined") m.set(`id:${sbId}`, p);
      const url = p.vrm_url || p.listing_url;
      if (url) m.set(`url:${url}`, p);
    }
    return m;
  }, [baseProperties]);
  const properties = React.useMemo(() => sbProperties.map(sb => {
    const match = (sb.id && b44ByMatchKey.get(`id:${sb.id}`)) ||
      (sb.vrm_url && b44ByMatchKey.get(`url:${sb.vrm_url}`)) ||
      (sb.listing_url && b44ByMatchKey.get(`url:${sb.listing_url}`)) ||
      null;
    return {
      ...sb,
      id: match?.id || sb.id,
      b44_id: match?.id || null,
      b44_created_date: match?.created_date || null,
      // Base44 Property status is authoritative (admin-managed in PropertyDetail);
      // fall back to the Supabase-derived status only when no Base44 entity is linked.
      status: match?.status || sb.status,
      archived_at: match?.archived_at || (match?.status === 'inactive' ? 'inactive' : null) || (sb.status === 'inactive' ? 'inactive' : null),
      archived_by_user_id: match?.archived_by_user_id || null,
      supabase_property_id: sb.id,
    };
  }), [sbProperties, b44ByMatchKey]);

  const { data: partners = [] } = useQuery({
    queryKey: ["base44-partners"],
    queryFn: () => base44.entities.Partner.list('-created_date', 500),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke("supabaseProperties", { action: "create", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.functions.invoke("supabaseProperties", { action: "update", id, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    },
  });

  const handleSave = async (formData) => {
    if (editingProperty) {
      await updateMutation.mutateAsync({ id: editingProperty.supabase_property_id || editingProperty.id, data: formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
    setEditingProperty(null);
  };

  // Tab-based grouping: Active (default) / Draft (most recent) / Archived
  const tabBase = tab === "archived"
    ? properties.filter(p => p.archived_at)
    : properties.filter(p => !p.archived_at);

  const filtered = tabBase.filter(p => {
    const s = filters.search?.toLowerCase();
    const matchesSearch = !s ||
      p.property_name?.toLowerCase().includes(s) ||
      p.market?.toLowerCase().includes(s) ||
      p.address?.toLowerCase().includes(s) ||
      p.partner_name?.toLowerCase().includes(s);
    const matchesTab = tab === "archived" ? true : p.status === tab;
    const matchesPartner = filters.partnerId === "all" ||
      p.partner_id === filters.partnerId ||
      (filters.partnerName !== "all" && p.partner_name === filters.partnerName);
    const matchesType = filters.propertyType === "all" || p.property_type === filters.propertyType;
    const matchesOnboarding = filters.onboardingStatus === "all" || p.onboarding_status === filters.onboardingStatus;
    const matchesPhoto = filters.photoStatus === "all" || p.photography_status === filters.photoStatus;
    const matchesBeds = filters.minBedrooms === "all" || (
      filters.minBedrooms === "6+" ? (p.bedrooms || 0) >= 6 : (p.bedrooms || 0) >= parseInt(filters.minBedrooms)
    );
    return matchesSearch && matchesTab && matchesPartner && matchesType && matchesOnboarding && matchesPhoto && matchesBeds;
  }).sort((a, b) => {
    // Newest first: use the most recent of the Supabase created_at and the
    // Base44 entity created_date (Supabase's is null for many imported rows).
    const sortDate = (p) => Math.max(
      new Date(p.created_date || 0).getTime(),
      new Date(p.b44_created_date || 0).getTime()
    );
    return sortDate(b) - sortDate(a);
  });

  // Selection helpers
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectedProperties = filtered.filter(p => selectedIds.has(p.id));
  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const selectAll = () => {
    if (allSelected) clearSelection();
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  // Archive / Restore
  const handleArchiveRestore = async (props, isRestore) => {
    const now = new Date().toISOString();
    const user = await base44.auth.me();
    await Promise.all(props.map(async (p) => {
      const sbTarget = p.supabase_property_id;
      if (sbTarget && sbTarget !== "null" && sbTarget !== "undefined") {
        await base44.functions.invoke("supabaseProperties", {
          action: "update",
          id: sbTarget,
          data: { status: isRestore ? "active" : "inactive" },
        }).catch(() => {});
      }
      if (p.b44_id) {
        await base44.entities.Property.update(p.b44_id, isRestore
          ? { status: "active", archived_at: null, archived_by_user_id: null }
          : { status: "inactive", archived_at: now, archived_by_user_id: user.id }
        );
      }
    }));
    queryClient.invalidateQueries({ queryKey: ["properties"] });
    queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
    queryClient.invalidateQueries({ queryKey: ["property"] });
    queryClient.invalidateQueries({ queryKey: ["my-linked-properties"] });
    const label = props.length === 1 ? `"${props[0].property_name}"` : `${props.length} properties`;
    toast({ title: `${isRestore ? "Restored" : "Archived"} ${label}` });
    clearSelection();
    setArchiveModal(null);
  };

  const selectedAllArchived = selectedProperties.length > 0 && selectedProperties.every(p => p.archived_at);
  const activeCount = properties.filter(p => !p.archived_at && p.status === 'active').length;
  const draftCount = properties.filter(p => !p.archived_at && p.status === 'draft').length;
  const archivedCount = properties.filter(p => p.archived_at).length;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">All Properties</h2>
          <p className="text-sm text-gray-500">
            Showing {filtered.length} {tab.charAt(0).toUpperCase() + tab.slice(1)} {filtered.length === 1 ? "property" : "properties"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton onSyncComplete={() => queryClient.invalidateQueries({ queryKey: ["properties"] })} />
          <SyncToSupabaseButton onSyncComplete={() => queryClient.invalidateQueries({ queryKey: ["properties"] })} />
          <Button onClick={() => setAiModalOpen(true)} variant="outline" className="border-[#C9A96E] text-[#A68B4B] hover:bg-[#FAF6EE]">
            <Sparkles className="w-4 h-4 mr-1.5" /> Add with AI
          </Button>
          <Button onClick={() => { setEditingProperty(null); setModalOpen(true); }} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            <Plus className="w-4 h-4 mr-1.5" /> Add Property
          </Button>
        </div>
      </div>

      {/* Status tabs: Active (default) / Draft (most recent) / Archived */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[{ id: "active", label: "Active", count: activeCount }, { id: "draft", label: "Draft", count: draftCount }, { id: "archived", label: "Archived", count: archivedCount }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? "text-[#0F172A]" : "text-gray-400 hover:text-gray-600"}`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.id ? "text-[#C9A96E]" : "text-gray-400"}`}>({t.count})</span>
            {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C9A96E]" />}
          </button>
        ))}
      </div>

      <PropertyFilters partners={partners} onChange={setFilters} hideStatusAndArchived />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-slate-800 text-white rounded-xl px-4 py-2.5 animate-fade-up">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={() => setArchiveModal({ properties: selectedProperties, isRestore: selectedAllArchived })}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${selectedAllArchived ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {selectedAllArchived ? <><RotateCcw className="w-4 h-4" /> Restore selected</> : <><Archive className="w-4 h-4" /> Archive selected</>}
          </button>
          <button onClick={clearSelection} className="text-sm text-slate-300 hover:text-white px-2 py-1.5">Cancel</button>
        </div>
      )}

      {/* Select all bar */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={allSelected} onChange={selectAll} className="w-4 h-4 rounded border-gray-300 cursor-pointer" />
          <button onClick={selectAll} className="hover:text-gray-700">
            {allSelected ? `All ${filtered.length} selected` : `Select all (${filtered.length})`}
          </button>
          {selectedIds.size > 0 && (
            <button onClick={clearSelection} className="ml-2 text-gray-400 hover:text-gray-600">Clear selection</button>
          )}
        </div>
      )}

      {filtered.length === 0 && !isLoading ? (
        <EmptyState icon={Building2} title="No properties found" description="Add your first property" actionLabel="Add Property" onAction={() => setModalOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(createPageUrl("PropertyDetail") + `?id=${p.id}`)}
              className={`bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all duration-300 cursor-pointer group relative ${p.archived_at ? "opacity-60" : ""}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onClick={e => e.stopPropagation()}
                onChange={() => toggleSelect(p.id)}
                className="absolute top-3 left-3 w-4 h-4 rounded border-gray-300 cursor-pointer z-10"
              />
              <div className="flex items-start justify-between mb-3 pl-6">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-[#C9A96E] transition-colors">{p.property_name}</h3>
                    {p.archived_at && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                        <Archive className="w-2.5 h-2.5" /> Archived
                      </span>
                    )}
                    {p.portal_visible === false && !p.archived_at && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        <EyeOff className="w-2.5 h-2.5" /> Hidden from portal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{p.partner_name || "No partner"}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              {p.address && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                  <MapPin className="w-3 h-3" /> {p.address}
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {p.bedrooms && <span className="flex items-center gap-1"><Bed className="w-3 h-3" /> {p.bedrooms} BD</span>}
                {p.bathrooms && <span className="flex items-center gap-1"><Bath className="w-3 h-3" /> {p.bathrooms} BA</span>}
                {p.sleeps && <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3" /> Sleeps {p.sleeps}</span>}
                {p.market && <span className="ml-auto text-[#C9A96E]">{p.market}</span>}
              </div>
              {/* Archive / Restore action */}
              <button
                onClick={e => { e.stopPropagation(); setArchiveModal({ properties: [p], isRestore: !!p.archived_at }); }}
                className={`absolute bottom-3 right-3 p-1.5 rounded-lg transition-colors ${p.archived_at ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-300 hover:text-red-500 hover:bg-red-50"}`}
                title={p.archived_at ? "Restore" : "Archive"}
              >
                {p.archived_at ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <PropertyFormModal open={modalOpen} onOpenChange={setModalOpen} property={editingProperty} partners={partners} onSave={handleSave} />
      <AddPropertyWithAiModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        partners={partners}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["properties"] });
          queryClient.invalidateQueries({ queryKey: ["propertiesbase44"] });
        }}
      />

      {archiveModal && (
        <ArchiveConfirmModal
          properties={archiveModal.properties}
          isRestore={archiveModal.isRestore}
          onClose={() => setArchiveModal(null)}
          onConfirm={() => handleArchiveRestore(archiveModal.properties, archiveModal.isRestore)}
        />
      )}
    </div>
  );
}