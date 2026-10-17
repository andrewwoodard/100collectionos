import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { uploadPropertyImage } from "@/lib/propertyImagesBlob";
import MarketSelect from "@/components/shared/MarketSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Building2, Loader2, Save, User, Upload, ImagePlus, Mail, Phone, Globe,
} from "lucide-react";

const EMPTY = {
  display_name: "",
  title: "",
  company_name: "",
  market: "",
  website_url: "",
  personal_phone: "",
  reservation_phone: "",
  reservation_email: "",
  about_bio: "",
  company_bio: "",
  profile_photo_url: "",
  company_logo_url: "",
  partner_email: "",
  partner_name: "",
  profile_status: "draft",
};

function pickPrimaryOwner(team, partner) {
  const members = team?.teamMembers || [];
  const primaryEmail = String(
    team?.partner?.primary_contact_email || partner?.primary_contact_email || ""
  ).trim().toLowerCase();
  const portalUserId = team?.partner?.portal_user_id || partner?.portal_user_id;

  if (portalUserId) {
    const byId = members.find((m) => String(m.id) === String(portalUserId));
    if (byId) return byId;
  }
  if (primaryEmail) {
    const byEmail = members.find((m) => String(m.email || "").trim().toLowerCase() === primaryEmail);
    if (byEmail) return byEmail;
  }
  const owner = members.find((m) => (m.partner_role || "owner") === "owner");
  return owner || members[0] || null;
}

function defaultsFromPartner(partner, owner) {
  return {
    ...EMPTY,
    partner_email: owner?.email || partner?.primary_contact_email || "",
    partner_name: partner?.partner_name || "",
    display_name: owner?.full_name || partner?.primary_contact_name || "",
    company_name: partner?.company_name || partner?.partner_name || "",
    market: partner?.market || "",
    personal_phone: partner?.primary_contact_phone || "",
    reservation_phone: partner?.primary_contact_phone || "",
    reservation_email: partner?.primary_contact_email || "",
    company_logo_url: partner?.logo_url || "",
    profile_status: "draft",
  };
}

async function syncPartnerProfileToSupabase(profileId, data, sbProfileId) {
  const payload = {
    partner_email: data.partner_email,
    partner_name: data.partner_name || data.display_name || data.company_name,
    display_name: data.display_name,
    title: data.title,
    company_name: data.company_name,
    market: data.market,
    website_url: data.website_url,
    about_bio: data.about_bio,
    company_bio: data.company_bio,
    personal_phone: data.personal_phone,
    reservation_phone: data.reservation_phone,
    reservation_email: data.reservation_email,
    profile_photo_url: data.profile_photo_url,
    company_logo_url: data.company_logo_url,
    favorite_restaurants: data.favorite_restaurants,
    favorite_breweries: data.favorite_breweries,
    favorite_bakery: data.favorite_bakery,
    favorite_shops: data.favorite_shops,
    favorite_things_to_do: data.favorite_things_to_do,
    profile_status: data.profile_status || "draft",
  };
  if (sbProfileId) {
    await base44.functions.invoke("supabaseData", {
      table: "partner_profiles",
      action: "update",
      id: sbProfileId,
      data: payload,
    });
    return sbProfileId;
  }
  const res = await base44.functions.invoke("supabaseData", {
    table: "partner_profiles",
    action: "create",
    data: payload,
  });
  const newSbId = res.data?.item?.id;
  if (newSbId && profileId) {
    await base44.entities.PartnerProfile.update(profileId, { supabase_profile_id: String(newSbId) });
  }
  return newSbId || null;
}

