import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle, ExternalLink, Loader2 } from "lucide-react";

export default function BatchApproveDialog({ app, onClose, onSuccess }) {
  const qc = useQueryClient();
  const allProps = Array.isArray(app.submitted_properties) ? app.submitted_properties.filter(p => p.listing_url) : [];
  const [checked, setChecked] = useState(() => Object.fromEntries(allProps.map((p, i) => [p.id || i, true])));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const selected = allProps.filter((p, i) => checked[p.id || i]);
  const selectedCount = selected.length;

  const toggle = (key) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApprove = async () => {
    setLoading(true);

    try {
      // NOTE: We intentionally do NOT call base44.users.inviteUser() here — it triggers
      // Base44's default welcome email which duplicates our branded invitation. The user
      // will be auto-created by Base44 platform auth when they click the activation link
      // and complete signup at /portal/accept-invite. Our acceptPartnerInvitation function
      // then handles the partner linkage.
      // Fallback: if there's an issue with the platform auto-creation flow discovered
      // in production, we can re-enable the inviteUser call here with a suppressed email.
      // For now, rely on Base44 platform auth to create the user on their first login.

      // 2. Look up the User record by email for portal_user_id
      let portalUserId = null;
      try {
        const users = await base44.entities.User.list();
        const match = users.find(u => u.email === app.email);
        if (match) portalUserId = match.id;
      } catch (_) {}

      // 3. Create Partner record
      setProgress("Creating partner record...");
      const partnerName = app.company_name || app.full_name;
      const partner = await base44.entities.Partner.create({
        partner_name: partnerName,
        company_name: app.company_name || "",
        primary_contact_name: app.full_name,
        primary_contact_email: app.email,
        primary_contact_phone: app.phone || "",
        partner_type: "owner",
        status: "approved",
        funnel_stage: "approved",
        ...(portalUserId ? { portal_user_id: portalUserId, portal_user_ids: [portalUserId] } : {}),
      });

      // Sync new Partner to Supabase so PartnerDetail and the public site render it.
      if (partner?.id) {
        try {
          await base44.functions.invoke("syncPartnerToSupabase", {
            partnerId: partner.id,
            partnerEmail: partner.primary_contact_email,
          });
        } catch (e) {
          console.warn("[batch-approve] Partner Supabase sync failed:", e?.message);
        }
      }

      // 4. Create PropertySubmissions for selected properties (optional — admin may approve with none)
      if (selected.length > 0) {
        setProgress(`Creating ${selectedCount} property submission${selectedCount === 1 ? "" : "s"}...`);
        const submissions = [];
        for (let i = 0; i < selected.length; i++) {
          const prop = selected[i];
          const submission = await base44.entities.PropertySubmission.create({
            partner_id: partner.id,
            partner_name: partnerName,
            partner_email: app.email,
            property_name: prop.property_name?.trim() || `Untitled Property ${i + 1}`,
            listing_url: prop.listing_url,
            notes_to_team: prop.notes || "",
            status: "submitted",
            submitted_date: new Date().toISOString(),
            submission_type: "new",
            source: "homeowner_application",
          });
          submissions.push({ submission, listing_url: prop.listing_url });
        }

        // 5. Fire AI import (scrapePropertyUrl) for each listing URL in parallel
        setProgress("Importing property details from listing URLs...");
        await Promise.allSettled(
          submissions.map(async ({ submission, listing_url }) => {
            try {
              const res = await base44.functions.invoke("scrapePropertyUrl", {
                url: listing_url,
                partner_id: partner.id,
              });
              if (res?.data) {
                const s = res.data;
                await base44.entities.PropertySubmission.update(submission.id, {
                  description: s.description,
                  short_summary: s.short_summary,
                  headline: s.headline,
                  property_type: s.property_type,
                  location_city: s.location_city,
                  location_state: s.location_state,
                  location_country: s.location_country,
                  location_full: s.location_full,
                  bedrooms: s.bedrooms,
                  bathrooms: s.bathrooms,
                  sleeps: s.sleeps,
                  amenities: s.amenities,
                  photo_urls: s.photo_urls,
                  tags: s.tags,
                  design_style_notes: s.design_style_notes,
                  unique_features: s.unique_features,
                  best_fit_guest: s.best_fit_guest,
                  ai_fit_score: s.ai_fit_score,
                  ai_imported: true,
                });
              }
            } catch (e) {
              console.warn(`Scrape failed for ${listing_url}:`, e?.message);
            }
          })
        );
      }

      // 6. Update application status
      await base44.entities.PartnerApplication.update(app.id, { status: "approved" });

      // 7. Send confirmation email + in-app notification
      setProgress("Sending confirmation emails...");
      const approveMsg = selectedCount > 0
        ? `Your application to The 100 Collection is approved. Your ${selectedCount} ${selectedCount === 1 ? "property is" : "properties are"} now in review. You'll receive updates as our team reviews each.`
        : `Your application to The 100 Collection is approved. You can now add your properties through the portal whenever you're ready.`;
      await Promise.all([
        base44.entities.PortalNotification.create({
          recipient_email: app.email,
          recipient_role: "partner",
          type: "approved",
          title: "Welcome to The 100 Collection",
          message: approveMsg,
          link: "/portal/dashboard",
          is_read: false,
        }),
        base44.integrations.Core.SendEmail({
          to: app.email,
          subject: "Welcome to The 100 Collection — You're Approved!",
          body: `Hi ${app.full_name},\n\n${approveMsg}\n\nWelcome aboard,\nThe 100 Collection Team`,
        }),
      ]);

      // 8. Send branded activation email (creates PartnerInvitation + sends via Resend)
      try {
        await base44.functions.invoke("sendActivationEmail", { partner_id: partner.id });
      } catch (_) {}

      // Fire GHL webhook (non-blocking)
      base44.functions.invoke("fireGhlWebhook", { applicationId: app.id, decision: "qualified" }).catch(() => {});

      qc.invalidateQueries(["partner-applications"]);
      onSuccess(selectedCount > 0
        ? `${selectedCount} property submission${selectedCount === 1 ? "" : "s"} created! Partner is now active.`
        : `Partner approved with no properties. They can add listings from the portal.`);
      onClose();
    } catch (e) {
      console.error("Batch approve failed:", e);
      onSuccess("Approval failed: " + (e?.message || "Unknown error"));
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const partnerDisplayName = app.company_name || app.full_name;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-[#0D1B2A] mb-1">
          Approve {partnerDisplayName} — {allProps.length} {allProps.length === 1 ? "property" : "properties"} to review
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Select which properties to create as PropertySubmissions for the new Partner
        </p>

        <div className="border border-slate-100 rounded-xl overflow-hidden mb-5">
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
            {allProps.map((prop, i) => {
              const key = prop.id || i;
              const isChecked = checked[key] !== false;
              return (
                <label key={key} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(key)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#C9A96E] focus:ring-[#C9A96E]/30 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0D1B2A]">
                      {prop.property_name || `Untitled Property ${i + 1}`}
                    </div>
                    <a href={prop.listing_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#C9A96E] hover:underline break-all flex items-center gap-0.5 mt-0.5"
                      onClick={e => e.stopPropagation()}>
                      {prop.listing_url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                    {prop.notes && (
                      <p className="text-xs text-slate-400 mt-1">{prop.notes}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {progress && (
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-[#C9A96E]" />
            {progress}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleApprove} disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 font-medium flex items-center justify-center gap-2">
            {loading ? "Processing..." : selectedCount > 0
              ? `Approve and create ${selectedCount} property submission${selectedCount === 1 ? "" : "s"}`
              : "Approve partner (no properties)"}
          </button>
        </div>
      </div>
    </div>
  );
}