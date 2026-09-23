import React, { useState, useMemo } from "react";
import { sb } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Plus, MoreHorizontal, Filter, ChevronUp, ChevronDown, RefreshCw, Package, Building2, GitBranch, Send, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import PartnerFormModal from "../components/partners/PartnerFormModal";
import { Switch } from "@/components/ui/switch";
import SyncButton from "../components/shared/SyncButton";
import PartnerFilters from "../components/shared/PartnerFilters";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/use-toast";


const CACHE_KEY_STRIPE = "partners_stripe_cache_v3";

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const SEGMENTS = [
  { key: "all", label: "All Partners" },
  { key: "property_manager", label: "PM Partners" },
  { key: "owner", label: "Homeowners" },
  { key: "subbrand", label: "Sub-brands" },
];

// Color-coded type pill for a partner row.
function PartnerTypePill({ partner }) {
  if (partner._isSubBrand) {
    return <span className="inline-flex items-center text-[10px] font-semibold text-white bg-[#0D9488] px-2 py-0.5 rounded-full whitespace-nowrap">Sub-brand</span>;
  }
  const t = partner.partner_type;
  if (t === "property_manager") {
    return <span className="inline-flex items-center text-[10px] font-semibold text-white bg-[#0D1B2A] px-2 py-0.5 rounded-full whitespace-nowrap">PM</span>;
  }
  if (t === "owner") {
    return <span className="inline-flex items-center text-[10px] font-semibold text-white bg-[#C9A96E] px-2 py-0.5 rounded-full whitespace-nowrap">Owner</span>;
  }
  return null;
}