function ImageSlot({ label, hint, value, loading, onUpload, onClear }) {
  return (
    <div>
      <Label className="text-xs text-gray-600 mb-1.5 block">{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            className="w-16 h-16 rounded-lg object-cover border border-gray-100 bg-white"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-300">
            <ImagePlus className="w-5 h-5" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C9A96E] hover:underline cursor-pointer">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {value ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={loading}
              onChange={onUpload}
            />
          </label>
          {value && (
            <button type="button" onClick={onClear} className="text-[11px] text-gray-400 hover:text-red-500 text-left">
              Remove
            </button>
          )}
          {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * Admin Partner Detail card: edit public partner profile (headshot, logo, identity).
 * Defaults from the primary owner's PartnerProfile when present; otherwise from
 * the Partner record / primary owner user.
 */
export default function PartnerProfileAdminCard({ partner, partnerId }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: team } = useQuery({
    queryKey: ["partner-team", partnerId],
    queryFn: async () => {
      const res = await base44.functions.invoke("getPartnerTeam", { partner_id: partnerId });
      return res.data;
    },
    enabled: !!partnerId,
  });

  const primaryOwner = useMemo(() => pickPrimaryOwner(team, partner), [team, partner]);
  const ownerEmail = String(
    primaryOwner?.email || partner?.primary_contact_email || ""
  ).trim();

  const { data: profiles = [], isLoading: loadingProfile } = useQuery({
    queryKey: ["admin-partner-profile", ownerEmail.toLowerCase()],
    queryFn: () => base44.entities.PartnerProfile.filter({ partner_email: ownerEmail }),
    enabled: !!ownerEmail,
  });
  const profile = profiles[0] || null;

  useEffect(() => {
    setInitialized(false);
  }, [partnerId, ownerEmail]);

  useEffect(() => {
    if (initialized || loadingProfile) return;
    if (ownerEmail && !profile && profiles === undefined) return;

    const base = defaultsFromPartner(partner, primaryOwner);
    if (profile) {
      setForm({
        ...base,
        ...profile,
        partner_email: profile.partner_email || base.partner_email,
        partner_name: profile.partner_name || base.partner_name,
        display_name: profile.display_name || base.display_name,
        company_name: profile.company_name || base.company_name,
        market: profile.market || base.market,
        company_logo_url: profile.company_logo_url || partner?.logo_url || "",
        profile_photo_url: profile.profile_photo_url || "",
      });
    } else {
      setForm(base);
    }
    setInitialized(true);
  }, [initialized, loadingProfile, profile, profiles, partner, primaryOwner, ownerEmail]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        partner_email: data.partner_email || ownerEmail,
        partner_name: data.partner_name || partner?.partner_name || data.company_name,
        profile_status: data.profile_status || profile?.profile_status || "draft",
      };

      let saved;
      if (profile?.id) {
        saved = await base44.entities.PartnerProfile.update(profile.id, payload);
      } else {
        saved = await base44.entities.PartnerProfile.create(payload);
      }
      const profileId = profile?.id || saved?.id;

      await syncPartnerProfileToSupabase(
        profileId,
        payload,
        profile?.supabase_profile_id || saved?.supabase_profile_id
      ).catch((e) => console.warn("[PartnerProfileAdminCard] supabase sync", e?.message));

      // Keep Partner entity in sync for list logos / contact identity
      if (partnerId) {
        const partnerPatch = {};
        if (payload.company_logo_url) partnerPatch.logo_url = payload.company_logo_url;
        if (payload.display_name) partnerPatch.primary_contact_name = payload.display_name;
        if (payload.company_name) partnerPatch.company_name = payload.company_name;
        if (payload.market) partnerPatch.market = payload.market;
        if (payload.personal_phone || payload.reservation_phone) {
          partnerPatch.primary_contact_phone = payload.reservation_phone || payload.personal_phone;
        }
        if (Object.keys(partnerPatch).length) {
          await base44.entities.Partner.update(partnerId, partnerPatch);
        }
      }

      // Push branding + owner favorites to public destination (vrms)
      if (profileId) {
        base44.functions
          .invoke("syncPartnerProfileToVrms", {
            profileId,
            partnerId,
            partnerEmail: payload.partner_email,
          })
          .catch((e) => console.warn("[PartnerProfileAdminCard] vrms sync", e?.message));
      }

      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partner-profile", ownerEmail.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ["partner-entity", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["vrm-content", partner?.partner_name] });
      toast({ title: "Partner profile saved" });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e?.message || "Could not save partner profile.",
      });
    },
  });

  const handleUpload = async (e, field) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      toast({ variant: "destructive", title: "Please choose an image file" });
      return;
    }
    const setLoading = field === "profile_photo_url" ? setUploadingPhoto : setUploadingLogo;
    setLoading(true);
    try {
      const file_url = await uploadPropertyImage(file);
      setForm((f) => ({ ...f, [field]: file_url }));
      toast({ title: field === "profile_photo_url" ? "Profile photo uploaded" : "Logo uploaded" });
    } catch (err) {
      toast({ variant: "destructive", title: "Upload failed", description: err?.message });
    } finally {
      setLoading(false);
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            Partner Profile & Branding
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            Defaults from the primary owner
            {primaryOwner?.full_name || primaryOwner?.email
              ? ` (${primaryOwner.full_name || primaryOwner.email})`
              : ownerEmail
                ? ` (${ownerEmail})`
                : ""}
            . Logo and headshot appear on the public destination page.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending || !ownerEmail}
          className="bg-[#0D1B2A] hover:bg-[#1a2d42] text-white"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1.5" />
          )}
          Save profile
        </Button>
      </div>

      {!ownerEmail ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Set a primary contact email on this partner to manage their profile.
        </p>
      ) : loadingProfile && !initialized ? (
        <div className="h-24 animate-pulse bg-gray-50 rounded-lg" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <ImageSlot
              label="Profile / Headshot"
              hint="Primary owner photo"
              value={form.profile_photo_url}
              loading={uploadingPhoto}
              onUpload={(e) => handleUpload(e, "profile_photo_url")}
              onClear={() => setForm((f) => ({ ...f, profile_photo_url: "" }))}
            />
            <ImageSlot
              label="Company Logo"
              hint="Brand logo for lists & destination page"
              value={form.company_logo_url}
              loading={uploadingLogo}
              onUpload={(e) => handleUpload(e, "company_logo_url")}
              onClear={() => setForm((f) => ({ ...f, company_logo_url: "" }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Display name</Label>
              <Input value={form.display_name || ""} onChange={set("display_name")} placeholder="Primary owner name" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Title</Label>
              <Input value={form.title || ""} onChange={set("title")} placeholder="e.g. Founder & CEO" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Company name
              </Label>
              <Input value={form.company_name || ""} onChange={set("company_name")} placeholder="Company or brand" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Market / Destination</Label>
              <MarketSelect
                value={form.market || ""}
                onChange={(val) => setForm((f) => ({ ...f, market: val }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                placeholder="Select market"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block flex items-center gap-1">
                <Mail className="w-3 h-3" /> Profile email
              </Label>
              <Input value={form.partner_email || ""} onChange={set("partner_email")} placeholder="owner@company.com" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block flex items-center gap-1">
                <Globe className="w-3 h-3" /> Website
              </Label>
              <Input value={form.website_url || ""} onChange={set("website_url")} placeholder="https://" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block flex items-center gap-1">
                <Phone className="w-3 h-3" /> Personal phone
              </Label>
              <Input value={form.personal_phone || ""} onChange={set("personal_phone")} />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block flex items-center gap-1">
                <Phone className="w-3 h-3" /> Reservation phone
              </Label>
              <Input value={form.reservation_phone || ""} onChange={set("reservation_phone")} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-gray-600 mb-1 block">Personal bio</Label>
              <Textarea
                rows={3}
                value={form.about_bio || ""}
                onChange={set("about_bio")}
                placeholder="About the primary owner…"
                className="resize-none"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-gray-600 mb-1 block">Company bio</Label>
              <Textarea
                rows={3}
                value={form.company_bio || ""}
                onChange={set("company_bio")}
                placeholder="About the company…"
                className="resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
