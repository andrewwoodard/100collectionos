import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import PortalStatusBadge from "../../components/portal/PortalStatusBadge";
import SubmissionForm from "../../components/portal/SubmissionForm";
import PropertyEditModal from "../../components/portal/PropertyEditModal";
import {
  Home, PlusCircle, Search, Pencil, Trash2, Copy, ExternalLink,
  BedDouble, Bath, Users, ChevronRight, AlertCircle, Building2, Clock, MessageSquare
} from "lucide-react";
import PropertyThumbnail from "@/components/properties/PropertyThumbnail";
import { usePortalPartnerRollup } from "@/hooks/usePortalPartnerRollup";
import { useCurrentUser } from "@/lib/useCurrentUser";

const STATUS_FILTERS = ["all", "draft", "submitted", "under_review", "approved", "needs_revision", "rejected", "licensed", "active"];

export default function MyProperties() {
  const { user } = useCurrentUser();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingSub, setEditingSub] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [editingProperty, setEditingProperty] = useState(null);
  const [editModalProperty, setEditModalProperty] = useState(null);
  const qc = useQueryClient();

  // Rollup: find parent + sub-brand partners for this user
  const { primaryPartner, primaryPartnerId, visiblePartnerNames, partnerNameToId } = usePortalPartnerRollup(user);

  // Track which portfolio properties have a pending edit submission
  const { data: pendingEdits = [] } = useQuery({
    queryKey: ["my-pending-edits", user?.email],
    queryFn: () => base44.entities.PropertySubmission.filter({ partner_email: user.email, submission_type: "edit" }),
    enabled: !!user?.email,
  });
  // Track which portfolio properties have a pending termination request
  const { data: pendingTerminations = [] } = useQuery({
    queryKey: ["my-pending-terminations", user?.email],
    queryFn: () => base44.entities.PropertySubmission.filter({ partner_email: user.email, submission_type: "termination_request" }),
    enabled: !!user?.email,
  });
  // Map source_property_id → submission status for badge display
  const pendingEditMap = React.useMemo(() => {
    const m = {};
    pendingEdits.forEach(e => {
      if (["submitted", "draft", "needs_revision", "under_review"].includes(e.status)) {
        if (e.source_property_id) m[e.source_property_id] = e.status;
        if (e.supabase_property_id) m[e.supabase_property_id] = e.status;
      }
    });
    return m;
  }, [pendingEdits]);
  const pendingTermMap = useMemo(() => {
    const m = {};
    pendingTerminations.forEach(t => {
      if (["submitted", "under_review"].includes(t.status)) {
        if (t.source_property_id) m[t.source_property_id] = true;
        if (t.supabase_property_id) m[t.supabase_property_id] = true;
      }
    });
    return m;
  }, [pendingTerminations]);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["my-submissions", user?.email],
    queryFn: () => base44.entities.PropertySubmission.filter({ partner_email: user.email }),
    enabled: !!user?.email,
  });

  // Fetch Properties across all visible partners (parent + sub-brands)
  // from the propertiesbase44 Supabase table (single source of truth).
  const { data: linkedProperties = [], isLoading: loadingProperties } = useQuery({
    queryKey: ["my-linked-properties", visiblePartnerNames.join(",")],
    queryFn: async () => {
      if (visiblePartnerNames.length === 0) return [];
      const results = await Promise.all(
        visiblePartnerNames.map(name =>
          base44.functions.invoke("supabaseProperties", {
            action: "list",
            filters: { partner_name: name },
            limit: 1000,
          }).then(res => res.data?.properties || []).catch(() => [])
        )
      );
      return results.flat()
        .filter(p => !p.archived_at)
        .map(p => ({
          ...p,
          brand_partner_id: partnerNameToId[p.partner_name] || null,
          brand_partner_name: p.partner_name || null,
          _isSubBrandProperty: partnerNameToId[p.partner_name] !== primaryPartnerId,
        }));
    },
    enabled: visiblePartnerNames.length > 0,
  });

  // Fetch Base44 Property entities for offboarding fields
  const { data: b44Properties = [] } = useQuery({
    queryKey: ["my-b44-properties-offboarding", visiblePartnerNames.join(",")],
    queryFn: async () => {
      if (visiblePartnerNames.length === 0) return [];
      const all = await base44.entities.Property.filter({ partner_name: { $in: visiblePartnerNames } });
      return all.filter(p => p.offboarding_status);
    },
    enabled: visiblePartnerNames.length > 0,
  });
  const offboardingMap = useMemo(() => {
    const m = {};
    for (const p of b44Properties) {
      const key = p.supabase_property_id || p.id;
      if (key && p.offboarding_status) m[key] = { offboarding_status: p.offboarding_status, termination_date: p.termination_date, offboarding_approved_at: p.offboarding_approved_at };
    }
    return m;
  }, [b44Properties]);

  const duplicateMut = useMutation({
    mutationFn: async (sub) => {
      const { id, created_date, updated_date, submitted_date, ...rest } = sub;
      return base44.entities.PropertySubmission.create({ ...rest, property_name: `${rest.property_name} (Copy)`, status: "draft" });
    },
    onSuccess: () => qc.invalidateQueries(["my-submissions"]),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.PropertySubmission.delete(id),
    onSuccess: () => { qc.invalidateQueries(["my-submissions"]); setDeletingId(null); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data, supabaseId }) => {
      await base44.entities.PropertySubmission.update(id, data);
      // Sync to Supabase (non-blocking)
      if (supabaseId) {
        try {
          await base44.functions.invoke("syncPropertyToSupabase", {
            action: "update",
            id: supabaseId,
            data: {
              property_name: data.property_name,
              listing_url: data.listing_url,
              market: data.location_city || data.location_full,
              bedrooms: data.bedrooms,
              bathrooms: data.bathrooms,
            },
          });
        } catch (e) {
          console.warn("Supabase sync failed (non-fatal):", e?.message);
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries(["my-submissions"]); setEditingSub(null); },
  });

  // Merge portfolio properties (Supabase) with submissions (drafts/in-progress).
  // Deduplicate: if a submission has supabase_property_id matching a linkedProperty,
  // merge — portfolio data wins for display, submission status wins for the badge.
  const unifiedList = useMemo(() => {
    const linkedMap = new Map();
    linkedProperties.forEach(p => linkedMap.set(p.id, p));
    const usedLinkedIds = new Set();
    const items = [];

    for (const sub of submissions) {
      const sbId = sub.supabase_property_id;
      const hasSbId = sbId && sbId !== "null" && sbId !== "undefined";
      if (hasSbId && linkedMap.has(sbId)) {
        const linked = linkedMap.get(sbId);
        usedLinkedIds.add(sbId);
        items.push({
          ...linked,
          _isPortfolio: true,
          _hasSubmission: true,
          _submission: sub,
          ...(offboardingMap[sbId] || {}),
          status: ["draft", "submitted", "under_review", "needs_revision"].includes(sub.status) ? sub.status : linked.status,
        });
      } else {
        items.push({ ...sub, _isPortfolio: false });
      }
    }

    for (const [id, linked] of linkedMap) {
      if (!usedLinkedIds.has(id)) {
        items.push({ ...linked, _isPortfolio: true, ...(offboardingMap[id] || {}) });
      }
    }

    return items;
  }, [submissions, linkedProperties]);

  const filtered = unifiedList.filter(item => {
    const itemStatus = item._isPortfolio ? (item.status || "active") : item.status;
    // Hide inactive portfolio properties unless they were terminated (those show with a terminated state)
    if (item._isPortfolio && itemStatus === "inactive" && item.offboarding_status !== "terminated") return false;
    const matchStatus = statusFilter === "all" || itemStatus === statusFilter;
    const name = item.property_name || "";
    const loc = item.location_full || item.location_city || item.address || item.market || "";
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || loc.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Determine what happens when partner saves/submits edits
  const handleEditSubmit = (data, isDraft) => {
    const wasLive = ["approved", "licensed", "active"].includes(editingSub.status);
    let status;
    if (isDraft) {
      // For live properties, saving as draft moves back to needs_revision holding state
      status = wasLive ? "needs_revision" : "draft";
    } else {
      // Submitting sends for review regardless of previous status
      status = "submitted";
    }
    updateMut.mutate({
      id: editingSub.id,
      supabaseId: editingSub.supabase_property_id,
      data: {
        ...data,
        status,
        ...(status === "submitted" ? { submitted_date: new Date().toISOString() } : {}),
      },
    });
  };

  // Portfolio property edits are handled via PropertyEditModal (see below)

  // Edit inline view
  if (editingSub) {
    const wasLive = ["approved", "licensed", "active"].includes(editingSub.status);
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto">
          {wasLive && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                You're editing a <strong>{editingSub.status}</strong> property. Your changes will be submitted to our team for approval before going live.
              </p>
            </div>
          )}
          <SubmissionForm
            initialData={editingSub}
            onSubmit={handleEditSubmit}
            onBack={() => setEditingSub(null)}
          />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Partner Portal</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">My Properties</h1>
        </div>
        <Link
          to="/portal/add-property"
          className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1a2e45] transition-colors"
        >
          <PlusCircle className="w-4 h-4" /> Add Property
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search properties…"
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white w-52"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all capitalize ${
                statusFilter === s
                  ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-[#0D1B2A] mb-2">Delete Submission?</h3>
            <p className="text-sm text-slate-500 mb-5">This will permanently remove this property submission. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => deleteMut.mutate(deletingId)}
                disabled={deleteMut.isPending}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Table — portfolio properties + submissions */}
      {(isLoading || loadingProperties) && unifiedList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 animate-pulse">
              <div className="w-14 h-12 rounded-xl bg-slate-100 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-slate-100 rounded w-1/3" />
                <div className="h-3 bg-slate-50 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Home className="w-5 h-5 text-slate-300" />
          </div>
          {unifiedList.length === 0 ? (
            <>
              <p className="text-slate-500 text-sm mb-1 font-medium">No properties yet</p>
              <p className="text-slate-400 text-xs mb-4">Add your first property to get started.</p>
              <Link to="/portal/add-property" className="inline-flex items-center gap-2 bg-[#0D1B2A] text-white text-sm px-4 py-2.5 rounded-xl hover:bg-[#1a2e45] transition-colors">
                <PlusCircle className="w-4 h-4" /> Add Your First Property
              </Link>
            </>
          ) : (
            <p className="text-slate-500 text-sm">No properties match your filter</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="col-span-5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Property</div>
            <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</div>
            <div className="col-span-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Details</div>
            <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</div>
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map(item => {
              const isPortfolio = item._isPortfolio;
              const detailUrl = isPortfolio
                ? `/portal/properties/${item.id}`
                : `/portal/properties/${item.supabase_property_id || item.source_property_id || item.id}`;
              const status = isPortfolio ? (item.status || "active") : item.status;
              const location = item.location_full || item.location_city || item.address || item.market || "—";
              const sub = item._submission;

              return (
                <React.Fragment key={item.id}>
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50/40 transition-colors group">
                    <div className="col-span-5 flex items-center gap-3 min-w-0">
                      <PropertyThumbnail
                        listingUrl={item.listing_url}
                        fallbackUrl={item.photo_urls?.[0] || item.images?.[0]}
                        icon={isPortfolio ? Building2 : Home}
                        className="w-14 h-12 rounded-xl"
                      />
                      <div className="min-w-0">
                        <Link to={detailUrl} className="font-medium text-sm text-[#0D1B2A] hover:text-[#C9A96E] transition-colors truncate block">{item.property_name}</Link>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{location}</p>
                        {item._isSubBrandProperty && item.brand_partner_name && (
                          <span className="inline-block text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full mt-0.5">{item.brand_partner_name}</span>
                        )}
                        {item.listing_url && <a href={item.listing_url} target="_blank" rel="noreferrer" className="text-[10px] text-[#C9A96E] hover:underline flex items-center gap-0.5 mt-0.5"><ExternalLink className="w-2.5 h-2.5" /> View listing</a>}
                      </div>
                    </div>
                    <div className="col-span-2 space-y-1">
                      {isPortfolio ? (
                        <>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            status === "active" ? "bg-emerald-50 text-emerald-700" :
                            status === "paused" ? "bg-amber-50 text-amber-700" :
                            status === "inactive" ? "bg-slate-100 text-slate-500" :
                            "bg-blue-50 text-blue-700"
                          }`}>{status}</span>
                          {sub && sub.status === "needs_revision" && (
                            <p className="text-[10px] text-orange-500">Action needed</p>
                          )}
                          {pendingEditMap[item.id] && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                              <Clock className="w-3 h-3" />
                              {pendingEditMap[item.id] === "submitted" || pendingEditMap[item.id] === "under_review"
                                ? "Changes pending review"
                                : pendingEditMap[item.id] === "needs_revision"
                                ? "Revision requested"
                                : "Edit draft saved"}
                                </div>
                                )}
                                {item.offboarding_status === "temporary_offline" && (
                                <p className="text-[10px] text-amber-600 font-medium">Offline</p>
                                )}
                                {item.offboarding_status === "scheduled" && (
                                <p className="text-[10px] text-orange-600 font-medium">
                                Offboards {item.termination_date ? new Date(item.termination_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                                </p>
                                )}
                                {item.offboarding_status === "terminated" && (
                                <p className="text-[10px] text-red-600 font-medium">
                                Terminated{item.offboarding_approved_at ? ` ${new Date(item.offboarding_approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                                </p>
                                )}
                                {pendingTermMap[item.id] && (
                                <div className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
                                <Clock className="w-3 h-3" /> Termination Pending Review
                                </div>
                                )}
                                </>
                                ) : (
                        <>
                          <PortalStatusBadge status={status} size="sm" />
                          {status === "needs_revision" && <p className="text-[10px] text-orange-500 mt-1">Action needed</p>}
                        </>
                      )}
                    </div>
                    <div className="col-span-3 flex items-center gap-3 text-xs text-slate-500">
                      {item.bedrooms && <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5 text-slate-300" /> {item.bedrooms}</span>}
                      {item.bathrooms && <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5 text-slate-300" /> {item.bathrooms}</span>}
                      {item.sleeps && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-300" /> {item.sleeps}</span>}
                      {!isPortfolio && item.ai_fit_score && <span className="bg-[#0D1B2A]/5 text-[#0D1B2A] px-1.5 py-0.5 rounded font-medium text-[10px]">{item.ai_fit_score}% fit</span>}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      {isPortfolio ? (
                        <>
                          <button
                            onClick={() => setEditModalProperty(item)}
                            title="Submit edits for approval"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#0D1B2A] bg-slate-100 hover:bg-[#C9A96E]/15 hover:text-[#C9A96E] transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <Link to={detailUrl} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100 transition-colors">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditingSub(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => duplicateMut.mutate(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100 transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeletingId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          <Link to={detailUrl} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100 transition-colors"><ChevronRight className="w-3.5 h-3.5" /></Link>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-4">
                    <div className="flex items-start gap-3">
                      <PropertyThumbnail
                        listingUrl={item.listing_url}
                        fallbackUrl={item.photo_urls?.[0]}
                        icon={isPortfolio ? Building2 : Home}
                        className="w-12 h-10 rounded-lg"
                      />
                      <div className="flex-1 min-w-0">
                        <Link to={detailUrl} className="font-medium text-sm text-[#0D1B2A] hover:text-[#C9A96E] block truncate">{item.property_name}</Link>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{location}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {isPortfolio ? (
                            <>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              status === "active" ? "bg-emerald-50 text-emerald-700" :
                              status === "paused" ? "bg-amber-50 text-amber-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>{status}</span>
                            {item.offboarding_status === "terminated" && (
                              <span className="text-[10px] text-red-600 font-medium">Terminated{item.offboarding_approved_at ? ` ${new Date(item.offboarding_approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
                            )}
                            {pendingTermMap[item.id] && (
                              <span className="text-[10px] text-red-600 font-medium flex items-center gap-0.5"><Clock className="w-3 h-3" /> Termination Pending Review</span>
                            )}
                            </>
                          ) : (
                            <PortalStatusBadge status={status} size="sm" />
                          )}
                          {item.bedrooms && <span className="text-xs text-slate-400">{item.bedrooms} bd</span>}
                          {item.bathrooms && <span className="text-xs text-slate-400">{item.bathrooms} ba</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {isPortfolio ? (
                          <button onClick={() => setEditModalProperty(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100"><Pencil className="w-3.5 h-3.5" /></button>
                        ) : (
                          <>
                            <button onClick={() => setEditingSub(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeletingId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Partner-facing message */}
                  {!isPortfolio && ["rejected", "needs_revision"].includes(status) && item.partner_facing_message && (
                    <div className="px-6 py-3 bg-amber-50/50 border-l-2 border-[#C9A96E]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <MessageSquare className="w-3.5 h-3.5 text-[#C9A96E] flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-wide">
                          {status === "rejected" ? "Message from our team" : "Feedback from our team"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed pl-5">{item.partner_facing_message}</p>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/40">
            <p className="text-xs text-slate-400">{filtered.length} propert{filtered.length === 1 ? "y" : "ies"}</p>
          </div>
        </div>
      )}

      {/* Edit modal for portfolio properties */}
      {editModalProperty && (
        <PropertyEditModal
          property={editModalProperty}
          user={user}
          onClose={() => setEditModalProperty(null)}
          onSubmitted={() => {
            qc.invalidateQueries(["my-pending-edits"]);
            qc.invalidateQueries(["my-linked-properties"]);
            setEditModalProperty(null);
          }}
        />
      )}
    </PortalLayout>
  );
}