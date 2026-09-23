import React, { useState, useMemo } from "react";
import { sb } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft, Building2, FileText, Image, CreditCard, CheckSquare,
  MessageSquare, ClipboardCheck, Activity, Mail, Phone, MapPin, Calendar, Edit2,
  Pencil, Check, X, Info, RefreshCw, ExternalLink, Plus, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "../components/shared/StatusBadge";
import PartnerFormModal from "../components/partners/PartnerFormModal";
import PartnerOverviewTab from "../components/partners/PartnerOverviewTab";
import RelatedEntitiesTab from "../components/partners/RelatedEntitiesTab";
import PartnerDocumentsTab from "../components/partners/PartnerDocumentsTab";
import FunnelOnboardingTab from "../components/partners/FunnelOnboardingTab";
import PortalManagementTab from "../components/partners/PortalManagementTab";
import LicensesTab from "../components/partners/LicensesTab";
import TechStackTab from "../components/partners/TechStackTab";
import PartnerPropertiesTab from "../components/partners/PartnerPropertiesTab";
import PartnerBillingTab from "../components/partners/PartnerBillingTab";
import PartnerNotesTab from "../components/partners/PartnerNotesTab";
import DiscountCard from "../components/partners/DiscountCard";
import SubBrandsCard from "../components/partners/SubBrandsCard";
import SendActivationEmailModal from "../components/partners/SendActivationEmailModal";
import SendSubscriptionInvoiceModal from "../components/partners/SendSubscriptionInvoiceModal";
import SendLicenseSubscriptionModal from "../components/partners/SendLicenseSubscriptionModal";
import ParentPartnerBar from "../components/partners/ParentPartnerBar";
import RenderErrorBoundary from "../components/shared/RenderErrorBoundary";
import { format } from "date-fns";
import { Loader2, Zap } from "lucide-react";

