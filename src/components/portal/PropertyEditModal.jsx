import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { compressImage } from "@/lib/imageCompression";
import { X, Save, Send, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { usePortalPartnerRollup } from "@/hooks/usePortalPartnerRollup";
import AmenitiesEditor from "@/components/properties/AmenitiesEditor";
import MarketSelect from "../shared/MarketSelect";

const PROPERTY_TYPES = ["villa", "house", "condo", "estate", "cabin", "penthouse", "chalet", "farmhouse", "other"];
const AMENITY_OPTIONS = ["Private Pool", "Hot Tub", "Chef's Kitchen", "Ocean View", "Mountain View", "Private Beach", "Home Theater", "Gym", "Sauna", "Tennis Court", "Game Room", "EV Charger", "Fast WiFi", "Air Conditioning", "Fireplace", "BBQ", "Outdoor Dining", "Concierge", "Elevator", "Pet Friendly"];

export default function PropertyEditModal({ property, basePropertyId, user, onClose, onSubmitted, onSwitchToOffboarding }) {
  const { primaryPartnerId } = usePortalPartnerRollup(user);
  const [data, setData] = useState({
    property_name: property.property_name || "",
    address: property.address || "",
    market: property.market || "",
    property_type: property.property_type || "",
    bedrooms: property.bedrooms || "",
    bathrooms: property.bathrooms || "",
    sleeps: property.sleeps || "",
    listing_url: property.listing_url || "",
    internal_notes: property.internal_notes || "",
    // carry over any existing submission-style fields
    description: property.description || "",
    short_summary: property.short_summary || "",
    amenities: property.amenities || [],
    photo_urls: property.photo_urls || [],
    notes_to_team: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setData(d => ({ ...d, [key]: val }));

  const toggleAmenity = (a) => {
    set("amenities", data.amenities.includes(a) ? data.amenities.filter(x => x !== a) : [...data.amenities, a]);
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const compressed = await compressImage(file);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: compressed });
      urls.push(file_url);
    }
    set("photo_urls", [...(data.photo_urls || []), ...urls]);
    setUploading(false);
  };

  const handleSubmit = async (isDraft) => {
    console.log("[PropertyEditModal] handleSubmit called", { isDraft, propertyId: property.id, basePropertyId });
    setSaving(true);
    const partnerId = property.brand_partner_id || property.partner_id || primaryPartnerId || user.id;
    try {
      // Resolve a Base44 Property ID for source_property_id.
      // If none exists yet (property came from Supabase without a Base44 record), create a stub.
      let resolvedId = basePropertyId || property._submission?.source_property_id;
      if (!resolvedId && property.id && !/^\d+$/.test(String(property.id))) {
        resolvedId = property.id;
      }
      if (!resolvedId) {
        const created = await base44.entities.Property.create({
          partner_id: partnerId,
          partner_name: property.partner_name || user.full_name,
          property_name: data.property_name,
          supabase_property_id: String(property.id || ""),
          listing_url: data.listing_url,
          market: data.market,
        });
        resolvedId = created.id;
      }

      const sbId = property.supabase_property_id || (!basePropertyId ? String(property.id || "") : null);

      // Create a PropertySubmission as a change request for this Property
      await base44.entities.PropertySubmission.create({
        partner_id: partnerId,
        partner_name: property.partner_name || user.full_name,
        partner_email: user.email,
        property_name: data.property_name,
        property_type: data.property_type,
        location_full: data.address || data.market,
        location_city: data.market,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        sleeps: data.sleeps,
        listing_url: data.listing_url,
        description: data.description,
        short_summary: data.short_summary,
        amenities: data.amenities || [],
        photo_urls: data.photo_urls || [],
        notes_to_team: data.notes_to_team,
        admin_notes: `Edit request for existing Property ID: ${resolvedId}`,
        submission_type: "edit",
        source_property_id: resolvedId,
        supabase_property_id: sbId,
        status: isDraft ? "draft" : "submitted",
        ...(isDraft ? {} : { submitted_date: new Date().toISOString() }),
      });

      // Sync to Supabase (non-blocking — only safe confirmed columns)
      if (property.id) {
        try {
          await base44.functions.invoke("syncPropertyToSupabase", {
            action: "update",
            id: property.id,
            data: {
              property_name: data.property_name,
              listing_url: data.listing_url,
              market: data.market,
              bedrooms: data.bedrooms,
              bathrooms: data.bathrooms,
            },
          });
        } catch (e) {
          console.warn("Supabase sync failed (non-fatal):", e?.message);
        }
      }

      toast.success(isDraft ? "Draft saved." : "Edit request submitted. Our team will review within 24 hours.");
      onSubmitted?.();
      onClose();
    } catch (e) {
      console.error("[PropertyEditModal] submit failed", e);
      toast.error("Failed to submit edit request. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-[#0D1B2A]">Edit Property</h2>
            <p className="text-xs text-slate-500 mt-0.5">{property.property_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              Your edits will be submitted to our team for review and approval before any changes go live.
            </p>
          </div>

          {onSwitchToOffboarding && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Current status:</span>
              <span className={`px-2 py-0.5 rounded-full font-medium ${
                property.offboarding_status === 'temporary_offline' ? 'bg-amber-100 text-amber-700' :
                property.offboarding_status === 'scheduled' ? 'bg-orange-100 text-orange-700' :
                property.offboarding_status === 'terminated' ? 'bg-red-100 text-red-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                {property.offboarding_status === 'temporary_offline' ? 'Temporarily Offline' :
                 property.offboarding_status === 'scheduled' ? 'Scheduled to Offboard' :
                 property.offboarding_status === 'terminated' ? 'Terminated' :
                 'Active'}
              </span>
              <button type="button" onClick={onSwitchToOffboarding} className="text-[#C9A96E] hover:text-[#A68B4B] font-medium ml-1">
                Manage property status →
              </button>
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Basic Information</h3>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Property Name</label>
              <input value={data.property_name} onChange={e => set("property_name", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Property Type</label>
                <select value={data.property_type} onChange={e => set("property_type", e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white capitalize">
                  <option value="">Select type</option>
                  {PROPERTY_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Market / Location</label>
                <MarketSelect value={data.market} onChange={v => set("market", v)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Address</label>
              <input value={data.address} onChange={e => set("address", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[["Bedrooms", "bedrooms"], ["Bathrooms", "bathrooms"], ["Sleeps", "sleeps"]].map(([lbl, key]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">{lbl}</label>
                  <input type="number" value={data[key]} onChange={e => set(key, e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30" placeholder="0" />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Listing URL</label>
              <input value={data.listing_url} onChange={e => set("listing_url", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30" placeholder="https://…" />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</h3>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Short Summary</label>
              <textarea value={data.short_summary} onChange={e => set("short_summary", e.target.value)} rows={2}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 resize-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Full Description</label>
              <textarea value={data.description} onChange={e => set("description", e.target.value)} rows={4}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 resize-none" />
            </div>
          </div>

          {/* Amenities */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Amenities</h3>
            <AmenitiesEditor value={data.amenities || []} onChange={(v) => set("amenities", v)} />
          </div>

          {/* Photos */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Photos</h3>
            {data.photo_urls?.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {data.photo_urls.map((url, i) => (
                  <div key={i} className="relative group aspect-video">
                    <img src={url} className="w-full h-full object-cover rounded-lg" alt="" />
                    <button
                      type="button"
                      onClick={() => set("photo_urls", data.photo_urls.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-5 cursor-pointer hover:border-[#C9A96E]/50 hover:bg-slate-50 transition-all text-sm text-slate-500">
              <Upload className="w-4 h-4 text-slate-400" />
              {uploading ? "Optimizing…" : "Upload photos"}
              <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-1.5">Notes to Review Team</label>
            <textarea value={data.notes_to_team} onChange={e => set("notes_to_team", e.target.value)} rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 resize-none"
              placeholder="Anything you'd like our team to know about these changes?" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <button onClick={() => handleSubmit(true)} disabled={saving}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm px-5 py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">
            <Save className="w-4 h-4" /> Save as Draft
          </button>
          <button onClick={() => handleSubmit(false)} disabled={saving || !data.property_name}
            className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-[#1a2e45] disabled:opacity-40 transition-colors">
            <Send className="w-4 h-4" /> {saving ? "Submitting…" : "Submit for Approval"}
          </button>
        </div>
      </div>
    </div>
  );
}