export default function Partners() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSegment = searchParams.get("type") || "all";
  const [segment, setSegment] = useState(SEGMENTS.some(s => s.key === urlSegment) ? urlSegment : "all");

  const setSegmentAndUrl = (key) => {
    setSegment(key);
    setSearchParams(prev => {
      if (key === "all") prev.delete("type");
      else prev.set("type", key);
      return prev;
    }, { replace: true });
  };

  const [filters, setFilters] = useState({ search: "", status: "all", partnerType: "all", region: "all", contractStatus: "all" });
  const [sort, setSort] = useState({ col: "property_credits", dir: "desc" });
  const [showSubBrands, setShowSubBrands] = useState(false);

  const toggleSort = (col) => setSort(prev => ({ col, dir: prev.col === col && prev.dir === "asc" ? "desc" : "asc" }));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isSyncing, setIsSyncing] = useState(false);

  const { data: sbPartners = [], isLoading } = useQuery({
    queryKey: ["partners-supabase"],
    queryFn: async () => { const r = await sb.list("partners"); return r.items || []; },
  });

  // Pull emails from Base44 entities (source of truth) since Supabase may not have them
  const { data: base44Partners = [] } = useQuery({
    queryKey: ["base44-partners"],
    queryFn: () => base44.entities.Partner.list('-created_date', 500),
    staleTime: 5 * 60 * 1000,
  });

  const { data: activationInvites = [] } = useQuery({
    queryKey: ["activation-invites"],
    queryFn: () => base44.entities.PartnerInvitation.filter({ invitation_type: "primary_activation" }, "-created_date", 500),
    staleTime: 60 * 1000,
  });

  const activationInviteByPartnerId = useMemo(() => {
    const map = {};
    for (const inv of activationInvites) {
      if (!inv.partner_id) continue;
      if (!map[inv.partner_id] || new Date(inv.created_date) > new Date(map[inv.partner_id].created_date)) {
        map[inv.partner_id] = inv;
      }
    }
    return map;
  }, [activationInvites]);

  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), []);

  const handleResendActivation = async (partner) => {
    const partnerId = partner.base44_partner_id || partner.id;
    try {
      const res = await base44.functions.invoke("sendActivationEmail", { partner_id: partnerId, preview_only: false, resend: true });
      if (res.data?.error) {
        toast({ title: "Failed to resend", description: res.data.error, variant: "destructive" });
      } else {
        toast({ title: `Activation email re-sent to ${res.data.email}.` });
        queryClient.invalidateQueries({ queryKey: ["activation-invites"] });
      }
    } catch (e) {
      toast({ title: "Failed to resend", description: e.message, variant: "destructive" });
    }
  };

  const handleSendInvite = async (partner) => {
    const partnerId = partner.base44_partner_id || partner.id;
    if (!partnerId) return;
    try {
      const res = await base44.functions.invoke("sendActivationEmail", { partner_id: partnerId, preview_only: false, resend: false });
      if (res.data?.error) {
        toast({ title: "Failed to send invite", description: res.data.error, variant: "destructive" });
      } else {
        toast({ title: `Portal invitation sent to ${res.data.email || partner.primary_contact_email}.` });
        queryClient.invalidateQueries({ queryKey: ["activation-invites"] });
      }
    } catch (e) {
      toast({ title: "Failed to send invite", description: e.message, variant: "destructive" });
    }
  };

  // Merge: start with Supabase partners, then add any Base44 partners not already present.
  // Join by base44_partner_id (canonical) or direct id — never by name.
  // Enrich each merged partner with parent_partner_id and child count from Base44.
  const partners = useMemo(() => {
    const sbB44Ids = new Set(sbPartners.map(p => p.base44_partner_id).filter(Boolean));
    const sbIds = new Set(sbPartners.map(p => p.id));
    const extra = base44Partners.filter(p =>
      !sbIds.has(p.id) && !sbB44Ids.has(p.id)
    );
    const merged = [...sbPartners, ...extra];
    // Build Base44 lookup maps
    const b44ById = {};
    for (const p of base44Partners) b44ById[p.id] = p;
    const childCountByParentId = {};
    for (const p of base44Partners) {
      if (p.parent_partner_id) childCountByParentId[p.parent_partner_id] = (childCountByParentId[p.parent_partner_id] || 0) + 1;
    }
    // Enrich each merged partner
    return merged.map(p => {
      const b44 = b44ById[p.base44_partner_id || p.id];
      return {
        ...p,
        parent_partner_id: b44?.parent_partner_id || null,
        portal_user_id: b44?.portal_user_id || null,
        primary_contact_email: p.primary_contact_email || b44?.primary_contact_email || "",
        is_up_to_date: b44?.is_up_to_date ?? p.is_up_to_date ?? false,
        _childCount: childCountByParentId[p.base44_partner_id || p.id] || 0,
      };
    });
  }, [sbPartners, base44Partners]);

  // Build parent name lookup for sub-brand display
  const parentNameById = useMemo(() => {
    const map = {};
    for (const p of base44Partners) {
      map[p.id] = p.partner_name;
    }
    return map;
  }, [base44Partners]);

  // Build id→email map from Base44 entities
  const emailByPartnerId = React.useMemo(() => {
    const map = {};
    for (const p of base44Partners) {
      const email = p.stripe_billing_email || p.primary_contact_email;
      if (p.id && email) map[p.id] = email;
    }
    return map;
  }, [base44Partners]);

  // Fetch all PartnerTechStack rows (for PMS column)
  const { data: techStacks = [] } = useQuery({
    queryKey: ["all-tech-stacks"],
    queryFn: () => base44.entities.PartnerTechStack.list('-updated_date', 500),
    staleTime: 5 * 60 * 1000,
  });

  // Build partner_id→techStack map (for PMS column lookup)
  const pmsByPartnerId = useMemo(() => {
    const map = {};
    for (const ts of techStacks) {
      if (ts.partner_id) map[ts.partner_id] = ts;
    }
    return map;
  }, [techStacks]);

  const stripeEmails = [...new Set(Object.values(emailByPartnerId))].filter(Boolean);

  const [cachedStripe] = useState(() => readCache(CACHE_KEY_STRIPE) || {});
  const { data: stripeData = cachedStripe, refetch: refetchStripe } = useQuery({
    queryKey: ["stripe-partners", stripeEmails.join(",")],
    queryFn: async () => {
      if (stripeEmails.length === 0) return {};
      const res = await base44.functions.invoke("stripePartnerData", { emails: stripeEmails });
      const customers = res.data.customers || {};
      writeCache(CACHE_KEY_STRIPE, customers);
      return customers;
    },
    enabled: stripeEmails.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: cachedStripe,
  });

  const handleSyncStripe = async () => {
    setIsSyncing(true);
    try {
      await base44.functions.invoke("syncStripeToPartners", {});
      await queryClient.invalidateQueries({ queryKey: ["partners-supabase"] });
      await queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
      await refetchStripe();
    } finally {
      setIsSyncing(false);
    }
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const handleSyncAllToSupabase = async () => {
    if (!confirm(`Sync all ${base44Partners.length} Base44 partners to Supabase?`)) return;
    setIsSyncingAll(true);
    try {
      await Promise.all(
        base44Partners.map(p =>
          base44.functions.invoke("syncPartnerToSupabase", { partnerId: p.id, partnerEmail: p.primary_contact_email || "" })
            .catch(e => console.warn("Failed to sync partner", p.partner_name, e?.message))
        )
      );
      await queryClient.invalidateQueries({ queryKey: ["partners-supabase"] });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const [isSyncingProfiles, setIsSyncingProfiles] = useState(false);
  const handleSyncProfilesWithProperties = async () => {
    setIsSyncingProfiles(true);
    try {
      const result = await base44.functions.invoke("syncPartnerProfilesWithProperties", {});
      await queryClient.invalidateQueries({ queryKey: ["partners-supabase"] });
      alert(`Synced ${result.data.synced} partner profiles with properties`);
    } finally {
      setIsSyncingProfiles(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data) => sb.create("partners", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partners-supabase"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => sb.update("partners", id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partners-supabase"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => sb.delete("partners", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partners-supabase"] }),
  });

  const handleToggleUpToDate = async (partner, checked) => {
    const b44Id = partner.base44_partner_id || partner.id;
    try {
      await base44.entities.Partner.update(b44Id, { is_up_to_date: checked });
      queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
      toast({ title: `${partner.partner_name} marked as ${checked ? "up to date" : "needs review"}.` });
    } catch (e) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    }
  };

  const handleToggleAutoBilling = async (partner, checked) => {
    const b44Id = partner.base44_partner_id || partner.id;
    try {
      await base44.entities.Partner.update(b44Id, { automated_billing: checked });
      queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
      toast({ title: `Automated billing ${checked ? "enabled" : "disabled"} for ${partner.partner_name}.` });
    } catch (e) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    }
  };

  const markInactive = async (partner) => {
    const childCount = partner._childCount || 0;
    const warning = childCount > 0
      ? `\n\n⚠️ This partner has ${childCount} sub-brand${childCount !== 1 ? "s" : ""}. They will remain active. Consider archiving them too if this partner is closing operations entirely.`
      : "";
    if (!confirm(`Mark "${partner.partner_name}" and all their properties as inactive?${warning}`)) return;
    await sb.update("partners", partner.id, { status: "inactive" });
    const propsRes = await sb.list("properties", { partner_id: partner.id });
    const props = propsRes.properties || [];
    await Promise.all(props.map(p => base44.functions.invoke("supabaseProperties", { action: "update", id: p.id, data: { status: "inactive" } })));
    queryClient.invalidateQueries({ queryKey: ["partners-supabase"] });
    queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  const handleSave = async (formData) => {
    const { parent_partner_id, member_since, ...supabaseData } = formData;
    if (editingPartner) {
      await updateMutation.mutateAsync({ id: editingPartner.id, data: supabaseData });
      const b44Id = editingPartner.base44_partner_id || editingPartner.id;
      await base44.entities.Partner.update(b44Id, {
        parent_partner_id: parent_partner_id || null,
        member_since: member_since || null,
        status: supabaseData.status,
      });
      queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
    } else {
      // Create the Base44 Partner entity first — it holds the fields the Supabase
      // partners table doesn't have (parent_partner_id, member_since) and is the
      // source of truth for portal/parent linkage.
      const b44Partner = await base44.entities.Partner.create({
        partner_name: formData.partner_name,
        company_name: formData.company_name,
        primary_contact_name: formData.primary_contact_name,
        primary_contact_email: formData.primary_contact_email,
        primary_contact_phone: formData.primary_contact_phone,
        market: formData.market,
        region: formData.region,
        partner_type: formData.partner_type,
        status: formData.status,
        contract_status: formData.contract_status,
        assigned_internal_owner: formData.assigned_internal_owner,
        start_date: formData.start_date || null,
        renewal_date: formData.renewal_date || null,
        notes: formData.notes,
        member_since: member_since || null,
        parent_partner_id: parent_partner_id || null,
      });
      // Sync the new Base44 partner into Supabase. syncPartnerToSupabase only
      // writes columns that actually exist on the legacy partners table (it
      // checks for base44_partner_id and dedups by name/email), so it won't 500
      // the way a raw insert with base44_partner_id would.
      const res = await base44.functions.invoke("syncPartnerToSupabase", {
        partnerId: b44Partner.id,
        partnerEmail: formData.primary_contact_email || "",
      });
      if (res.data?.error) {
        toast({ title: "Saved to Base44, but Supabase sync failed", description: res.data.error, variant: "destructive" });
      } else {
        toast({ title: `Created ${formData.partner_name}` });
      }
      queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partners-supabase"] });
    }
    setEditingPartner(null);
  };

  // Totals across all partners (not just filtered)
  const totalStripeCredits = useMemo(() =>
    Object.values(stripeData).reduce((sum, s) => sum + (s.property_credits || 0), 0),
  [stripeData]);

  const totalAnnualSpend = useMemo(() =>
    Object.values(stripeData).reduce((sum, s) => sum + (s.annual_spend || 0), 0),
  [stripeData]);

  // Fetch all Base44 properties (same source as the Properties page) for consistent counts
  const { data: allBase44Properties = [] } = useQuery({
    queryKey: ["properties-b44-all"],
    queryFn: () => fetchAllProperties(),
    staleTime: 5 * 60 * 1000,
  });

  // Build partner_name → active property count from Base44 entities (source of truth)
  const activeCountByPartner = useMemo(() => {
    const map = {};
    for (const prop of allBase44Properties) {
      if (prop.status === "active" && prop.partner_name) {
        map[prop.partner_name] = (map[prop.partner_name] || 0) + 1;
      }
    }
    return map;
  }, [allBase44Properties]);

  const totalActiveProperties = useMemo(() =>
    Object.values(activeCountByPartner).reduce((sum, n) => sum + n, 0),
  [activeCountByPartner]);

  const filtered = partners.filter(p => {
    const s = filters.search?.toLowerCase();
    const matchesSearch = !s ||
      p.partner_name?.toLowerCase().includes(s) ||
      p.company_name?.toLowerCase().includes(s) ||
      p.market?.toLowerCase().includes(s) ||
      p.primary_contact_name?.toLowerCase().includes(s);
    const matchesStatus = filters.status === "all" || p.status === filters.status;
    const matchesType = filters.partnerType === "all" || p.partner_type === filters.partnerType;
    const matchesRegion = filters.region === "all" || p.region === filters.region;
    const matchesContract = filters.contractStatus === "all" || p.contract_status === filters.contractStatus;
    // Segment tab filter (top-level, drives the URL ?type= param)
    const matchesSegment =
      segment === "all" ? true :
      segment === "subbrand" ? !!p.parent_partner_id :
      p.partner_type === segment;
    return matchesSearch && matchesStatus && matchesType && matchesRegion && matchesContract && matchesSegment;
  }).sort((a, b) => {
    const { col, dir } = sort;
    let aVal, bVal;
    if (col === "partner_name") {
      aVal = a.partner_name || "";
      bVal = b.partner_name || "";
      return dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (col === "created_date") {
      aVal = a.created_date ? new Date(a.created_date).getTime() : 0;
      bVal = b.created_date ? new Date(b.created_date).getTime() : 0;
    } else if (col === "annual_spend") {
      aVal = stripeData[emailByPartnerId[a.id]]?.annual_spend ?? -1;
      bVal = stripeData[emailByPartnerId[b.id]]?.annual_spend ?? -1;
    } else if (col === "property_credits") {
      aVal = stripeData[emailByPartnerId[a.id]]?.property_credits ?? -1;
      bVal = stripeData[emailByPartnerId[b.id]]?.property_credits ?? -1;
    } else if (col === "active_props") {
      aVal = activeCountByPartner[a.partner_name] || 0;
      bVal = activeCountByPartner[b.partner_name] || 0;
    } else if (col === "status") {
      // Sort surfaces "live_non_renewed" partners first; ties fall back to status name.
      const rank = (s) => s === "live_non_renewed" ? 1 : 0;
      const aRank = rank(a.status), bRank = rank(b.status);
      if (aRank !== bRank) { aVal = aRank; bVal = bRank; }
      else { return dir === "asc" ? (a.status || "").localeCompare(b.status || "") : (b.status || "").localeCompare(a.status || ""); }
    }
    return dir === "asc" ? aVal - bVal : bVal - aVal;
  });

  // Build a flattened display list: top-level partners, with sub-brands
  // interleaved immediately after their parent (indented) when showSubBrands is on.
  const displayList = useMemo(() => {
    const topLevel = filtered.filter(p => !p.parent_partner_id);
    const childrenByParentId = {};
    for (const p of filtered) {
      if (p.parent_partner_id) {
        if (!childrenByParentId[p.parent_partner_id]) childrenByParentId[p.parent_partner_id] = [];
        childrenByParentId[p.parent_partner_id].push(p);
      }
    }
    const result = [];
    for (const parent of topLevel) {
      result.push({ ...parent, _isSubBrand: false });
      if (showSubBrands && childrenByParentId[parent.id]) {
        for (const child of childrenByParentId[parent.id]) {
          result.push({ ...child, _isSubBrand: true, _parentName: parent.partner_name });
        }
      }
    }
    // When showSubBrands is off, also include sub-brands that match the filter
    // but whose parent didn't match (so they're not orphaned/hidden)
    if (!showSubBrands) {
      const topIds = new Set(topLevel.map(p => p.id));
      const orphanSubBrands = filtered.filter(p => p.parent_partner_id && !topIds.has(p.parent_partner_id));
      orphanSubBrands.forEach(p => result.push({ ...p, _isSubBrand: true, _parentName: parentNameById[p.parent_partner_id] || "—" }));
    }
    return result;
  }, [filtered, showSubBrands, parentNameById]);

  const topLevelCount = useMemo(() => partners.filter(p => !p.parent_partner_id).length, [partners]);
  const subBrandCount = useMemo(() => partners.filter(p => p.parent_partner_id).length, [partners]);

  // Segment counts for the tab bar (reflect totals across all partners, not just filtered)
  const segmentCounts = useMemo(() => ({
    all: partners.length,
    property_manager: partners.filter(p => p.partner_type === "property_manager").length,
    owner: partners.filter(p => p.partner_type === "owner").length,
    subbrand: subBrandCount,
  }), [partners, subBrandCount]);



  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{segment === "owner" ? "Homeowners" : segment === "property_manager" ? "PM Partners" : segment === "subbrand" ? "Sub-brands" : "All Partners"}</h2>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">{segmentCounts.all}</span> Partners:
            {" "}
            <span className="text-[#0D1B2A]">{segmentCounts.property_manager} PM</span>
            {" · "}
            <span className="text-[#A68B4B]">{segmentCounts.owner} Owner</span>
            {" · "}
            <span className="text-[#0D9488]">{segmentCounts.subbrand} Sub-brand</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={isSyncing || isSyncingAll || isSyncingProfiles}>
                <RefreshCw className={`w-3.5 h-3.5 ${(isSyncing || isSyncingAll || isSyncingProfiles) ? "animate-spin" : ""}`} />
                Sync <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSyncStripe}>Sync Stripe</DropdownMenuItem>
              <DropdownMenuItem onClick={handleSyncAllToSupabase}>Sync to Supabase</DropdownMenuItem>
              <DropdownMenuItem onClick={handleSyncProfilesWithProperties}>Sync Profiles</DropdownMenuItem>
              <DropdownMenuItem onClick={() => queryClient.invalidateQueries({ queryKey: ["partners"] })}>Sync from Site</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => { setEditingPartner(null); setModalOpen(true); }} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            <Plus className="w-4 h-4 mr-1.5" /> Add Partner
          </Button>
        </div>
      </div>

      {/* Segment tabs */}
      <div className="flex items-center gap-1.5 border-b border-gray-100 pb-px">
        {SEGMENTS.map(seg => (
          <button
            key={seg.key}
            onClick={() => setSegmentAndUrl(seg.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-t-lg transition-colors border-b-2 -mb-px ${
              segment === seg.key
                ? "border-[#C9A96E] text-[#0D1B2A] font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {seg.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              segment === seg.key ? "bg-[#C9A96E]/20 text-[#A68B4B]" : "bg-gray-100 text-gray-400"
            }`}>
              {segmentCounts[seg.key]}
            </span>
          </button>
        ))}
      </div>

      <PartnerFilters onChange={setFilters} />

      {/* Sub-brand toggle */}
      {subBrandCount > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubBrands(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
              showSubBrands
                ? "bg-[#0F172A] text-white border-[#0F172A]"
                : "border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            {showSubBrands ? "Hide" : "Show"} sub-brands
          </button>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">${totalAnnualSpend.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-gray-500">Annual Spend</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{totalStripeCredits}</p>
            <p className="text-xs text-gray-500">Credits</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{totalActiveProperties}</p>
            <p className="text-xs text-gray-500">Active Properties</p>
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 && !isLoading ? (
        <EmptyState
          icon={Filter}
          title={partners.length === 0 ? "No partners yet" : "No matching partners"}
          description={partners.length === 0 ? "Add your first partner to get started" : "Try adjusting your search or filters"}
          actionLabel={partners.length === 0 ? "Add Partner" : undefined}
          onAction={partners.length === 0 ? () => setModalOpen(true) : undefined}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                {[
                  { label: "Partner", col: "partner_name" },
                   { label: "Market", col: null },
                   { label: "PMS", col: null },
                   { label: "Status", col: "status" },
                   { label: "Invite Sent", col: null },
                   { label: "Activated", col: null },
                   { label: "Contract", col: null },
                   { label: "Auto Billing", col: null },
                   { label: "Annual Spend", col: "annual_spend" },
                   { label: "Cycle", col: null },
                   { label: "Credits", col: "property_credits" },
                  { label: "Active Props", col: "active_props" },
                  { label: "Created", col: "created_date" },
                ].map(({ label, col }) => (
                  <TableHead
                    key={label}
                    className={`text-xs font-semibold text-gray-500 ${col ? "cursor-pointer select-none hover:text-gray-800" : ""}`}
                    onClick={() => col && toggleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {col && (
                        sort.col === col
                          ? sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          : <ChevronUp className="w-3 h-3 text-gray-300" />
                      )}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayList.map(p => (
                <TableRow
                  key={p.id}
                  className={`cursor-pointer hover:bg-gray-50/50 transition-colors ${p._isSubBrand ? "bg-slate-50/40" : ""}`}
                  onClick={() => navigate(createPageUrl("PartnerDetail") + `?id=${p.id}`)}
                >
                  <TableCell>
                    <div className={p._isSubBrand ? "pl-6" : ""}>
                      <div className="flex items-center gap-2">
                        {p._isSubBrand && <span className="text-gray-300 text-xs">↳</span>}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-gray-900">{p.partner_name}</p>
                            <PartnerTypePill partner={p} />
                          </div>
                          {p._isSubBrand ? (
                            <p className="text-xs text-slate-400">subsidiary of {p._parentName}</p>
                          ) : p.company_name ? (
                            <p className="text-xs text-gray-400">{p.company_name}</p>
                          ) : null}
                        </div>
                        {!p._isSubBrand && p._childCount > 0 && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                            +{p._childCount} brand{p._childCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{p.market || "—"}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {(() => {
                      const b44p = pmsByPartnerId[p.base44_partner_id || p.id];
                      const pmsVal = b44p?.pms === "Other" ? b44p.pms_other : b44p?.pms;
                      return pmsVal || "—";
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleUpToDate(p, !p.is_up_to_date); }}
                        title={p.is_up_to_date ? "Marked up to date — click to unflag" : "Mark as up to date"}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap ${
                          p.is_up_to_date
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        }`}
                      >
                        <Check className={`w-2.5 h-2.5 ${p.is_up_to_date ? "text-emerald-600" : "text-gray-400"}`} />
                        Up to date
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const inv = activationInviteByPartnerId[p.base44_partner_id || p.id];
                      if (!inv) return <span className="text-gray-300">—</span>;
                      return (
                        <div>
                          <span className="text-xs text-gray-500">{formatDistanceToNow(new Date(inv.created_date), { addSuffix: true })}</span>
                          {inv.status === "pending" && new Date(inv.created_date) < sevenDaysAgo && !p.portal_user_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResendActivation(p); }}
                              className="block mt-0.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >Resend invite</button>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      if (p.portal_user_id) return <Check className="w-4 h-4 text-green-500" />;
                      const inv = activationInviteByPartnerId[p.base44_partner_id || p.id];
                      if (inv && inv.status === "pending" && new Date(inv.created_date) < sevenDaysAgo) {
                        return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Reminder due</span>;
                      }
                      return <span className="text-gray-300">—</span>;
                    })()}
                  </TableCell>
                  <TableCell><StatusBadge status={p.contract_status} /></TableCell>
                  <TableCell>
                    <Switch
                      checked={!!p.automated_billing}
                      onCheckedChange={(checked) => handleToggleAutoBilling(p, checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {(() => {
                      const s = stripeData[emailByPartnerId[p.base44_partner_id || p.id]];
                      if (!s) return <span className="text-gray-300">—</span>;
                      return (
                        <p className="font-medium text-gray-900">
                          ${(s.annual_spend ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {(() => {
                      const s = stripeData[emailByPartnerId[p.base44_partner_id || p.id]];
                      if (!s || !s.billing_cycle) return <span className="text-gray-300">—</span>;
                      const isMonthly = s.billing_cycle === "monthly";
                      return (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isMonthly ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {isMonthly ? "Monthly" : "Annual"}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {(() => {
                      const s = stripeData[emailByPartnerId[p.base44_partner_id || p.id]];
                      if (!s) return <span className="text-gray-300">—</span>;
                      return (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${(s.property_credits || 0) > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                          {s.property_credits ?? 0}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {(() => {
                      const count = activeCountByPartner[p.partner_name] || 0;
                      return (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${count > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                          {count}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">
                    {p.created_date ? format(new Date(p.created_date), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                           e.stopPropagation();
                           setEditingPartner(p);
                           setModalOpen(true);
                         }}>Edit</DropdownMenuItem>
                        {!p.portal_user_id && (p.primary_contact_email) && (
                          <DropdownMenuItem
                            className="text-blue-600"
                            onClick={(e) => { e.stopPropagation(); handleSendInvite(p); }}
                          >
                            <Send className="w-3.5 h-3.5 mr-1.5" /> Send portal invite
                          </DropdownMenuItem>
                        )}
                        {p.status !== "inactive" && (
                          <DropdownMenuItem
                            className="text-orange-600"
                            onClick={(e) => { e.stopPropagation(); markInactive(p); }}
                          >Mark as Inactive</DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this partner?")) deleteMutation.mutate(p.id);
                          }}
                        >Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PartnerFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        partner={editingPartner ? { ...editingPartner, parent_partner_id: partners.find(p => p.id === (editingPartner.base44_partner_id || editingPartner.id))?.parent_partner_id } : null}
        onSave={handleSave}
      />
    </div>
  );
}