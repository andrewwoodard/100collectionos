import { base44 } from "@/api/base44Client";
import { newPropertyRow } from "@/components/apply/SubmittedPropertiesFields";
import { getAttributionSnapshot } from "@/lib/attribution";

export const HOW_HEARD = ["Referral", "Google Search", "Social Media", "Industry Event", "Email", "Other"];
export const PM_PROP_COUNTS = ["5–10", "11–20", "21–50", "51–100", "100+"];

export const INPUT_CLS =
  "w-full px-4 py-3 bg-white border border-[#D9C8B4] rounded-lg text-[#1a1a1a] text-sm placeholder-[#B0A090] focus:outline-none focus:border-[#C9A96E] focus:ring-2 focus:ring-[#C9A96E]/20 transition-all";
export const LABEL_CLS =
  "text-[11px] font-semibold text-[#8B7355] uppercase tracking-widest mb-1.5 block";

export const FEATURED_PARTNERS = [
  { destination: "Turks & Caicos", partner: "TKCA Villas", url: "https://theonehundredcollection.com/destinations/turks-and-caicos", img: "https://media.base44.com/images/public/69aee092656fb9813439389b/db5556f1a_TKCA.jpg" },
  { destination: "Park City", partner: "Abode", url: "https://theonehundredcollection.com/destinations/park-city", img: "https://media.base44.com/images/public/69aee092656fb9813439389b/cb6394351_Abode.jpg" },
  { destination: "Kiawah Island", partner: "Akers Ellis", url: "https://theonehundredcollection.com/destinations/kiawah-island", img: "https://media.base44.com/images/public/69aee092656fb9813439389b/0add94df2_AkersEllis.jpg" },
  { destination: "South Walton", partner: "Scenic Stays", url: "https://theonehundredcollection.com/destinations/south-walton-florida", img: "https://media.base44.com/images/public/69aee092656fb9813439389b/2cf350246_ScenicStays.jpg" },
];

export function normalizeUrl(val) {
  const v = (val || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

export function initialForm() {
  return {
    full_name: "", email: "", company_name: "", phone: "", website: "",
    property_count: "", property_locations: "", how_heard: "", message: "",
    property_address: "", listing_url: "", role: "",
    has_direct_booking_website: null,
    direct_booking_website: "",
    social_media_links: [{ platform: "", platform_other: "", url: "" }],
    submitted_properties: [newPropertyRow()],
  };
}

// Resolves a valid admin notification email. Prefers the first entry in the
// ADMIN_NOTIFICATION_LIST AppConfig value; falls back to a known admin address.
export async function resolveAdminNotificationEmail() {
  try {
    const rows = await base44.entities.AppConfig.filter({ key: "ADMIN_NOTIFICATION_LIST" });
    const raw = rows?.[0]?.value || "";
    const first = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)[0];
    if (first && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first)) return first;
  } catch (e) { /* non-blocking */ }
  return "buck@theonehundredcollection.com";
}

// Shared submission handler for all three application tracks.
// Sends the application through the submitPartnerApplication backend
// function, which runs the layered spam defense (honeypot, timing, content
// scoring, IP rate limiting) before creating any record. Bot submissions
// are silently rejected there and come back as a normal-looking success so
// bots never learn they were caught. Real applicants get real success.
// Returns the application id (real or, for bots, a decoy).
export async function submitApplication(form, track, meta = {}) {
  const attribution = getAttributionSnapshot();
  const sourceLabel = attribution?.source_label || "Unknown (pre-tracking)";
  const honeypotEl = typeof document !== "undefined"
    ? document.querySelector('input[name="website_url_confirm"]')
    : null;
  const honeypot = (meta.honeypot || honeypotEl?.value || "").toString();

  let payload;
  if (track === "existing_partner_access_request") {
    const rolePrefix = form.role ? `[Role: ${form.role}] ` : "";
    payload = {
      full_name: form.full_name,
      email: form.email,
      company_name: form.company_name,
      message: rolePrefix + (form.message || ""),
      applicant_type: track,
      source_label: sourceLabel,
      attribution,
    };
  } else {
    const social_media_links = (form.social_media_links || [])
      .map((r) => ({ ...r, url: normalizeUrl(r.url) }))
      .filter((r) => r.url);
    payload = {
      ...form,
      website: normalizeUrl(form.website),
      direct_booking_website: normalizeUrl(form.direct_booking_website),
      social_media_links,
      property_social_media: "",
      applicant_type: track,
      source_label: sourceLabel,
      attribution,
    };
    if (track === "property_owner") {
      payload.submitted_properties = (form.submitted_properties || [])
        .filter((p) => p.listing_url.trim())
        .map((p) => ({
          property_name: p.property_name.trim(),
          listing_url: normalizeUrl(p.listing_url),
          notes: p.notes.trim(),
          id: p.id,
        }));
    } else {
      delete payload.submitted_properties;
    }
  }

  if (meta.source) payload.source = meta.source;
  if (meta.experimentSegment) payload.experiment_segment = meta.experimentSegment;

  const res = await base44.functions.invoke("submitPartnerApplication", {
    track,
    payload,
    honeypot_value: honeypot,
    time_to_submit_ms: meta.formLoadedAt ? Date.now() - meta.formLoadedAt : null,
  });
  const result = res.data || {};
  if (!result.ok || !result.id) {
    throw new Error("Submission failed. Please try again.");
  }

  // Quarantined and silently-rejected submissions never notify anyone.
  if (result.notify) {
    if (track === "existing_partner_access_request") {
      try {
        await base44.functions.invoke("matchExistingPartnerRequest", { application_id: result.id });
      } catch (_) { /* non-blocking */ }
    } else {
      const displayName = form.company_name || form.full_name;
      const typeLabel = track === "property_manager" ? "Property Manager" : "Property Owner";
      const locationInfo = form.property_locations || form.property_address || "";
      const countInfo = form.property_count ? `${form.property_count} properties` : "";
      try {
        const adminEmail = await resolveAdminNotificationEmail();
        await base44.entities.PortalNotification.create({
          recipient_role: "admin",
          recipient_email: adminEmail,
          type: "general",
          title: `New application from ${displayName}`,
          message: `${typeLabel} application${countInfo ? ` — ${countInfo}` : ""}${locationInfo ? ` in ${locationInfo}` : ""}.`,
          submission_id: result.id,
          is_read: false,
          link: `/admin/hub?tab=applications&applicationId=${result.id}`,
        });
      } catch (notifErr) {
        console.warn("[submitApplication] PortalNotification failed (non-fatal)", notifErr);
      }
    }
  }

  return result.id;
}