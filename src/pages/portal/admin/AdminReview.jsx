import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useParams, Link } from "react-router-dom";
import PortalLayout from "../../../components/portal/PortalLayout";
import PortalStatusBadge from "../../../components/portal/PortalStatusBadge";
import ConfidenceBadge from "../../../components/portal/ConfidenceBadge";
import { CheckCircle, XCircle, RefreshCw, MessageSquare, ChevronLeft, Sparkles, Save, AlertTriangle, Ban } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import SubmissionPhotoGrid from "@/components/admin/SubmissionPhotoGrid";
import MentionInput from "@/components/admin/MentionInput";
import { buildPropertyFromSubmission, buildPropertyEditPatch } from "@/lib/propertyMapping";
import StatusChangeModal from "@/components/admin/StatusChangeModal";
import TerminationConfirmModal from "@/components/admin/TerminationConfirmModal";

export default function AdminReview() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState({});
  const [statusModal, setStatusModal] = useState(null); // null | { action: "rejected" | "needs_revision" | "termination_deny" }
  const [termConfirm, setTermConfirm] = useState(false);

  const { data: submission, isLoading } = useQuery({
    queryKey: ["submission", id],
    queryFn: () => base44.entities.PropertySubmission.filter({ id }).then(r => r[0]),
    enabled: !!id,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["review-notes", id],
    queryFn: () => base44.entities.ReviewNote.filter({ submission_id: id }),
    enabled: !!id,
  });

  const updateMut = useMutation({
    mutationFn: async (data) => {
      await base44.entities.PropertySubmission.update(id, data);
      // Sync edited fields to Supabase if linked
      const supabaseId = submission?.supabase_property_id;
      if (supabaseId) {
        await base44.functions.invoke("syncPropertyToSupabase", {
          action: "update",
          id: supabaseId,
          data: { ...submission, ...data },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(["submission", id]);
      setEditMode(false);
      setEdits({});
      toast({ title: "Saved", description: "Property info updated and synced to Supabase." });
    },
  });

  const addNoteMut = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.ReviewNote.create({
        submission_id: id, author: user.email, author_role: "admin",
        content: note, mentioned_user_ids: mentionedUserIds,
      });
    },
    onSuccess: () => {
      setNote("");
      setMentionedUserIds([]);
      qc.invalidateQueries(["review-notes", id]);
    },
  });

  const changeStatus = async (newStatus, extraData = {}) => {
    const user = await base44.auth.me();
    const updates = { status: newStatus, reviewed_by: user.email, ...extraData };
    if (newStatus === "active") updates.approved_date = new Date().toISOString();
    if (newStatus === "rejected") updates.rejected_date = new Date().toISOString();
    await base44.entities.PropertySubmission.update(id, updates);

    let shouldSendEmail = false;
    let propertyId = submission?.source_property_id || null;
    // Notify partner — with dedup: suppress if identical notification within last 5 mins
    if (submission) {
      const messages = {
        active: { title: "Your Property Has Been Published! 🎉", message: `Congratulations! "${submission.property_name}" has been approved and published to The 100 Collection. Our licensing team will be in touch shortly.` },
        needs_revision: { title: "Revisions Requested", message: `Our team has reviewed "${submission.property_name}" and left comments. Please review and resubmit.` },
        rejected: { title: "Submission Update", message: `After careful review, "${submission.property_name}" was not selected for The 100 Collection at this time. Please reach out if you have questions.` },
        under_review: { title: "Property Under Review", message: `Your property "${submission.property_name}" is now being reviewed by our curation team.` },
      };
      const msg = messages[newStatus];
      const notifMessage = extraData.partner_facing_message || msg.message;
      if (msg) {
        const notifType = newStatus === "active" ? "approved" : newStatus;
        // Permanent dedup: skip if a notification already exists for this submission+type
        const dedupKey = `${id}__${notifType}`;
        const existing = await base44.entities.PortalNotification.filter({ dedup_key: dedupKey });
        if (existing.length === 0) {
          shouldSendEmail = true;
          await base44.entities.PortalNotification.create({
            recipient_email: submission.partner_email, recipient_role: "partner",
            type: notifType, title: msg.title, message: notifMessage,
            submission_id: id, property_name: submission.property_name, is_read: false,
            dedup_key: dedupKey,
            link: `/admin/hub?tab=submissions&submissionId=${id}`,
          });
        }
      }
    }

    // Sync status to Supabase for any status change
    if (submission?.supabase_property_id) {
      base44.functions.invoke("syncPropertyToSupabase", {
        action: "update",
        id: submission.supabase_property_id,
        data: { ...submission, status: newStatus },
      }).catch(e => console.warn("Supabase sync failed (non-fatal):", e?.message));
    }

    // If published (active), create Property record, license record + sync partner to Supabase
    if (newStatus === "active" && submission) {
      // Create Property record from submission (skip if already linked — e.g. edit submissions)
      if (!propertyId) {
        try {
          const propertyData = buildPropertyFromSubmission(submission);
          const newProperty = await base44.entities.Property.create(propertyData);
          propertyId = newProperty.id;
          await base44.entities.PropertySubmission.update(id, { source_property_id: propertyId });
          // Sync newly-created Property to Supabase so it appears in /Properties immediately
          try {
            const syncRes = await base44.functions.invoke("syncPropertyToSupabase", {
              action: "sync_property",
              id: newProperty.id,
            });
            const sbId = syncRes?.property?.id;
            if (sbId && String(sbId) !== "null" && String(sbId) !== "undefined") {
              await base44.entities.PropertySubmission.update(id, { supabase_property_id: String(sbId) });
            }
          } catch (e) {
            console.warn("[approve] Supabase sync failed for new Property, will be caught by reconciliation:", e?.message);
          }
        } catch (e) {
          console.warn("Property creation failed (will be caught by reconciliation):", e?.message);
        }
      }

      // For EDIT submissions with an existing Property, apply the approved
      // field changes (description, amenities, photos, etc.) to the Property
      // (portal source of truth) and push the updated row to Supabase
      // (propertiesbase44 — the public site table).
      if (submission.submission_type === "edit" && propertyId) {
        try {
          const patch = buildPropertyEditPatch(submission);
          await base44.entities.Property.update(propertyId, patch);
          base44.functions.invoke("syncPropertyToSupabase", { action: "sync_property", id: propertyId })
            .catch(e => console.warn("[approve] post-edit Supabase sync failed (non-fatal):", e?.message));
        } catch (e) {
          console.warn("[approve] Property edit apply failed (non-fatal):", e?.message);
        }
      }

      const BASE_FEE = 495.00;
      // Generate license number: 100C-{YYYY}-{6-char-random}
      const year = new Date().getFullYear();
      const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "0");
      const licNum = `100C-${year}-${rand}`;

      // Fetch partner to get discount info
      let discountPercent = 0;
      let discountLabel = null;
      if (submission.partner_id) {
        try {
          const partners = await base44.entities.Partner.filter({ id: submission.partner_id });
          const p = partners[0];
          if (p) { discountPercent = p.discount_percent || 0; discountLabel = p.discount_label || null; }
        } catch (_) {}
      }

      const annualFee = Math.round(BASE_FEE * (1 - discountPercent / 100) * 100) / 100;
      const isDeal = !!(discountLabel && discountLabel !== "No Discount");
      const today = new Date().toISOString().slice(0, 10);
      const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      await base44.entities.LicenseRecord.create({
        submission_id: id,
        partner_id: submission.partner_id,
        partner_name: submission.partner_name,
        property_name: submission.property_name,
        property_id: propertyId,
        license_number: licNum,
        license_status: "active",
        payment_status: "invoiced",
        base_fee: BASE_FEE,
        discount_applied_percent: discountPercent,
        discount_applied_label: discountLabel,
        annual_fee: annualFee,
        is_deal: isDeal,
        deal_notes: isDeal ? discountLabel : null,
        license_start_date: today,
        license_end_date: endDate,
        invoice_date: today,
      });

      // Sync partner to Supabase partners table (only if not already there)
      if (submission.partner_id) {
        const partners = await base44.entities.Partner.filter({ id: submission.partner_id });
        const partner = partners[0];
        if (partner) {
          base44.functions.invoke("syncPartnerToSupabase", {
            partnerId: partner.id,
            partnerEmail: partner.primary_contact_email || submission.partner_email || "",
          }).catch(e => console.warn("Supabase partner sync failed (non-fatal):", e?.message));
        }
      }
    }

    // Send email after property creation so we can link to the specific property
    if (shouldSendEmail) {
      base44.functions.invoke("sendPropertyEmail", {
        type: "status_change", submissionId: id, newStatus, propertyId,
      }).catch(e => console.warn("Email send failed (non-fatal):", e?.message));
    }

    await base44.entities.AuditEntry.create({
      actor_email: user.email, actor_role: "admin",
      action: `Status changed to ${newStatus}`, entity_type: "PropertySubmission",
      entity_id: id, property_name: submission?.property_name,
      partner_name: submission?.partner_name,
    });

    qc.invalidateQueries(["submission", id]);

    const toastMessages = {
      active: { title: "Property Published", description: `"${submission?.property_name}" has been published and a license record has been created.` },
      rejected: { title: "Property Rejected", description: `"${submission?.property_name}" has been marked as rejected.` },
      needs_revision: { title: "Revisions Requested", description: `Revision request sent to ${submission?.partner_name}.` },
      under_review: { title: "Marked In Review", description: `"${submission?.property_name}" is now under review.` },
    };
    const toastMsg = toastMessages[newStatus];
    if (toastMsg) toast(toastMsg);
  };

  const approveTermination = async (adminNotes) => {
    try {
      await base44.functions.invoke("manageOffboarding", {
        action: "approve_termination",
        submissionId: id,
        adminMessage: adminNotes,
      });
      toast({ title: "Termination approved", description: `"${submission?.property_name}" has been offboarded. The license is cancelled and the property is depublished.` });
      qc.invalidateQueries(["submission", id]);
      qc.invalidateQueries(["admin-submissions"]);
      qc.invalidateQueries(["termination-requests"]);
      qc.invalidateQueries(["offboarding-properties"]);
    } catch (e) {
      toast({ variant: "destructive", title: "Termination failed", description: e?.message || "Please try again." });
    }
  };

  const denyTermination = async (partnerMessage) => {
    try {
      await base44.functions.invoke("manageOffboarding", {
        action: "reject_termination",
        submissionId: id,
        adminMessage: partnerMessage,
      });
      toast({ title: "Termination denied", description: `The partner has been notified. "${submission?.property_name}" remains active.` });
      qc.invalidateQueries(["submission", id]);
      qc.invalidateQueries(["admin-submissions"]);
      qc.invalidateQueries(["termination-requests"]);
    } catch (e) {
      toast({ variant: "destructive", title: "Action failed", description: e?.message || "Please try again." });
    }
  };

  if (isLoading) return (
    <PortalLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-slate-100 border-t-[#C9A96E] rounded-full animate-spin" />
      </div>
    </PortalLayout>
  );

  if (!submission) return <PortalLayout><div className="text-center py-20 text-slate-400">Submission not found.</div></PortalLayout>;

  const s = submission;
  const isTermination = s.submission_type === "termination_request";
  const confidence = s.field_confidence || {};

  const fieldCls = "w-full px-3 py-2 border border-[#C9A96E]/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-amber-50/20";
  const val = (field) => edits[field] !== undefined ? edits[field] : (s[field] ?? "");
  const set = (field, v) => setEdits(ed => ({ ...ed, [field]: v }));

  const EditableField = ({ label, field, multiline }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
        {s.ai_imported && <ConfidenceBadge level={confidence[field] || "high"} />}
      </div>
      {editMode ? (
        multiline
          ? <textarea value={val(field)} onChange={e => set(field, e.target.value)} rows={3} className={`${fieldCls} resize-none`} />
          : <input value={val(field)} onChange={e => set(field, e.target.value)} className={fieldCls} />
      ) : (
        <p className={`text-sm text-[#0D1B2A] leading-relaxed ${multiline ? "whitespace-pre-wrap" : ""}`}>{s[field] || <span className="text-slate-300 italic">Not provided</span>}</p>
      )}
    </div>
  );

  const SelectField = ({ label, field, options }) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
      {editMode ? (
        <select value={val(field)} onChange={e => set(field, e.target.value)} className={fieldCls}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <p className="text-sm text-[#0D1B2A]">{s[field] || <span className="text-slate-300 italic">Not provided</span>}</p>
      )}
    </div>
  );

  const NumberField = ({ label, field }) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
      {editMode ? (
        <input type="number" value={val(field)} onChange={e => set(field, e.target.value === "" ? "" : Number(e.target.value))} className={fieldCls} min={0} />
      ) : (
        <p className="text-sm text-[#0D1B2A]">{s[field] ?? <span className="text-slate-300 italic">Not provided</span>}</p>
      )}
    </div>
  );

  const AmenitiesField = ({ label, field }) => {
    const current = (edits[field] !== undefined ? edits[field] : s[field]) || [];
    const [newTag, setNewTag] = useState("");
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
        <div className="flex flex-wrap gap-2">
          {current.map((a, i) => (
            <span key={i} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-50 text-slate-700 rounded-full border border-slate-100">
              {a}
              {editMode && (
                <button onClick={() => set(field, current.filter((_, j) => j !== i))} className="ml-1 text-slate-400 hover:text-red-500">×</button>
              )}
            </span>
          ))}
        </div>
        {editMode && (
          <div className="flex gap-2">
            <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newTag.trim()) { set(field, [...current, newTag.trim()]); setNewTag(""); e.preventDefault(); } }}
              placeholder="Add amenity, press Enter" className={`${fieldCls} flex-1`} />
            <button onClick={() => { if (newTag.trim()) { set(field, [...current, newTag.trim()]); setNewTag(""); } }}
              className="px-3 py-2 bg-[#0D1B2A] text-white text-xs rounded-xl">Add</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <PortalLayout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3 mb-3">
          <Link to="/admin/queue" className="text-slate-400 hover:text-[#0D1B2A] mt-1 flex-shrink-0"><ChevronLeft className="w-5 h-5" /></Link>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin Review</div>
            <h1 className="text-2xl font-light text-[#0D1B2A] truncate">{s.property_name}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <PortalStatusBadge status={s.status} />
              <span className="text-sm text-slate-400">by {s.partner_name}</span>
              {s.ai_fit_score && (
                <span className="flex items-center gap-1 text-xs font-medium text-[#C9A96E]">
                  <Sparkles className="w-3 h-3" /> {s.ai_fit_score}% Fit Score
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {editMode ? (
            <>
              <button onClick={() => { setEditMode(false); setEdits({}); }} className="text-sm border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={() => updateMut.mutate(edits)} className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm px-4 py-2 rounded-xl">
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)} className="text-sm border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50">Edit Fields</button>
          )}
          {isTermination ? (
            !["approved", "rejected"].includes(s.status) ? (
              <>
                <button onClick={() => setStatusModal({ action: "termination_deny" })} className="flex items-center gap-2 bg-slate-100 text-slate-600 text-sm px-4 py-2 rounded-xl hover:bg-slate-200 transition-colors whitespace-nowrap">
                  <XCircle className="w-3.5 h-3.5" /> Deny Termination
                </button>
                <button onClick={() => setTermConfirm(true)} className="flex items-center gap-2 bg-red-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-red-700 transition-colors whitespace-nowrap">
                  <Ban className="w-3.5 h-3.5" /> Approve Termination
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">{s.status === "approved" ? "Termination approved and processed" : "Termination denied"}</span>
            )
          ) : !["rejected"].includes(s.status) && (
            <>
              {s.status !== "under_review" && (
                <button onClick={() => changeStatus("under_review")} className="flex items-center gap-2 bg-purple-50 text-purple-700 text-sm px-4 py-2 rounded-xl hover:bg-purple-100 transition-colors whitespace-nowrap">
                  <RefreshCw className="w-3.5 h-3.5" /> Mark In Review
                </button>
              )}
              {s.status !== "needs_revision" && (
                <button onClick={() => setStatusModal({ action: "needs_revision" })} className="flex items-center gap-2 bg-orange-50 text-orange-700 text-sm px-4 py-2 rounded-xl hover:bg-orange-100 transition-colors whitespace-nowrap">
                  <MessageSquare className="w-3.5 h-3.5" /> Request Revisions
                </button>
              )}
              <button onClick={() => setStatusModal({ action: "rejected" })} className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-2 rounded-xl hover:bg-red-100 transition-colors whitespace-nowrap">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
              {s.status !== "active" && (
                <button onClick={() => changeStatus("active")} className="flex items-center gap-2 bg-emerald-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap">
                  <CheckCircle className="w-3.5 h-3.5" /> Publish
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isTermination && (
        <div className="mb-6 bg-red-50 border border-red-300 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 mb-1">This is a TERMINATION REQUEST</p>
            <p className="text-sm text-red-800 leading-relaxed">
              Approving this will remove <strong>{s.property_name}</strong> from The 100 Collection, cancel the associated license, and depublish from theonehundredcollection.com. This cannot be undone. Please confirm carefully.
            </p>
            {s.offboarding_reason && (
              <p className="text-xs text-red-700 mt-2"><span className="font-semibold">Partner reason:</span> {s.offboarding_reason}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Photos */}
          <SubmissionPhotoGrid photoUrls={s.photo_urls || []} />

          {/* Details */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <EditableField label="Property Name" field="property_name" />
              <EditableField label="Headline" field="headline" />
              <SelectField label="Property Type" field="property_type" options={["villa","house","condo","estate","cabin","penthouse","chalet","farmhouse","other"]} />
              <SelectField label="Status" field="status" options={["draft","imported","partner_reviewing","submitted","under_review","needs_revision","approved","rejected","licensed","billed","active"]} />
              <EditableField label="Listing URL" field="listing_url" />
              <EditableField label="Video URL" field="video_url" />
              <NumberField label="Bedrooms" field="bedrooms" />
              <NumberField label="Bathrooms" field="bathrooms" />
              <NumberField label="Half Baths" field="half_bathrooms" />
              <NumberField label="Sleeps" field="sleeps" />
            </div>
            <div className="border-t border-slate-50 pt-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Location</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <EditableField label="Full Location" field="location_full" />
                <EditableField label="City" field="location_city" />
                <EditableField label="State" field="location_state" />
                <EditableField label="Country" field="location_country" />
              </div>
            </div>
            <div className="border-t border-slate-50 pt-4 space-y-4">
              <EditableField label="Short Summary" field="short_summary" multiline />
              <EditableField label="Description" field="description" multiline />
              <EditableField label="Why The 100 Collection" field="why_100_collection" multiline />
              <EditableField label="Unique Features" field="unique_features" multiline />
              <EditableField label="Design / Style Notes" field="design_style_notes" multiline />
              <EditableField label="Best Fit Guest" field="best_fit_guest" multiline />
              <EditableField label="Admin Notes" field="admin_notes" multiline />
              <EditableField label="Revision Notes" field="revision_notes" multiline />
              <EditableField label="Partner Notes to Team" field="notes_to_team" multiline />
            </div>
          </div>

          {/* Amenities */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <AmenitiesField label="Amenities" field="amenities" />
          </div>

          {/* Tags */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <AmenitiesField label="Tags" field="tags" />
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-5">
          {/* Submission info */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Submission Info</h3>
            {[
              ["Partner", s.partner_name],
              ["Email", s.partner_email],
              ["Submitted", s.submitted_date ? new Date(s.submitted_date).toLocaleDateString() : "Not yet"],
              ["Reviewed by", s.reviewed_by || "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-slate-400">{k}</span>
                <span className="text-slate-700 font-medium text-right max-w-[60%] truncate">{v}</span>
              </div>
            ))}
          </div>

          {/* AI Scores */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">AI Analysis</h3>
            <div className="space-y-3">
              {[["Fit Score", s.ai_fit_score], ["Completeness", s.completeness_score]].map(([label, val]) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-[#0D1B2A]">{val || 0}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${(val || 0) >= 80 ? "bg-emerald-500" : (val || 0) >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${val || 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Internal Notes</h3>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
              {notes.map(n => (
                <div key={n.id} className="px-5 py-3">
                  <div className="text-[10px] text-slate-400 mb-1">{n.author} · {new Date(n.created_date).toLocaleDateString()}</div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-50 space-y-2">
              <MentionInput
                value={note}
                onChange={setNote}
                mentionedUserIds={mentionedUserIds}
                onMentionsChange={setMentionedUserIds}
              />
              <button onClick={() => note.trim() && addNoteMut.mutate()} disabled={!note.trim()}
                className="w-full bg-[#0D1B2A] text-white text-xs py-2 rounded-xl disabled:opacity-40">Add Note</button>
            </div>
          </div>
        </div>
      </div>
      <StatusChangeModal
        open={!!statusModal}
        onOpenChange={(v) => !v && setStatusModal(null)}
        action={statusModal?.action}
        propertyName={submission?.property_name}
        title={statusModal?.action === "termination_deny" ? "Deny Termination Request" : undefined}
        confirmLabel={statusModal?.action === "termination_deny" ? "Deny and notify partner" : undefined}
        hideTemplates={statusModal?.action === "termination_deny"}
        messageLabel="Message to partner"
        onConfirm={async ({ partner_facing_message, admin_notes }) => {
          if (statusModal?.action === "termination_deny") {
            await denyTermination(partner_facing_message);
          } else {
            await changeStatus(statusModal?.action, { partner_facing_message, admin_notes });
          }
        }}
      />
      <TerminationConfirmModal
        open={termConfirm}
        onOpenChange={(v) => !v && setTermConfirm(false)}
        propertyName={submission?.property_name}
        partnerName={submission?.partner_name}
        onConfirm={approveTermination}
      />
    </PortalLayout>
  );
}