export default function PartnerDetail() {
  const [searchParams, setSearchParams] = useSearchParams();
  const partnerId = searchParams.get("id");
  const activeTab = searchParams.get("tab") || "overview";
  const [editModal, setEditModal] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [activationModalOpen, setActivationModalOpen] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [subInvoiceOpen, setSubInvoiceOpen] = useState(false);
  const [licenseSubOpen, setLicenseSubOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const setTab = (tab) => setSearchParams(params => { params.set("tab", tab); return params; });

  // Supabase-first partner load with Base44 fallback.
  // When a Partner is created in Base44 (e.g. via application approval) but not
  // yet synced to Supabase, sb.get returns nothing. We fall back to the Base44
  // Partner entity so PartnerDetail renders immediately instead of an empty page.
  // A __fromBase44Fallback flag drives the subtle "not yet synced" indicator.
  const { data: partner, isLoading } = useQuery({
    queryKey: ["partner", partnerId],
    queryFn: async () => {
      // 1. Resolve by base44_partner_id (syncPartnerToSupabase stores this).
      try {
        const byRef = await sb.list("partners", { base44_partner_id: partnerId });
        if (byRef?.items?.[0]) return byRef.items[0];
      } catch (e) { /* base44_partner_id column may not exist on legacy installs */ }
      // 2. Direct get by id (legacy partners where Supabase id == Base44 id).
      try {
        const r = await sb.get("partners", partnerId);
        if (r?.item) return r.item;
      } catch (e) {
        console.warn("Supabase partner fetch failed, falling back to Base44:", e?.message);
      }
      // 3. Fallback: Base44 Partner entity.
      try {
        const results = await base44.entities.Partner.filter({ id: partnerId });
        if (results?.[0]) {
          console.log("[PartnerDetail] Rendering from Base44 fallback (Supabase gap)");
          return { ...results[0], __fromBase44Fallback: true };
        }
      } catch (e) {
        console.warn("[PartnerDetail] Base44 Partner fallback failed:", e?.message);
      }
      return null;
    },
    enabled: !!partnerId,
  });

  const fromBase44Fallback = !!partner?.__fromBase44Fallback;
  const [syncingFallback, setSyncingFallback] = useState(false);

  // Fetch the Base44 Partner entity up-front so the adaptive UI derivation below
  // can read partner_type without a temporal-dead-zone reference.
  const { data: partnerEntity } = useQuery({
    queryKey: ["partner-entity", partnerId],
    queryFn: async () => {
      try {
        const results = await base44.entities.Partner.filter({ id: partnerId });
        return results?.[0] || null;
      } catch (e) {
        console.warn("[PartnerDetail] Base44 Partner entity fetch failed:", e?.message);
        return null;
      }
    },
    enabled: !!partnerId,
  });

  // Adaptive UI based on partner type. Homeowners get personal framing, PMs get professional framing.
  const partnerType = partner?.partner_type || partnerEntity?.partner_type;
  const isHomeowner = partnerType === "owner";
  const isPM = partnerType === "property_manager";
  const ONBOARDING_GUIDES = {
    owner: "https://theonehundredcollection.com/what-to-expect-homeowner",
    property_manager: "https://theonehundredcollection.com/what-to-expect-vacation-rental-manager",
  };
  const guideUrl = ONBOARDING_GUIDES[partnerType];

  const syncFallbackPartner = async () => {
    setSyncingFallback(true);
    try {
      await base44.functions.invoke("syncPartnerToSupabase", {
        partnerId,
        partnerEmail: partner?.primary_contact_email,
      });
      toast({ title: "Synced to Supabase", description: "Partner is now published to the public site." });
      queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
    } catch (e) {
      toast({ variant: "destructive", title: "Sync failed", description: e?.message || "Try again." });
    } finally {
      setSyncingFallback(false);
    }
  };

  // Resolve the Base44 Partner entity by partner_name. The admin PartnerDetail is
  // keyed off the Supabase partner id, but backend functions used by the Portal
  // tab (createPartnerInvitation, getPartnerTeam) expect the Base44 Partner
  // entity id. The Supabase partners table has no base44_partner_id column, so
  // partner_name is the join key (same strategy used by syncPartnerToSupabase).
  const { data: base44Partner } = useQuery({
    queryKey: ["partner-by-name", partner?.partner_name],
    queryFn: async () => {
      const results = await base44.entities.Partner.filter({ partner_name: partner.partner_name });
      return results?.[0] || null;
    },
    enabled: !!partner?.partner_name,
  });

  // Authoritative Base44 Partner ID — resolves by name lookup first (handles
  // Supabase-first partners whose URL id is NOT a Base44 id), then by entity
  // fetch, finally falling back to the URL id.
  const base44PartnerId = base44Partner?.id || partnerEntity?.id || partnerId;
  // Authoritative Base44 Partner ID resolved from Base44 entities only (not the
  // URL id, which may be a Supabase id). Used to fetch properties via the
  // partner_id link so only properties that genuinely belong to this partner
  // are counted — partner_name can collide or go stale across partners.
  const confirmedBase44Id = base44Partner?.id || partnerEntity?.id || null;

  const stripeBillingEmail = base44Partner?.stripe_billing_email || partnerEntity?.stripe_billing_email || partner?.stripe_billing_email || "";

  // Fetch Stripe data for this partner's billing email
  const { data: stripeData } = useQuery({
    queryKey: ["stripe-partner", stripeBillingEmail],
    queryFn: async () => {
      if (!stripeBillingEmail) return null;
      const res = await base44.functions.invoke("stripePartnerData", { emails: [stripeBillingEmail] });
      return res.data?.customers?.[stripeBillingEmail] || null;
    },
    enabled: !!stripeBillingEmail,
  });

  const partnerName = partner?.partner_name;

  const { data: properties = [] } = useQuery({
    queryKey: ["partner-properties", partnerId, partnerName, confirmedBase44Id],
    queryFn: async () => {
      // Base44 Property records define which properties belong to this partner
      // (authoritative partner_id link). The Supabase propertiesbase44 table is
      // the source of truth for each property's display attributes (status,
      // beds, baths, type, …), so we overlay those onto the Base44 rows. This
      // keeps Base44 ObjectIds for license linking / portal updates while
      // showing Supabase-accurate info in the Properties table.
      let b44Rows = [];
      if (confirmedBase44Id) {
        b44Rows = await base44.entities.Property.filter({ partner_id: confirmedBase44Id });
      } else if (partnerName) {
        b44Rows = await base44.entities.Property.filter({ partner_name: partnerName });
      }
      const norm = (u) => (u ? String(u).replace(/\/+$/, "").split("?")[0].split("#")[0] : "");
      const b44Urls = new Set();
      const urls = [];
      for (const p of b44Rows) {
        if (p.listing_url) { b44Urls.add(norm(p.listing_url)); urls.push(p.listing_url); }
        if (p.vrm_url && p.vrm_url !== p.listing_url) { b44Urls.add(norm(p.vrm_url)); urls.push(p.vrm_url); }
      }
      const supaByUrl = new Map();
      if (urls.length > 0) {
        try {
          const res = await base44.functions.invoke("supabaseProperties", { action: "list_by_urls", urls });
          for (const r of (res?.data?.properties || [])) {
            if (r.vrm_url) supaByUrl.set(norm(r.vrm_url), r);
            if (r.listing_url) supaByUrl.set(norm(r.listing_url), r);
          }
        } catch (e) {
          // Supabase lookup is non-fatal — fall back to Base44 attributes.
        }
      }

      // Display attributes sourced from Supabase (source of truth). id and
      // partner fields stay from Base44 so license/portal updates keep working.
      const OVERLAY = ["status", "market", "property_type", "bedrooms", "bathrooms", "sleeps", "address", "onboarding_status", "photography_status", "launch_date"];
      const mergedRows = b44Rows.map(p => {
        const supa = (p.listing_url && supaByUrl.get(norm(p.listing_url))) || (p.vrm_url && supaByUrl.get(norm(p.vrm_url))) || null;
        if (!supa) return p;
        const merged = { ...p };
        for (const k of OVERLAY) {
          if (supa[k] !== undefined && supa[k] !== null) merged[k] = supa[k];
        }
        merged._supabaseRowId = supa.id;
        return merged;
      });

      // Backfill: active Supabase properties for this partner that have no Base44
      // Property record yet. Create one so the property shows up immediately in
      // the partner's list (and becomes license-able / portal-visible). Idempotent
      // — once created, the url match short-circuits on subsequent loads.
      const createdRows = [];
      if (partnerName && confirmedBase44Id) {
        try {
          const res = await base44.functions.invoke("supabaseProperties", { action: "list", filters: { partner_name: partnerName }, lite: true });
          const supaRows = res?.data?.properties || [];
          for (const s of supaRows) {
            if (s.status !== "active") continue;
            const sUrls = [s.listing_url, s.vrm_url].filter(Boolean).map(norm);
            if (sUrls.some(u => b44Urls.has(u))) continue;
            try {
              const created = await base44.entities.Property.create({
                property_name: s.property_name,
                partner_id: confirmedBase44Id,
                partner_name: partnerName,
                market: s.market || partner?.market || undefined,
                listing_url: s.listing_url || undefined,
                vrm_url: s.vrm_url || s.listing_url || undefined,
                address: s.address || undefined,
                bedrooms: s.bedrooms ?? undefined,
                bathrooms: s.bathrooms ?? undefined,
                sleeps: s.sleeps ?? undefined,
                property_type: s.property_type || undefined,
                status: "active",
                portal_visible: true,
                onboarding_status: "not_started",
                photography_status: "not_started",
                supabase_property_id: s.id != null ? String(s.id) : undefined,
              });
              if (created?.id) createdRows.push(created);
            } catch (e) {
              // Non-fatal: a single failed create shouldn't hide the rest.
            }
          }
        } catch (e) {
          // Non-fatal: Supabase list unavailable.
        }
      }

      return [...mergedRows, ...createdRows];
    },
    enabled: !!partnerId && (!!confirmedBase44Id || !!partnerName),
  });
  const { data: documents = [] } = useQuery({
    queryKey: ["partner-docs", partnerId],
    queryFn: async () => { const r = await sb.list("documents", { partner_id: partnerId }); return r.items || []; },
    enabled: !!partnerId,
  });
  const { data: billing = [] } = useQuery({
    queryKey: ["partner-billing", partnerId],
    queryFn: async () => { const r = await sb.list("billing_records", { partner_id: partnerId }); return r.items || []; },
    enabled: !!partnerId,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["partner-tasks", partnerId],
    queryFn: async () => { const r = await sb.list("tasks", { partner_id: partnerId }); return r.items || []; },
    enabled: !!partnerId,
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["partner-notes", partnerId],
    queryFn: async () => { const r = await sb.list("notes", { partner_id: partnerId }); return r.items || []; },
    enabled: !!partnerId,
  });
  const { data: onboarding = [] } = useQuery({
    queryKey: ["partner-onboarding", partnerId],
    queryFn: async () => { const r = await sb.list("onboarding_items", { partner_id: partnerId }); return r.items || []; },
    enabled: !!partnerId,
  });
  const { data: media = [] } = useQuery({
    queryKey: ["partner-media", partnerId],
    queryFn: async () => { const r = await sb.list("media_assets", { partner_id: partnerId }); return r.items || []; },
    enabled: !!partnerId,
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["partner-licenses", partnerId],
    queryFn: () => base44.entities.LicenseRecord.filter({ partner_id: partnerId }),
    enabled: !!partnerId,
  });

  const { data: partnerOnboardingRows = [] } = useQuery({
    queryKey: ["partner-funnel-row", partnerId],
    queryFn: () => base44.entities.PartnerOnboarding.filter({ partner_id: partnerId }),
    enabled: !!partnerId,
  });
  const partnerOnboardingRow = partnerOnboardingRows[0] || null;

  // Fetch parent partner (if this is a sub-brand)
  const { data: parentPartner } = useQuery({
    queryKey: ["parent-partner", partnerEntity?.parent_partner_id],
    queryFn: async () => {
      if (!partnerEntity?.parent_partner_id) return null;
      const results = await base44.entities.Partner.filter({ id: partnerEntity.parent_partner_id });
      return results?.[0] || null;
    },
    enabled: !!partnerEntity?.parent_partner_id,
  });

  // Fetch children (sub-brands) — for the SubBrandsCard
  const { data: allPartnersForChildren = [] } = useQuery({
    queryKey: ["all-partners-children", partnerId],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
    enabled: !!partnerId && !partnerEntity?.parent_partner_id, // only fetch for top-level
  });
  const childPartners = React.useMemo(
    () => allPartnersForChildren.filter(p => p.parent_partner_id === base44PartnerId),
    [allPartnersForChildren, base44PartnerId]
  );

  const handleUnlinkParent = async () => {
    if (!confirm(`Unlink "${partner?.partner_name}" from "${parentPartner?.partner_name}"? This will make it a top-level partner again.`)) return;
    await base44.entities.Partner.update(base44PartnerId, { parent_partner_id: null });
    queryClient.invalidateQueries({ queryKey: ["partner-entity", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["parent-partner", partnerEntity?.parent_partner_id] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => sb.update("partners", id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partner", partnerId] }),
  });

  const updateBillingEmail = useMutation({
    mutationFn: async ({ partnerId: _pid, email }) => {
      await base44.entities.Partner.update(base44PartnerId, { stripe_billing_email: email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-entity", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-by-name", partner?.partner_name] });
    },
  });

  const [autoApplying, setAutoApplying] = useState(false);

  const autoApplyCredits = async () => {
    const totalCredits = stripeData?.property_credits ?? 0;
    if (totalCredits === 0) return;

    // Fetch current licenses to know which properties already have credits
    const existingLicenses = await base44.entities.LicenseRecord.filter({ partner_id: partnerId });
    const creditedPropIds = new Set(existingLicenses.filter(l => l.property_id).map(l => l.property_id));
    const creditedPropNames = new Set(existingLicenses.filter(l => l.property_name).map(l => l.property_name));

    // Properties not yet credited
    const uncredited = properties.filter(p =>
      !creditedPropIds.has(p.id) && !creditedPropNames.has(p.property_name)
    );

    // How many we can still apply (cap at totalCredits - already attributed)
    const alreadyAttributed = existingLicenses.filter(l =>
      l.license_status === "active" && l.payment_status === "paid"
    ).length;
    const remaining = Math.max(0, totalCredits - alreadyAttributed);
    const toApply = uncredited.slice(0, remaining);

    if (toApply.length === 0) return;
    setAutoApplying(true);

    // Credit slots carry invoice number and unit price — use them in order
    const creditSlots = stripeData?.credit_slots || [];
    // Build per-invoice index map so license numbers are {invoice_number}-{n}
    const invoiceCounters = {};
    const slotsToUse = creditSlots.slice(alreadyAttributed, alreadyAttributed + toApply.length);

    const today = new Date().toISOString().split("T")[0];
    await Promise.all(toApply.map((prop, i) => {
      const propId = String(prop.id || "");
      const slot = slotsToUse[i] || null;
      let licenseNumber;
      if (slot?.invoice_number) {
        if (!invoiceCounters[slot.invoice_id]) invoiceCounters[slot.invoice_id] = 0;
        invoiceCounters[slot.invoice_id]++;
        licenseNumber = `${slot.invoice_number}-${invoiceCounters[slot.invoice_id]}`;
      }
      return base44.entities.LicenseRecord.create({
        partner_id: base44PartnerId,
        partner_name: partner.partner_name,
        ...(propId ? { property_id: propId } : {}),
        property_name: prop.property_name,
        submission_id: propId || `prop-${prop.property_name}-${Date.now()}`,
        license_status: "active",
        payment_status: "paid",
        paid_date: slot?.paid_date || today,
        invoice_date: slot?.invoice_date || undefined,
        stripe_invoice_id: slot?.invoice_id || undefined,
        ...(licenseNumber ? { license_number: licenseNumber } : {}),
        ...(slot?.unit_price != null ? { annual_fee: slot.unit_price } : {}),
      });
    }));
    queryClient.invalidateQueries({ queryKey: ["partner-licenses", partnerId] });
    setAutoApplying(false);
  };

  const markInactive = async () => {
    if (!confirm(`Mark "${partner.partner_name}" and all their properties as inactive?`)) return;
    await sb.update("partners", partnerId, { status: "inactive" });
    await Promise.all(properties.map(p => base44.functions.invoke("supabaseProperties", { action: "update", id: p.id, data: { status: "inactive" } })));
    queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["partner-properties", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  if (isLoading) {
    return <div className="animate-shimmer h-8 w-48 rounded mb-4" />;
  }

  if (!partner) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Building2 className="w-12 h-12 text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-700">Partner not found</h2>
        <p className="text-sm text-gray-400 mt-1">This partner may have been removed or is not yet synced.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(createPageUrl("Partners"))}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Partners
        </Button>
      </div>
    );
  }

  return (
    <RenderErrorBoundary>
    <div className="space-y-6 animate-fade-up">
      {/* Parent Partner bar (if sub-brand) */}
      {parentPartner && (
        <ParentPartnerBar parentPartner={parentPartner} onUnlink={handleUnlinkParent} />
      )}

      {/* Sub-brands card (always for top-level partners) */}
      {!partnerEntity?.parent_partner_id && (
        <SubBrandsCard partnerId={base44PartnerId} partnerName={partner.partner_name} isTopLevel />
      )}

      {/* Back & Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl("Partners"))}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{partner.partner_name}</h2>
            <StatusBadge status={partner.status} />
            {isHomeowner && (
              <span className="inline-flex items-center text-[11px] font-semibold text-white bg-[#C9A96E] px-2.5 py-0.5 rounded-full">Homeowner</span>
            )}
            {isPM && (
              <span className="inline-flex items-center text-[11px] font-semibold text-white bg-[#0D1B2A] px-2.5 py-0.5 rounded-full">PM</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-gray-500">{(isHomeowner ? "" : partner.company_name ? partner.company_name + " · " : "")}{partner.market || "No market"}</p>
            {guideUrl && (
              <a href={guideUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#A68B4B] hover:text-[#0D1B2A] hover:underline">
                See {isHomeowner ? "homeowner" : "PM"} onboarding guide
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        {(() => {
          const totalCredits = stripeData?.property_credits ?? 0;
          const alreadyApplied = licenses.filter(l => l.license_status === "active" && l.payment_status === "paid").length;
          const remaining = Math.max(0, totalCredits - alreadyApplied);
          return remaining > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={autoApplyCredits}
              disabled={autoApplying}
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              {autoApplying
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Zap className="w-3.5 h-3.5 mr-1.5" />}
              Apply {remaining} Licence{remaining !== 1 ? "s" : ""}
            </Button>
          ) : null;
        })()}
        {partner.status !== "inactive" && (
          <Button variant="outline" size="sm" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={markInactive}>
            Mark as Inactive
          </Button>
        )}
        {!partnerEntity?.portal_user_id && (partner?.primary_contact_email || partnerEntity?.primary_contact_email) && (
          <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setActivationModalOpen(true)}>
            <Mail className="w-3.5 h-3.5 mr-1.5" /> Send activation email
          </Button>
        )}
        {!partnerEntity?.portal_user_id && !(partner?.primary_contact_email || partnerEntity?.primary_contact_email) && (
          <span className="text-xs text-gray-400 italic">Set a primary contact email to activate portal</span>
        )}
        {fromBase44Fallback && (
          <div className="flex items-center gap-1.5" title="This partner exists in Base44 but has not yet synced to the public site.">
            <Info className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-amber-600 italic">Rendering from Base44 fallback</span>
            <Button
              variant="outline"
              size="sm"
              onClick={syncFallbackPartner}
              disabled={syncingFallback}
              className="ml-1 h-7 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${syncingFallback ? "animate-spin" : ""}`} />
              Sync now
            </Button>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditModal(true)}>
          <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
        </Button>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {partner.primary_contact_email && (
          <div className="bg-white rounded-lg border border-gray-100 p-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-600 truncate">{partner.primary_contact_email}</span>
          </div>
        )}
        {partner.primary_contact_phone && (
          <div className="bg-white rounded-lg border border-gray-100 p-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-600">{partner.primary_contact_phone}</span>
          </div>
        )}
        {partner.region && (
          <div className="bg-white rounded-lg border border-gray-100 p-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-600">{partner.region}</span>
          </div>
        )}
        {partner.renewal_date && (
          <div className="bg-white rounded-lg border border-gray-100 p-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-600">Renewal: {format(new Date(partner.renewal_date), "MMM d, yyyy")}</span>
          </div>
        )}

        {/* Stripe Billing Email */}
        <div className="bg-white rounded-lg border border-blue-100 p-3 flex items-center gap-2 col-span-2 md:col-span-2">
          <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
          {editingEmail ? (
            <form className="flex items-center gap-1.5 flex-1" onSubmit={async (e) => {
              e.preventDefault();
              await updateBillingEmail.mutateAsync({ partnerId: base44PartnerId, email: emailValue });
              setEditingEmail(false);
            }}>
              <input
                autoFocus
                type="email"
                value={emailValue}
                onChange={e => setEmailValue(e.target.value)}
                placeholder="billing@example.com"
                className="flex-1 text-xs border border-blue-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <button type="submit" className="text-blue-600 hover:text-blue-800"><Check className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => setEditingEmail(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs text-gray-600 truncate flex-1">
                {stripeBillingEmail ? stripeBillingEmail : <span className="text-gray-400 italic">No Stripe billing email</span>}
              </span>
              <button onClick={() => { setEmailValue(stripeBillingEmail); setEditingEmail(true); }}
                className="shrink-0 text-gray-400 hover:text-blue-500 transition-colors" title="Edit Stripe billing email">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Stripe Subscription Data */}
        {stripeBillingEmail && stripeData && (
          <div className="bg-white rounded-lg border border-green-100 p-4 col-span-2 md:col-span-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-green-500" />
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Stripe Active</span>
              </div>
              {stripeData.customer_id && (
                <a href={`https://dashboard.stripe.com/customers/${stripeData.customer_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                  View in Stripe ↗
                </a>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-700">{stripeData.property_credits ?? 0}</div>
                <div className="text-xs text-gray-500 mt-0.5">{isHomeowner ? "Home Licences" : "Property Licences"}</div>
              </div>
              <div className="text-center border-l border-gray-100">
                <div className="text-2xl font-bold text-gray-800">
                  {stripeData.last_invoice_amount != null ? `$${stripeData.last_invoice_amount.toFixed(2)}` : "—"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Last Invoice</div>
              </div>
              <div className="text-center border-l border-gray-100">
                <div className="text-sm font-semibold text-gray-700">
                  {stripeData.last_invoice_date ? format(new Date(stripeData.last_invoice_date * 1000), "MMM d, yyyy") : "—"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Invoice Date</div>
              </div>
            </div>
            {properties.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                <p className="text-xs text-gray-500">{properties.filter(p => p.status === "active").length} {isHomeowner ? "home" : "properties"} &times; license price</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSubInvoiceOpen(true)}
                  className="h-7 text-xs gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  Send Subscription Invoice
                </Button>
              </div>
            )}
            <div className="mt-2 flex items-center justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLicenseSubOpen(true)}
                className="h-7 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Send className="w-3 h-3" />
                Send License Subscription (1–100)
              </Button>
            </div>
          </div>
        )}
        {stripeBillingEmail && stripeData === null && (
          <div className="bg-white rounded-lg border border-gray-100 p-3 flex items-center gap-2 col-span-2 md:col-span-4">
            <CreditCard className="w-4 h-4 text-gray-300 shrink-0" />
            <span className="text-xs text-gray-400 italic">No Stripe customer found for this email</span>
            <Button
              variant="outline"
              size="sm"
              disabled={creatingCustomer}
              onClick={async () => {
                setCreatingCustomer(true);
                try {
                  await base44.functions.invoke("createStripeCustomer", {
                    email: stripeBillingEmail,
                    name: partner?.partner_name,
                  });
                  toast({ title: "Stripe customer created", description: stripeBillingEmail });
                  queryClient.invalidateQueries({ queryKey: ["stripe-partner", stripeBillingEmail] });
                } catch (e) {
                  toast({ variant: "destructive", title: "Failed to create customer", description: e?.message });
                } finally {
                  setCreatingCustomer(false);
                }
              }}
              className="ml-auto h-7 text-xs"
            >
              {creatingCustomer ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
              Create in Stripe
            </Button>
          </div>
        )}
        <DiscountCard
          partner={partnerEntity || base44Partner || partner}
          partnerId={base44PartnerId}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["partner-entity", partnerId] });
            queryClient.invalidateQueries({ queryKey: ["partner-by-name", partner?.partner_name] });
          }}
        />
      </div>

      {licenseSubOpen && (
        <SendLicenseSubscriptionModal
          open={licenseSubOpen}
          onClose={() => setLicenseSubOpen(false)}
          partner={partnerEntity || base44Partner || partner}
          stripeData={stripeData}
          onSuccess={() => {
            toast({ title: "License subscription sent", description: partner?.stripe_billing_email });
            queryClient.invalidateQueries({ queryKey: ["stripe-partner", stripeBillingEmail] });
          }}
        />
      )}

      {subInvoiceOpen && (
        <SendSubscriptionInvoiceModal
          open={subInvoiceOpen}
          onClose={() => setSubInvoiceOpen(false)}
          partner={partnerEntity || base44Partner || partner}
          properties={properties}
          stripeData={stripeData}
          onSuccess={(res) => {
            if (res?.scheduled) {
              toast({ title: "Subscription scheduled", description: `First invoice emails on ${new Date(res.scheduled_for).toLocaleDateString()} to ${partner?.stripe_billing_email || ""}` });
            } else {
              toast({ title: "Subscription invoice sent", description: partner?.stripe_billing_email });
            }
            queryClient.invalidateQueries({ queryKey: ["stripe-partner", stripeBillingEmail] });
          }}
        />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-white border border-gray-100">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="properties">{isHomeowner ? "Homes" : "Properties"} ({properties.filter(p => p.status === "active").length})</TabsTrigger>
          <TabsTrigger value="portal">Portal Management</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="media">Media ({media.length})</TabsTrigger>
          <TabsTrigger value="billing">Billing ({stripeData?.paid_invoices_count ?? billing.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
          {!isHomeowner && <TabsTrigger value="techstack">Tech Stack</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <PartnerOverviewTab
            partner={partner}
            properties={properties}
            documents={documents}
            billing={billing}
            tasks={tasks}
            onboarding={onboarding}
            isHomeowner={isHomeowner}
            memberSince={partnerEntity?.member_since}
            onUpdateMemberSince={async (val) => {
              await base44.entities.Partner.update(base44PartnerId, { member_since: val });
              queryClient.invalidateQueries({ queryKey: ["partner-entity", partnerId] });
              queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
            }}
          />
        </TabsContent>

        <TabsContent value="properties">
          <PartnerPropertiesTab properties={properties} partnerId={base44PartnerId} partner={partner} stripeData={stripeData} base44PartnerId={base44Partner?.id} />
        </TabsContent>

        <TabsContent value="portal">
          <PortalManagementTab partner={partner} properties={properties} partnerId={base44Partner?.id || partnerId} />
        </TabsContent>

        <TabsContent value="onboarding">
          <FunnelOnboardingTab partner={partnerEntity || partner} onboardingRow={partnerOnboardingRow} />
        </TabsContent>

        <TabsContent value="documents">
          <PartnerDocumentsTab items={documents} partnerId={partnerId} partnerName={partner?.partner_name} />
        </TabsContent>

        <TabsContent value="media">
          <RelatedEntitiesTab type="media" items={media} partnerId={partnerId} />
        </TabsContent>

        <TabsContent value="billing">
          <PartnerBillingTab billing={billing} stripeBillingEmail={stripeBillingEmail} stripeData={stripeData} isHomeowner={isHomeowner} />
        </TabsContent>

        <TabsContent value="tasks">
          <RelatedEntitiesTab type="tasks" items={tasks} partnerId={partnerId} />
        </TabsContent>

        <TabsContent value="notes">
          <PartnerNotesTab notes={notes} partnerId={partnerId} partnerName={partner?.partner_name} />
        </TabsContent>

        <TabsContent value="licenses">
          <LicensesTab partner={partner} properties={properties} partnerId={base44PartnerId} stripeData={stripeData} />
        </TabsContent>

        {!isHomeowner && (
          <TabsContent value="techstack">
            <TechStackTab partnerId={base44PartnerId} />
          </TabsContent>
        )}
      </Tabs>

      <PartnerFormModal
        open={editModal}
        onOpenChange={setEditModal}
        partner={{ ...partner, parent_partner_id: partnerEntity?.parent_partner_id, member_since: partnerEntity?.member_since }}
        onSave={async (data) => {
          const { parent_partner_id, member_since, tags, automated_billing, ...supabaseData } = data;
          const oldParentId = partnerEntity?.parent_partner_id || "";
          const newParentId = parent_partner_id || "";
          // Fallback partners have no Supabase row yet — the Supabase update would
          // 500 on Base44-only columns and abort the save. Skip it so the Base44
          // status write below actually runs (status is the only thing that
          // matters until the partner is synced to Supabase).
          if (!fromBase44Fallback) {
            await updateMutation.mutateAsync({ id: partner.id, data: supabaseData });
          }
          // Persist Base44-only fields (parent_partner_id, member_since, tags, automated_billing) + status
          await base44.entities.Partner.update(base44PartnerId, {
            parent_partner_id: newParentId || null,
            member_since: member_since || null,
            tags: tags || [],
            automated_billing: !!automated_billing,
            status: supabaseData.status,
          });
          if (oldParentId !== newParentId) {
            if (newParentId) {
              const parentResults = await base44.entities.Partner.filter({ id: newParentId });
              const parentName = parentResults?.[0]?.partner_name || "parent";
              toast({ title: `Set ${partner.partner_name} as a sub-brand of ${parentName}.` });
            } else {
              toast({ title: `Promoted ${partner.partner_name} to top-level partner.` });
            }
          }
          queryClient.invalidateQueries({ queryKey: ["partner-entity", partnerId] });
          queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
          queryClient.invalidateQueries({ queryKey: ["parent-partner"] });
          queryClient.invalidateQueries({ queryKey: ["all-partners-children", partnerId] });
          queryClient.invalidateQueries({ queryKey: ["base44-partners"] });
          queryClient.invalidateQueries({ queryKey: ["all-partners-subbrands"] });
        }}
      />

      <SendActivationEmailModal
        open={activationModalOpen}
        onOpenChange={setActivationModalOpen}
        partner={{
          id: base44Partner?.id || partnerId,
          partner_name: partner.partner_name,
          primary_contact_email: partner?.primary_contact_email || partnerEntity?.primary_contact_email,
        }}
      />
    </div>
    </RenderErrorBoundary>
  );
}