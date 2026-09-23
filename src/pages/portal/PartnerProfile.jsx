import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/useCurrentUser";
import PortalLayout from "@/components/portal/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  User, Building2, MapPin, Utensils, Beer, Coffee,
  ShoppingBag, Star, FileText, Upload, CheckCircle, Eye, Edit3, Phone, Mail, Globe
} from "lucide-react";
import StatusPill from "@/components/shared/StatusPill";
import MarketSelect from "@/components/shared/MarketSelect";
import DestinationContentCard from "@/components/portal/DestinationContentCard";
import BiometricEnrollmentCard from "@/components/auth/BiometricEnrollmentCard";
import { usePortalPartnerRollup } from "@/hooks/usePortalPartnerRollup";

// ── Preview Pane ────────────────────────────────────────────────────────────────
function ProfilePreview({ form }) {
  const {
    display_name, title, company_name, market, about_bio, company_bio,
    profile_photo_url, company_logo_url, website_url,
    favorite_restaurants, favorite_breweries, favorite_bakery,
    favorite_shops, favorite_things_to_do,
  } = form;

  const favorites = [
    { icon: Utensils, label: "Restaurants", value: favorite_restaurants },
    { icon: Beer, label: "Breweries & Bars", value: favorite_breweries },
    { icon: Coffee, label: "Bakery & Café", value: favorite_bakery },
    { icon: ShoppingBag, label: "Shops", value: favorite_shops },
    { icon: Star, label: "Things to Do", value: favorite_things_to_do },
  ].filter(f => f.value?.trim());

  return (
    <div className="bg-[#F8F5EE] min-h-full rounded-2xl overflow-hidden border border-[#E8D9B8] shadow-sm">
      {/* Hero */}
      <div className="bg-[#0D1B2A] px-8 py-10 flex flex-col items-center text-center">
        {profile_photo_url ? (
          <img
            src={profile_photo_url}
            alt={display_name || "Partner"}
            className="w-24 h-24 rounded-full object-cover border-4 border-[#C9A96E]/40 mb-4 shadow-lg"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-[#1E293B] border-4 border-[#C9A96E]/20 mb-4 flex items-center justify-center">
            <User className="w-10 h-10 text-[#C9A96E]/40" />
          </div>
        )}
        {company_logo_url && (
          <img src={company_logo_url} alt="Logo" className="h-8 object-contain mb-4 opacity-90" />
        )}
        <h1
          className="text-3xl text-white mb-1"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
        >
          {display_name || <span className="opacity-30 italic">Your Name</span>}
        </h1>
        {title && (
          <p className="text-[#C9A96E] text-sm font-medium mb-1">{title}</p>
        )}
        {(company_name || market) && (
          <p className="text-slate-400 text-xs mt-1">
            {[company_name, market].filter(Boolean).join(" · ")}
          </p>
        )}
        {website_url && (
          <a href={website_url} target="_blank" rel="noopener noreferrer"
            className="text-[#C9A96E]/70 text-xs mt-2 hover:text-[#C9A96E] transition-colors underline underline-offset-2">
            {website_url.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>

      {/* Gold divider */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-[#C9A96E]/60 to-transparent" />

      {/* Body */}
      <div className="px-8 py-8 space-y-8">
        {/* About */}
        {(about_bio || company_bio) ? (
          <div className="space-y-4">
            <div className="text-[10px] font-bold text-[#C9A96E] uppercase tracking-[0.18em]">About</div>
            {about_bio && <p className="text-[#3D2B1F] text-sm leading-relaxed">{about_bio}</p>}
            {company_bio && (
              <div>
                <div className="text-[10px] font-semibold text-[#8B6A2E] uppercase tracking-wide mb-1">{company_name || "The Company"}</div>
                <p className="text-[#3D2B1F] text-sm leading-relaxed">{company_bio}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-300 text-sm italic text-center py-4">
            Your bio will appear here…
          </div>
        )}

        {/* Local Favorites */}
        {favorites.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-[#C9A96E] uppercase tracking-[0.18em] mb-4">Local Favorites</div>
            <div className="grid grid-cols-1 gap-3">
              {favorites.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 bg-white/60 rounded-xl px-4 py-3 border border-[#E8D9B8]">
                  <div className="w-7 h-7 rounded-lg bg-[#C9A96E]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-[#C9A96E]" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#8B6A2E] uppercase tracking-wide mb-0.5">{label}</div>
                    <div className="text-xs text-[#3D2B1F] leading-relaxed">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {favorites.length === 0 && !about_bio && (
          <div className="text-center py-8">
            <MapPin className="w-8 h-8 text-[#C9A96E]/30 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Fill in the form to see your live preview</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 py-4 border-t border-[#E8D9B8] text-center">
        <p className="text-[10px] text-[#C9A96E]/60 uppercase tracking-widest">The 100 Collection</p>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function PartnerProfile() {
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  const { primaryPartner } = usePortalPartnerRollup(user);
  const [form, setForm] = useState({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [mobileTab, setMobileTab] = useState("edit"); // "edit" | "preview"
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["partner-profile", user?.email],
    queryFn: () => base44.entities.PartnerProfile.filter({ partner_email: user.email }),
    enabled: !!user?.email,
  });

  const profile = profiles[0];

  useEffect(() => {
    if (profile) setForm(profile);
    else if (user) setForm({ partner_email: user.email, profile_status: "draft" });
  }, [profile, user]);

  const syncToSupabase = async (profileId, data, sbProfileId) => {
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
      profile_status: data.profile_status,
    };
    if (sbProfileId) {
      await base44.functions.invoke("supabaseData", { table: "partner_profiles", action: "update", id: sbProfileId, data: payload });
    } else {
      const res = await base44.functions.invoke("supabaseData", { table: "partner_profiles", action: "create", data: payload });
      const newSbId = res.data?.item?.id;
      if (newSbId && profileId) {
        await base44.entities.PartnerProfile.update(profileId, { supabase_profile_id: String(newSbId) });
      }
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      let saved;
      if (profile?.id) {
        saved = await base44.entities.PartnerProfile.update(profile.id, data);
      } else {
        saved = await base44.entities.PartnerProfile.create(data);
      }
      syncToSupabase(profile?.id || saved?.id, data, profile?.supabase_profile_id).catch(e => console.warn("Supabase sync failed:", e?.message));
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["partner-profile"]);
      toast.success("Profile updated. Changes will appear on theonehundredcollection.com within 24 hours.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const data = { ...form, profile_status: "submitted" };
      let saved;
      if (profile?.id) {
        saved = await base44.entities.PartnerProfile.update(profile.id, data);
      } else {
        saved = await base44.entities.PartnerProfile.create(data);
      }
      syncToSupabase(profile?.id || saved?.id, data, profile?.supabase_profile_id).catch(e => console.warn("Supabase sync failed:", e?.message));
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["partner-profile"]);
      toast.success("Profile submitted. Changes will appear on theonehundredcollection.com within 24 hours after admin review.");
    },
  });

  const handleUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    if (field === "profile_photo_url") setUploadingPhoto(true);
    else setUploadingLogo(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, [field]: file_url }));
    if (field === "profile_photo_url") setUploadingPhoto(false);
    else setUploadingLogo(false);
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const statusVariant = { draft: "neutral", submitted: "warning", published: "success" };
  const statusLabel = { draft: "Draft", submitted: "Under Review", published: "Published" };

  // Completeness meter calculation
  const completeness = React.useMemo(() => {
    const sections = [
      { id: "photo",    label: "Add a profile photo",    weight: 25, met: !!form.profile_photo_url },
      { id: "logo",     label: "Upload your company logo", weight: 10, met: !!form.company_logo_url },
      { id: "identity", label: "Complete your identity fields", weight: 25,
        met: !!(form.display_name && form.title && form.company_name && form.market && form.website_url) },
      { id: "bio",      label: "Write your bio (50+ characters)", weight: 20, met: (form.about_bio?.length || 0) >= 50 },
      { id: "favorites", label: "Add at least 3 local favorites", weight: 20,
        met: [form.favorite_restaurants, form.favorite_breweries, form.favorite_bakery, form.favorite_shops, form.favorite_things_to_do].filter(v => v?.trim()).length >= 3 },
    ];
    const score = sections.filter(s => s.met).reduce((acc, s) => acc + s.weight, 0);
    const unmet = sections.filter(s => !s.met).slice(0, 2);
    return { score, sections, unmet };
  }, [form]);

  const hasUnsavedChanges = useMemo(() => {
    if (!profile) return Object.keys(form).filter(k => k !== 'partner_email' && k !== 'profile_status' && form[k]).length > 0;
    const skip = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'supabase_profile_id']);
    const keys = new Set([...Object.keys(profile), ...Object.keys(form)]);
    for (const k of keys) {
      if (skip.has(k)) continue;
      if ((profile[k] ?? '') !== (form[k] ?? '')) return true;
    }
    return false;
  }, [form, profile]);

  const livePageUrl = form.market
    ? `https://theonehundredcollection.com/destinations/${form.market.toLowerCase().trim().replace(/\s+/g, '-')}`
    : "https://theonehundredcollection.com";

  if (isLoading || isLoadingUser || !user) return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-32 mb-5" />
            <div className="space-y-3">
              <div className="h-9 bg-slate-50 rounded-lg w-full" />
              <div className="h-9 bg-slate-50 rounded-lg w-full" />
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );

  const formContent = (
    <div className="space-y-6">
      {/* Photos */}
      <Section icon={<User className="w-4 h-4" />} title="Photos">
        <div className="grid grid-cols-2 gap-6">
          <UploadField
            label="Profile / Headshot Photo"
            value={form.profile_photo_url}
            loading={uploadingPhoto}
            onChange={(e) => handleUpload(e, "profile_photo_url")}
            hint="Your personal headshot"
          />
          <UploadField
            label="Company Logo"
            value={form.company_logo_url}
            loading={uploadingLogo}
            onChange={(e) => handleUpload(e, "company_logo_url")}
            hint="Your company or brand logo"
          />
        </div>
      </Section>

      {/* Identity */}
      <Section icon={<Building2 className="w-4 h-4" />} title="Your Identity">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full Name" placeholder="Your full name" value={form.display_name || ""} onChange={set("display_name")} />
          <Field label="Title" placeholder="e.g. Founder & CEO" value={form.title || ""} onChange={set("title")} />
          <Field label="Company Name" placeholder="Your company or brand name" value={form.company_name || ""} onChange={set("company_name")} />
          <div>
            <Label className="text-sm text-slate-700 mb-1.5 block">Market / Destination</Label>
            <MarketSelect value={form.market || ""} onChange={(val) => setForm(f => ({ ...f, market: val }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="Select market" />
          </div>
          <div className="col-span-2">
            <Field label="Website URL" placeholder="https://yoursite.com" value={form.website_url || ""} onChange={set("website_url")} />
          </div>
          <IconField icon={<Phone className="w-4 h-4 text-slate-400" />} label="Personal Phone" placeholder="(555) 555-0100" value={form.personal_phone || ""} onChange={set("personal_phone")} />
          <IconField icon={<Phone className="w-4 h-4 text-slate-400" />} label="Reservation Phone" placeholder="(555) 555-0200" value={form.reservation_phone || ""} onChange={set("reservation_phone")} />
          <div className="col-span-2">
            <IconField icon={<Mail className="w-4 h-4 text-slate-400" />} label="Reservation Email" placeholder="e.g. reservations@yourcompany.com" value={form.reservation_email || ""} onChange={set("reservation_email")} />
          </div>
        </div>
      </Section>

      {/* About Bio */}
      <Section icon={<FileText className="w-4 h-4" />} title="About You">
        <div className="space-y-5">
          <div>
            <Label className="text-sm text-slate-700 mb-1.5 block">Personal Bio</Label>
            <Textarea
              placeholder="Tell guests about yourself — your background, connection to the area, what makes your collection special..."
              value={form.about_bio || ""}
              onChange={set("about_bio")}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">This appears in the "About" section of your public profile.</p>
          </div>
          <div>
            <Label className="text-sm text-slate-700 mb-1.5 block">Company Bio</Label>
            <Textarea
              placeholder="Tell guests about your property management company — your mission, portfolio, and what sets you apart..."
              value={form.company_bio || ""}
              onChange={set("company_bio")}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">This appears in the "About" section alongside your personal bio.</p>
          </div>
        </div>
      </Section>

      {/* Local Favorites */}
      <Section icon={<MapPin className="w-4 h-4" />} title="Local Favorites">
        <p className="text-sm text-slate-500 mb-4">Share your favorite local spots — displayed on your profile to help guests feel like insiders.</p>
        <div className="space-y-4">
          <IconField icon={<Utensils className="w-4 h-4 text-slate-400" />} label="Favorite Restaurants" placeholder="e.g. Local seafood spot, fine dining restaurant" value={form.favorite_restaurants || ""} onChange={set("favorite_restaurants")} />
          <IconField icon={<Beer className="w-4 h-4 text-slate-400" />} label="Favorite Breweries / Bars" placeholder="e.g. Neighborhood brewery, cocktail bar" value={form.favorite_breweries || ""} onChange={set("favorite_breweries")} />
          <IconField icon={<Coffee className="w-4 h-4 text-slate-400" />} label="Favorite Bakery / Cafe" placeholder="e.g. Local bakery, morning coffee spot" value={form.favorite_bakery || ""} onChange={set("favorite_bakery")} />
          <IconField icon={<ShoppingBag className="w-4 h-4 text-slate-400" />} label="Favorite Shops" placeholder="e.g. Boutique, surf shop, gallery" value={form.favorite_shops || ""} onChange={set("favorite_shops")} />
          <IconField icon={<Star className="w-4 h-4 text-slate-400" />} label="Favorite Things to Do" placeholder="e.g. Beach, hiking, local attractions" value={form.favorite_things_to_do || ""} onChange={set("favorite_things_to_do")} />
        </div>
      </Section>

      {/* Biometric Login enrollment */}
      <BiometricEnrollmentCard />

      {/* Destination Page Content (partner text, destination text, partner bio) */}
      {primaryPartner?.partner_name && (
        <DestinationContentCard partnerName={primaryPartner.partner_name} market={form.market} />
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button variant="outline" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save Draft"}
        </Button>
        {form.profile_status !== "published" && (
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !form.display_name || !form.about_bio}
            className="bg-[#0F172A] hover:bg-[#1E293B] text-white"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {submitMutation.isPending ? "Submitting..." : "Submit for Review"}
          </Button>
        )}
        {form.profile_status === "published" && (
          <StatusPill variant="success" label="Profile Published" />
        )}
      </div>
      <p className="text-xs text-slate-400 mt-3">Saved changes typically appear on your public destination page within 24 hours after admin review.</p>
    </div>
  );

  return (
    <PortalLayout>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Partner Portal</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Partner Profile</h1>
          <p className="text-slate-400 text-sm mt-0.5">Build your public profile on The 100 Collection website.</p>
        </div>
        <div className="flex items-center gap-3">
          {form.profile_status && (
            <StatusPill
              variant={statusVariant[form.profile_status] || "neutral"}
              label={statusLabel[form.profile_status] || form.profile_status}
            />
          )}
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !hasUnsavedChanges}
            className="bg-[#0F172A] hover:bg-[#1E293B] text-white"
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && !saveMutation.isPending && !submitMutation.isPending && (
        <div className="flex items-center gap-2 text-xs text-orange-600 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          You have unsaved changes
        </div>
      )}

      {/* Public profile callout */}
      <div className="rounded-2xl border-l-[3px] border-[#C9A96E] bg-[#FAFAF8] p-5 mb-6 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-[#C9A96E]/10 flex items-center justify-center flex-shrink-0">
          <Globe className="w-4 h-4 text-[#C9A96E]" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[#0D1B2A] mb-1">This is your public profile</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Changes you make here are reflected on your partner page at theonehundredcollection.com. Take a moment to review your headshot, bio, and local recommendations — this is what future guests and industry partners see when they discover you.
          </p>
          <div className="flex justify-end mt-2">
            <a href={livePageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A96E] hover:text-[#A68B4B] font-medium">
              View your live page →
            </a>
          </div>
        </div>
      </div>

      {/* Completeness meter */}
      {completeness.score < 100 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-[#0D1B2A]">Your profile is {completeness.score}% complete</span>
            <span className="text-xs text-slate-400">{completeness.score}/100</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
            <div
              className="h-2 rounded-full bg-[#C9A96E] transition-all duration-500"
              style={{ width: `${completeness.score}%` }}
            />
          </div>
          {completeness.unmet.length > 0 && (
            <ul className="space-y-1.5">
              {completeness.unmet.map(item => (
                <li key={item.id} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-1 h-1 rounded-full bg-[#C9A96E] flex-shrink-0" />
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Your profile is ready! 🎉</p>
            <p className="text-xs text-emerald-600 mt-0.5">Submit it for review when you're happy with the preview.</p>
          </div>
          {form.profile_status !== "published" && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex items-center gap-2 bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              {submitMutation.isPending ? "Submitting…" : "Submit for Review"}
            </button>
          )}
        </div>
      )}

      {/* Mobile Tab Toggle (< lg) */}
      <div className="lg:hidden flex gap-2 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setMobileTab("edit")}
          data-impersonation-exempt
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mobileTab === "edit" ? "bg-white shadow-sm text-[#0D1B2A]" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Edit3 className="w-3.5 h-3.5" /> Edit
        </button>
        <button
          onClick={() => setMobileTab("preview")}
          data-impersonation-exempt
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mobileTab === "preview" ? "bg-white shadow-sm text-[#0D1B2A]" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Preview
        </button>
      </div>

      {/* Layout: split-pane on lg+, single-pane on mobile */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
        {/* Left — Form */}
        <div className={mobileTab === "preview" ? "hidden lg:block" : "block"}>
          {formContent}
        </div>

        {/* Right — Live Preview */}
        <div className={`lg:sticky lg:top-6 ${mobileTab === "edit" ? "hidden lg:block" : "block"}`}>
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-[#C9A96E]" />
            <span className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest">Live Preview</span>
            <span className="text-xs text-slate-400 ml-1">Updates as you type</span>
          </div>
          <ProfilePreview form={form} />
        </div>
      </div>
    </PortalLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function Section({ icon, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">{icon}</div>
        <h2 className="font-medium text-slate-900 font-sans text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, placeholder, value, onChange }) {
  return (
    <div>
      <Label className="text-sm text-slate-700 mb-1.5 block">{label}</Label>
      <Input placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  );
}

function IconField({ icon, label, placeholder, value, onChange }) {
  return (
    <div>
      <Label className="text-sm text-slate-700 mb-1.5 flex items-center gap-1.5">{icon}{label}</Label>
      <Input placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  );
}

function UploadField({ label, value, loading, onChange, hint }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = React.useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    onChange({ target: { files: [file] } });
  };

  return (
    <div>
      <Label className="text-sm text-slate-700 mb-1.5 block">{label}</Label>
      {value ? (
        <div className="relative group">
          <img src={value} alt={label} className="w-full h-32 object-cover rounded-lg border border-slate-200" />
          <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg cursor-pointer">
            <span className="text-white text-xs font-medium">Change</span>
            <input type="file" accept="image/*" className="hidden" onChange={onChange} />
          </label>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            dragging ? "border-[#C9A96E] bg-[#C9A96E]/5" : "border-slate-200 bg-slate-50 hover:border-slate-400"
          }`}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          ) : (
            <>
              <Upload className={`w-5 h-5 mb-1 ${dragging ? "text-[#C9A96E]" : "text-slate-400"}`} />
              <span className="text-xs text-slate-500">Drop image here or <span className="underline">browse</span></span>
            </>
          )}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} disabled={loading} />
        </div>
      )}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}