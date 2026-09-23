import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCircle, XCircle, Mail, Users, Clock, MessageSquare, ChevronLeft, Building2, Home, CalendarClock, LogIn, Link2, AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { resolveAdminNotificationEmail } from "@/components/apply/ApplyShared";
import StatusPill from "@/components/shared/StatusPill";
import { sourceToneClass } from "@/lib/attribution";
import LinkActivationModal from "@/components/admin/LinkActivationModal";
import BatchApproveDialog from "@/components/admin/BatchApproveDialog";
import BulkDeleteSpamModal from "@/components/admin/BulkDeleteSpamModal";
import PropertySubmissionsList from "@/components/admin/PropertySubmissionsList";

const STATUS_STYLES = {
  pending:           { cls: "bg-amber-50 text-amber-700 border-amber-200",       label: "Pending" },
  approved:          { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Approved" },
  rejected:          { cls: "bg-red-50 text-red-700 border-red-200",             label: "Rejected" },
  invited:           { cls: "bg-blue-50 text-blue-700 border-blue-200",          label: "Invited" },
  interview_invited: { cls: "bg-purple-50 text-purple-700 border-purple-200",    label: "Interview Invited" },
  spam_review:       { cls: "bg-rose-50 text-rose-700 border-rose-200",             label: "Spam Review" },
};

const TYPE_STYLES = {
  property_manager: { cls: "bg-[#0D1B2A]/8 text-[#0D1B2A] border-[#0D1B2A]/15", label: "Manager", icon: Building2 },
  property_owner:   { cls: "bg-purple-50 text-purple-700 border-purple-200",       label: "Owner",   icon: Home },
  existing_partner_access_request: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Portal Access", icon: LogIn },
};

// ─── Approve Dialog ────────────────────────────────────────────────────────────
function ApproveDialog({ app, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);

    // NOTE: We intentionally do NOT call base44.users.inviteUser() here — it triggers
    // Base44's default welcome email which duplicates our branded invitation. The user
    // will be auto-created by Base44 platform auth when they click the activation link
    // and complete signup at /portal/accept-invite. Our acceptPartnerInvitation function
    // then handles the partner linkage.
    // Fallback: if there's an issue with the platform auto-creation flow discovered
    // in production, we can re-enable the inviteUser call here with a suppressed email.
    // For now, rely on Base44 platform auth to create the user on their first login.

    // 2. Look up the User record by email to get their id for portal_user_id
    let portalUserId = null;
    let portalUser = null;
    try {
      const users = await base44.entities.User.list();
      portalUser = users.find(u => u.email === app.email);
      if (portalUser) portalUserId = portalUser.id;
    } catch (_) {}

    // 3. Auto-promote the applicant's User account if it already exists, so they
    // get partner access without waiting for the activation email. The invitation
    // flow remains available; this just makes it optional.
    if (portalUser) {
      try {
        const userPatch = {};
        if (portalUser.role !== "partner" && portalUser.role !== "admin") userPatch.role = "partner";
        if (!portalUser.partner_role) userPatch.partner_role = "owner";
        if (Object.keys(userPatch).length > 0) {
          await base44.entities.User.update(portalUser.id, userPatch);
        }
      } catch (_) {}
    }

    // 4. Create the Partner record (or update an existing one matched by email so
    // re-approving / duplicate applications don't create a second Partner).
    const partnerType = app.applicant_type === "property_owner" ? "owner" : "property_manager";
    const partnerName = app.company_name || app.full_name;
    const partnerFields = {
      partner_name: partnerName,
      company_name: app.company_name || "",
      primary_contact_name: app.full_name,
      primary_contact_email: app.email,
      primary_contact_phone: app.phone || "",
      partner_type: partnerType,
      status: "approved",
      funnel_stage: "approved",
    };

    let partner;
    try {
      const existing = await base44.entities.Partner.filter({ primary_contact_email: app.email });
      if (existing && existing.length > 0) {
        const ex = existing[0];
        // Merge portal_user_ids rather than overwrite (preserve other linked users)
        const mergedIds = Array.isArray(ex.portal_user_ids) && ex.portal_user_ids.length > 0
          ? [...ex.portal_user_ids]
          : (ex.portal_user_id ? [ex.portal_user_id] : []);
        if (portalUserId && !mergedIds.includes(portalUserId)) mergedIds.push(portalUserId);
        const updateFields = { ...partnerFields, portal_user_ids: mergedIds };
        if (portalUserId && !ex.portal_user_id) updateFields.portal_user_id = portalUserId;
        partner = await base44.entities.Partner.update(ex.id, updateFields);
      } else {
        partner = await base44.entities.Partner.create({
          ...partnerFields,
          ...(portalUserId ? { portal_user_id: portalUserId, portal_user_ids: [portalUserId] } : {}),
        });
      }
    } catch (_) {
      partner = await base44.entities.Partner.create({
        ...partnerFields,
        ...(portalUserId ? { portal_user_id: portalUserId, portal_user_ids: [portalUserId] } : {}),
      });
    }

    // Sync new Partner to Supabase so admin views (PartnerDetail reads Supabase-first)
    // and the public site show it immediately. Non-blocking — Base44 is source of truth.
    if (partner?.id) {
      try {
        await base44.functions.invoke("syncPartnerToSupabase", {
          partnerId: partner.id,
          partnerEmail: partner.primary_contact_email,
        });
      } catch (e) {
        console.warn("[approve] Partner Supabase sync failed:", e?.message);
      }
    }

    // 5. Update application status
    await base44.entities.PartnerApplication.update(app.id, { status: "approved" });

    // 6. Notify the applicant via in-app notification + email
    const approveMsg = `Congratulations! Your application has been approved. Log in to your partner portal at /portal/dashboard to get started.`;
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

    // 7. Send branded activation email (creates PartnerInvitation + sends via Resend)
    try {
      await base44.functions.invoke("sendActivationEmail", { partner_id: partner.id });
    } catch (_) {}

    // Fire GHL webhook (non-blocking)
    base44.functions.invoke("fireGhlWebhook", { applicationId: app.id, decision: "qualified" }).catch(() => {});

    qc.invalidateQueries(["partner-applications"]);
    setLoading(false);
    onSuccess("Application approved and partner account created.");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold text-[#0D1B2A] mb-2">Approve Application</h3>
        <p className="text-sm text-slate-500 mb-1">This will:</p>
        <ul className="text-sm text-slate-600 space-y-1 mb-5 list-disc list-inside">
          <li>Create a Partner record for <strong>{app.company_name || app.full_name}</strong></li>
          <li>Send a portal invite to <strong>{app.email}</strong></li>
          <li>Notify the applicant in-app</li>
        </ul>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleApprove} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 font-medium">
            {loading ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Dialog ─────────────────────────────────────────────────────────────
function RejectDialog({ app, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    try {
      await base44.entities.PartnerApplication.update(app.id, {
        status: "rejected",
        admin_notes: reason || undefined,
      });
      const rejectMsg = `Thank you for your interest in The 100 Collection. After careful review, we're unable to move forward with your application at this time.${reason ? ` ${reason}` : ""} We encourage you to apply again in the future.`;
      await Promise.all([
        base44.entities.PortalNotification.create({
          recipient_email: app.email,
          recipient_role: "partner",
          type: "rejected",
          title: "Update on Your 100 Collection Application",
          message: rejectMsg,
          link: "/portal/dashboard",
          is_read: false,
        }),
        base44.integrations.Core.SendEmail({
          to: app.email,
          subject: "Update on Your 100 Collection Application",
          body: `Hi ${app.full_name},\n\n${rejectMsg}\n\nThank you,\nThe 100 Collection Team`,
        }),
      ]);
      // Fire GHL webhook (non-blocking)
      base44.functions.invoke("fireGhlWebhook", { applicationId: app.id, decision: "disqualified" }).catch(() => {});
      qc.invalidateQueries(["partner-applications"]);
      onSuccess("Application rejected.");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold text-[#0D1B2A] mb-3">Reject Application</h3>
        <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">Reason (optional — shown to applicant)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:border-slate-400 mb-5"
          placeholder="e.g. Property does not meet our current curation criteria." />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleReject} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 font-medium">
            {loading ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Interview Dialog ──────────────────────────────────────────────────────────
function InterviewDialog({ app, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    await base44.entities.PartnerApplication.update(app.id, {
      status: "interview_invited",
      admin_notes: message || app.admin_notes,
    });
    // If partner record exists, stamp interview_scheduled_at
    if (scheduledAt) {
      try {
        const partners = await base44.entities.Partner.filter({ primary_contact_email: app.email });
        if (partners[0]) {
          await base44.entities.Partner.update(partners[0].id, { interview_scheduled_at: scheduledAt });
        }
      } catch (_) {}
    }
    const interviewMsg = scheduledAt
      ? `You've been invited to an interview on ${new Date(scheduledAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}.${message ? ` ${message}` : ""}`
      : `You've been invited to an interview with The 100 Collection team.${message ? ` ${message}` : ""}`;
    await Promise.all([
      base44.entities.PortalNotification.create({
        recipient_email: app.email,
        recipient_role: "partner",
        type: "general",
        title: "Interview Scheduled with The 100 Collection",
        message: interviewMsg,
        link: "/portal/dashboard",
        is_read: false,
      }),
      base44.integrations.Core.SendEmail({
        to: app.email,
        subject: "Interview Invitation — The 100 Collection",
        body: `Hi ${app.full_name},\n\n${interviewMsg}\n\nThank you,\nThe 100 Collection Team`,
      }),
    ]);
    qc.invalidateQueries(["partner-applications"]);
    setLoading(false);
    onSuccess("Interview invitation sent.");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold text-[#0D1B2A] mb-3">Invite to Interview</h3>
        <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">Interview Date & Time (optional)</label>
        <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-slate-400 mb-4" />
        <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">Message to applicant (optional)</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:border-slate-400 mb-5"
          placeholder="We'd love to learn more about your portfolio…" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSend} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60 font-medium">
            {loading ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── More Info Dialog ──────────────────────────────────────────────────────────
function MoreInfoDialog({ app, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setLoading(true);
    await base44.entities.PartnerApplication.update(app.id, {
      admin_notes: message,
    });
    await Promise.all([
      base44.entities.PortalNotification.create({
        recipient_email: app.email,
        recipient_role: "partner",
        type: "general",
        title: "We need a bit more info",
        message,
        link: "/portal/dashboard",
        is_read: false,
      }),
      base44.integrations.Core.SendEmail({
        to: app.email,
        subject: "We need a bit more info — The 100 Collection",
        body: `Hi ${app.full_name},\n\n${message}\n\nThank you,\nThe 100 Collection Team`,
      }),
    ]);
    qc.invalidateQueries(["partner-applications"]);
    setLoading(false);
    onSuccess("Request sent to applicant.");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold text-[#0D1B2A] mb-3">Request More Information</h3>
        <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">Message to applicant</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:border-slate-400 mb-5"
          placeholder="What additional information do you need?" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSend} disabled={loading || !message.trim()}
            className="flex-1 px-4 py-2 text-sm bg-[#0D1B2A] text-white rounded-lg hover:bg-[#1a2e45] disabled:opacity-60 font-medium">
            {loading ? "Sending…" : "Send Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create New Partner Dialog (existing_partner_access_request → property_manager) ──
function CreateNewPartnerDialog({ app, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleConvert = async () => {
    setLoading(true);
    await base44.entities.PartnerApplication.update(app.id, {
      applicant_type: "property_manager",
    });
    qc.invalidateQueries(["partner-applications"]);
    setLoading(false);
    onSuccess("Application converted to Property Manager track. You can now approve it to create a new Partner record.");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold text-[#0D1B2A] mb-2">Create New Partner</h3>
        <p className="text-sm text-slate-500 mb-1">This will convert this request to a standard Property Manager application. You can then approve it to create a new Partner record for <strong>{app.company_name || app.full_name}</strong>.</p>
        <p className="text-xs text-amber-600 mt-3">Only use this if the applicant is NOT from an existing partner in our system.</p>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleConvert} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-[#0D1B2A] text-white rounded-lg hover:bg-[#1a2e45] disabled:opacity-60 font-medium">
            {loading ? "Converting…" : "Convert"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail View ───────────────────────────────────────────────────────────────
function ApplicationDetail({ app, onBack, onAction, onRestore, onDelete }) {
  const [dialog, setDialog] = useState(null); // "approve" | "reject" | "more_info" | "interview"
  const [toast, setToast] = useState(null);

  const st = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
  const tt = TYPE_STYLES[app.applicant_type] || TYPE_STYLES.property_manager;
  const TypeIcon = tt.icon;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0D1B2A] text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#C9A96E]" /> {toast}
        </div>
      )}

      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#0D1B2A] mb-5 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to applications
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-50 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#0D1B2A]/8 flex items-center justify-center font-semibold text-[#0D1B2A] text-lg flex-shrink-0">
              {app.full_name?.[0] || "?"}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[#0D1B2A]">{app.full_name}</span>
                <StatusPill value={app.status} label={st.label} />
                <StatusPill variant="brand" label={tt.label} icon={<TypeIcon className="w-3 h-3" />} />
              </div>
              <div className="text-sm text-slate-500 mt-0.5">{app.email}</div>
              <div className="text-xs text-slate-400 mt-0.5">{new Date(app.created_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
            </div>
          </div>
          {/* Actions */}
          {app.status === "spam_review" ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => onRestore(app).then(onBack)}
                className="flex items-center gap-1.5 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Not spam — restore
              </button>
              <button onClick={() => onDelete(app).then(onBack)}
                className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Confirm spam — delete
              </button>
            </div>
          ) : app.applicant_type === "existing_partner_access_request" && app.status === "pending" ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setDialog("reject")}
                className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
              <button onClick={() => setDialog("create_new_partner")}
                className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-300 bg-white px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                <Building2 className="w-3.5 h-3.5" /> Create new Partner
              </button>
              <button onClick={() => setDialog("link_activation")}
                className="flex items-center gap-1.5 text-xs text-white bg-[#C9A96E] border border-[#A68B4B] px-3 py-2 rounded-lg hover:bg-[#b8935a] transition-colors">
                <Link2 className="w-3.5 h-3.5" /> Link & send activation
              </button>
            </div>
          ) : ["pending", "interview_invited"].includes(app.status) && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setDialog("more_info")}
                className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                <MessageSquare className="w-3.5 h-3.5" /> Request Info
              </button>
              <button onClick={() => setDialog("interview")}
                className="flex items-center gap-1.5 text-xs text-purple-700 border border-purple-200 bg-purple-50 px-3 py-2 rounded-lg hover:bg-purple-100 transition-colors">
                <CalendarClock className="w-3.5 h-3.5" /> Invite to Interview
              </button>
              <button onClick={() => setDialog("reject")}
                className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
              <button onClick={() => setDialog("approve")}
                className="flex items-center gap-1.5 text-xs text-white bg-emerald-600 border border-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
                <CheckCircle className="w-3.5 h-3.5" /> Approve
              </button>
            </div>
          )}
        </div>

        {/* Details Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {[
            { label: "Company / PM Name", value: app.company_name },
            { label: "Role", value: app.applicant_type === "existing_partner_access_request" ? (app.message || "").match(/^\[Role: ([^\]]*)\]/)?.[1] : null },
            { label: "Phone", value: app.phone },
            { label: "Website / Portfolio", value: app.website, link: true },
            { label: "Property Listing URL", value: app.listing_url, link: true },
            { label: "Property Address", value: app.property_address },
            { label: "Number of Properties", value: app.property_count },
            { label: "Property Locations", value: app.property_locations },
            { label: "Direct Booking Website", value: app.direct_booking_website, link: true },
            { label: "How Did They Hear", value: app.how_heard },
            { label: "Experiment", value: app.source === "join_v2_experiment" ? `Join v2${app.experiment_segment ? ` · ${app.experiment_segment}` : ""}` : null },
            { label: "Signup", value: (app.source === "signup_vrm" || app.source === "signup_homeowner") ? `Signup · ${app.source === "signup_vrm" ? "VRM" : "Homeowner"}${app.experiment_segment ? ` · ${app.experiment_segment}` : ""}` : null },
            { label: "Signup Source", value: app.source_label || app.attribution?.source_label },
          ].filter(f => f.value).map(f => (
            <div key={f.label}>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{f.label}</div>
              {f.link ? (
                <a href={f.value} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C9A96E] hover:underline break-all">{f.value}</a>
              ) : (
                <div className="text-sm text-[#0D1B2A]">{f.value}</div>
              )}
            </div>
          ))}
        </div>

        {(() => {
          const links = Array.isArray(app.social_media_links) ? app.social_media_links : [];
          const legacy = app.property_social_media;
          if (links.length === 0 && !legacy) return null;
          return (
            <div className="px-6 pb-5">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Social Media</div>
              <div className="space-y-1.5">
                {links.map((link, i) => {
                  const platformLabel = link.platform === "Other" && link.platform_other
                    ? `Other (${link.platform_other})`
                    : link.platform || "Other";
                  return (
                    <div key={i} className="text-sm flex items-baseline gap-1.5">
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500 font-medium whitespace-nowrap">{platformLabel}</span>
                      <span className="text-slate-300">—</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[#C9A96E] hover:underline break-all">{link.url}</a>
                    </div>
                  );
                })}
                {links.length === 0 && legacy && (
                  <div className="text-sm flex items-baseline gap-1.5">
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 font-medium whitespace-nowrap">Other (Legacy)</span>
                    <span className="text-slate-300">—</span>
                    <a href={legacy} target="_blank" rel="noopener noreferrer" className="text-[#C9A96E] hover:underline break-all">{legacy}</a>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Match candidates for existing partner access requests */}
        {app.applicant_type === "existing_partner_access_request" && app.match_candidates && app.match_candidates.length > 0 && (
          <div className="px-6 pb-5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Partner Match Candidates</div>
            <div className="space-y-2">
              {app.match_candidates.map((c, i) => {
                const color = c.confidence > 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : c.confidence >= 60 ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-red-50 text-red-600 border-red-200";
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${color}`}>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#0D1B2A]">{c.partner_name}</div>
                      <div className="text-xs text-slate-400">{c.reason}</div>
                    </div>
                    <span className="text-sm font-bold">{c.confidence}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submitted Properties section for homeowner applications */}
        {app.applicant_type === "property_owner" && Array.isArray(app.submitted_properties) && app.submitted_properties.filter(p => p.listing_url).length > 0 && (
          <div className="px-6 pb-5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Submitted Properties ({app.submitted_properties.filter(p => p.listing_url).length})
            </div>
            <div className="space-y-2">
              {app.submitted_properties.filter(p => p.listing_url).map((prop, i) => (
                <div key={prop.id || i} className="border border-slate-100 rounded-xl p-3">
                  <div className="text-sm font-medium text-[#0D1B2A]">{prop.property_name || `Untitled Property ${i + 1}`}</div>
                  {prop.listing_url && (
                    <a href={prop.listing_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A96E] hover:underline break-all block mt-0.5">
                      {prop.listing_url}
                    </a>
                  )}
                  {prop.notes && <p className="text-xs text-slate-500 mt-1.5">{prop.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {app.message && (
          <div className="px-6 pb-5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {app.applicant_type === "existing_partner_access_request" ? "Additional Notes" : "About Their Properties"}
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed">
              {app.applicant_type === "existing_partner_access_request"
                ? (app.message.replace(/^\[Role: [^\]]*\]\s*/, "") || "No additional notes provided.")
                : app.message}
            </div>
          </div>
        )}

        {app.admin_notes && (
          <div className="px-6 pb-6">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Admin Notes</div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-slate-600 leading-relaxed">{app.admin_notes}</div>
          </div>
        )}
      </div>

      {dialog === "approve" && (
        app.applicant_type === "property_owner" && Array.isArray(app.submitted_properties) && app.submitted_properties.filter(p => p.listing_url).length > 0
          ? <BatchApproveDialog app={app} onClose={() => setDialog(null)} onSuccess={(msg) => { showToast(msg); onAction(); }} />
          : <ApproveDialog app={app} onClose={() => setDialog(null)} onSuccess={(msg) => { showToast(msg); onAction(); }} />
      )}
      {dialog === "reject" && <RejectDialog app={app} onClose={() => setDialog(null)} onSuccess={(msg) => { showToast(msg); onAction(); }} />}
      {dialog === "more_info" && <MoreInfoDialog app={app} onClose={() => setDialog(null)} onSuccess={(msg) => { showToast(msg); onAction(); }} />}
      {dialog === "interview" && <InterviewDialog app={app} onClose={() => setDialog(null)} onSuccess={(msg) => { showToast(msg); onAction(); }} />}
      {dialog === "link_activation" && <LinkActivationModal app={app} onClose={() => setDialog(null)} onSuccess={(msg) => { showToast(msg); onAction(); }} />}
      {dialog === "create_new_partner" && <CreateNewPartnerDialog app={app} onClose={() => setDialog(null)} onSuccess={(msg) => { showToast(msg); onAction(); }} />}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AdminApplications({ embedded = false }) {
  const location = useLocation();
  const urlFilter = new URLSearchParams(location.search).get("filter");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState(urlFilter === "existing_partner_access" ? "existing_partner_access_request" : "all");
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState("partners");
  const [bulkSpamOpen, setBulkSpamOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const qc = useQueryClient();

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["partner-applications"],
    queryFn: () => base44.entities.PartnerApplication.list("-created_date", 200),
  });

  const filtered = applications.filter(a => {
    const statusOk = statusFilter === "all" ? a.status !== "spam_review" : a.status === statusFilter;
    const typeOk = typeFilter === "all" || a.applicant_type === typeFilter;
    return statusOk && typeOk;
  });

  const counts = {
    spam: applications.filter(a => a.status === "spam_review").length,
    pending: applications.filter(a => a.status === "pending").length,
    approved: applications.filter(a => a.status === "approved").length,
    rejected: applications.filter(a => a.status === "rejected").length,
    invited: applications.filter(a => a.status === "invited").length,
    total: applications.length,
  };

  // Spam quarantine actions — restore reopens the application (and fires the
  // belated admin notification + homeowner auto-reply); delete removes it
  // permanently; bulk delete clears the whole quarantine tab at once.
  const handleRestoreSpam = async (app) => {
    await base44.entities.PartnerApplication.update(app.id, { status: "pending", spam_score: 0 });
    try {
      const adminEmail = await resolveAdminNotificationEmail();
      await base44.entities.PortalNotification.create({
        recipient_role: "admin",
        recipient_email: adminEmail,
        type: "general",
        title: `Restored from spam: ${app.company_name || app.full_name}`,
        message: "Quarantined as possible spam, restored by an admin for review.",
        submission_id: app.id,
        is_read: false,
        link: `/admin/hub?tab=applications&applicationId=${app.id}`,
      });
    } catch (_) {}
    try {
      if (app.applicant_type === "existing_partner_access_request") {
        await base44.functions.invoke("matchExistingPartnerRequest", { application_id: app.id });
      } else {
        await base44.functions.invoke("onPartnerApplicationCreate", { data: { ...app, status: "pending", spam_score: 0 } });
      }
    } catch (_) {}
    qc.invalidateQueries(["partner-applications"]);
  };

  const handleDeleteSpam = async (app) => {
    await base44.entities.PartnerApplication.delete(app.id);
    qc.invalidateQueries(["partner-applications"]);
  };

  // Smart bulk spam delete — opens the BulkDeleteSpamModal which previews the
  // affected records (via the bulkDeleteSpamApplications backend function),
  // requires typing "DELETE SPAM" to confirm, and reports the count back here.
  const handleBulkSpamDone = (data) => {
    qc.invalidateQueries(["partner-applications"]);
    const n = data?.deleted ?? 0;
    showToast(`${n} spam application${n === 1 ? "" : "s"} hard-deleted.`);
  };

  if (selected) {
    const app = applications.find(a => a.id === selected);
    if (app) {
      return (
        <ApplicationDetail
          app={app}
          onBack={() => setSelected(null)}
          onAction={() => { qc.invalidateQueries(["partner-applications"]); setSelected(null); }}
          onRestore={handleRestoreSpam}
          onDelete={handleDeleteSpam}
        />
      );
    }
  }

  return (
    <div>
      {!embedded && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">{viewMode === "properties" ? "Property Submissions" : "Partner Applications"}</h1>
          <p className="text-slate-400 text-sm mt-1">{viewMode === "properties" ? "Submissions pending admin approval" : `${counts.pending} pending review`}</p>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => setViewMode("partners")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${viewMode === "partners" ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
          Partner Applications
        </button>
        <button onClick={() => setViewMode("properties")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${viewMode === "properties" ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
          Property Submissions
        </button>
      </div>

      {viewMode === "properties" ? (
        <PropertySubmissionsList />
      ) : (
      <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: counts.total, icon: Users, color: "text-slate-600", bg: "bg-slate-50" },
          { label: "Pending", value: counts.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Approved", value: counts.approved, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Rejected", value: counts.rejected, icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className="text-2xl font-light text-[#0D1B2A]">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-1.5">
          {["all", "pending", "interview_invited", "approved", "rejected", "invited", "spam_review"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-all ${statusFilter === s ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {s === "spam_review" ? `Spam (${counts.spam})` : s}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <div className="flex items-center gap-1.5">
          {[
            { val: "all", label: "All Types" },
            { val: "property_manager", label: "Manager" },
            { val: "property_owner", label: "Owner" },
            { val: "existing_partner_access_request", label: "Portal Access" },
          ].map(t => (
            <button key={t.val} onClick={() => setTypeFilter(t.val)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${typeFilter === t.val ? "bg-[#C9A96E]/15 text-[#0D1B2A] border-[#C9A96E]/40" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {statusFilter === "spam_review" && (counts.rejected + counts.spam) >= 5 && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setBulkSpamOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Bulk delete spam ({counts.rejected + counts.spam})
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No applications in this category</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {/* Header row */}
            <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 bg-slate-50/70 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              <span>Applicant</span><span>Company</span><span>Type</span><span>Properties</span><span>Status</span><span />
            </div>
            {filtered.map(app => {
              const st = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
              const tt = TYPE_STYLES[app.applicant_type] || TYPE_STYLES.property_manager;
              const TypeIcon = tt.icon;
              return (
                <div key={app.id} className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50/60 transition-colors">
                <button onClick={() => setSelected(app.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0D1B2A]/8 flex items-center justify-center font-semibold text-[#0D1B2A] text-xs flex-shrink-0">
                      {app.full_name?.[0] || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm text-[#0D1B2A]">{app.full_name}</span>
                        <StatusPill value={app.status} label={st.label} />
                        <StatusPill variant="brand" label={tt.label} icon={<TypeIcon className="w-2.5 h-2.5" />} />
                        {app.source_label && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${sourceToneClass(app.source_label)}`}>
                            {app.source_label}
                          </span>
                        )}
                        {app.source === "join_v2_experiment" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0D1B2A] text-[#C9A96E] border border-[#C9A96E]/30">
                            Join v2
                          </span>
                        )}
                        {(app.source === "signup_vrm" || app.source === "signup_homeowner") && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#C9A96E]/10 text-[#A68B4B] border border-[#C9A96E]/30">
                            Signup · {app.source === "signup_vrm" ? "VRM" : "Homeowner"}
                          </span>
                        )}
                        {app.applicant_type === "existing_partner_access_request" && app.match_candidates && (() => {
                          const top = app.match_candidates[0];
                          if (!top || top.confidence < 60) return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" /> No confident match
                            </span>
                          );
                          const color = top.confidence > 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200";
                          return (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${color}`}>
                              <Link2 className="w-2.5 h-2.5" /> {top.partner_name} · {top.confidence}%
                            </span>
                          );
                        })()}
                        {app.applicant_type === "property_owner" && app.submitted_properties?.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C9A96E]/10 text-[#C9A96E] border border-[#C9A96E]/20 flex items-center gap-1">
                            <Home className="w-2.5 h-2.5" /> {app.submitted_properties.length} properties
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-3">
                        <span>{app.email}</span>
                        {app.company_name && <span>· {app.company_name}</span>}
                        {app.property_count && <span>· {app.property_count} properties</span>}
                        {(app.property_locations || app.property_address) && <span>· {app.property_locations || app.property_address}</span>}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 flex-shrink-0">{new Date(app.created_date).toLocaleDateString()}</div>
                  </div>
                </button>
                {app.status === "spam_review" && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleRestoreSpam(app)}
                      className="text-[11px] font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                      Not spam
                    </button>
                    <button onClick={() => handleDeleteSpam(app)}
                      className="text-[11px] font-medium text-red-600 border border-red-200 bg-red-50 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                      Delete
                    </button>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0D1B2A] text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#C9A96E]" /> {toast}
        </div>
      )}

      <BulkDeleteSpamModal
        open={bulkSpamOpen}
        onOpenChange={setBulkSpamOpen}
        onDone={handleBulkSpamDone}
      />
    </div>
  );
}