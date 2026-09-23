import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import StatusPill from "@/components/shared/StatusPill";
import EditChanges from "@/components/portal/admin/EditChanges";
import { Search, Eye, CheckCircle, X, Building2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

// Fields to copy from the edit submission onto the source Property when approved
const EDITABLE_FIELDS = [
  "headline", "short_summary", "description", "bedrooms", "bathrooms",
  "sleeps", "amenities", "design_style_notes", "unique_features",
  "why_100_collection", "best_fit_guest", "photo_urls",
];

export default function AdminPropertyEdits({ embedded }) {
  const [search, setSearch] = useState("");
  const [revisionNotes, setRevisionNotes] = useState({});
  const qc = useQueryClient();

  const { data: allSubmissions = [], isLoading } = useQuery({
    queryKey: ["admin-property-edits"],
    queryFn: () => base44.entities.PropertySubmission.list("-submitted_date", 300),
  });

  // Only edit-type submissions
  const editSubmissions = allSubmissions.filter(s => s.submission_type === "edit");

  // Fetch the source Property records so we can show a real before/after diff
  const sourceIds = React.useMemo(
    () => Array.from(new Set(editSubmissions.map(s => s.source_property_id).filter(Boolean))),
    [editSubmissions]
  );
  const { data: sourceProperties = {} } = useQuery({
    queryKey: ["edit-source-properties", sourceIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        sourceIds.map(id => base44.entities.Property.get(id).catch(() => null))
      );
      const map = {};
      results.forEach((p, i) => { if (p) map[sourceIds[i]] = p; });
      return map;
    },
    enabled: sourceIds.length > 0,
  });

  const filtered = editSubmissions.filter(s =>
    !search ||
    s.property_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.partner_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Approve: copy editable fields onto source Property, send PortalNotification, mark approved
  const approveMut = useMutation({
    mutationFn: async (sub) => {
      if (!sub.source_property_id) throw new Error("No source_property_id on this submission");

      // Build patch from editable fields
      const patch = {};
      EDITABLE_FIELDS.forEach(f => {
        if (sub[f] !== undefined && sub[f] !== null && sub[f] !== "") patch[f] = sub[f];
      });
      await base44.entities.Property.update(sub.source_property_id, patch);

      // Mark submission approved
      await base44.entities.PropertySubmission.update(sub.id, {
        status: "approved",
        approved_date: new Date().toISOString(),
      });

      // Notify partner
      if (sub.partner_email) {
        await base44.entities.PortalNotification.create({
          recipient_email: sub.partner_email,
          recipient_role: "partner",
          type: "approved",
          title: `Changes to ${sub.property_name} approved`,
          message: `Your requested changes to ${sub.property_name} have been approved. They'll go live within 24 hours.`,
          link: "/portal/properties",
          submission_id: sub.id,
          property_name: sub.property_name,
          is_read: false,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(["admin-property-edits"]);
      toast.success("Changes approved and applied to property");
    },
  });

  const rejectMut = useMutation({
    mutationFn: async (sub) => {
      await base44.entities.PropertySubmission.update(sub.id, { status: "rejected" });
      if (sub.partner_email) {
        await base44.entities.PortalNotification.create({
          recipient_email: sub.partner_email,
          recipient_role: "partner",
          type: "rejected",
          title: `Changes to ${sub.property_name} not approved`,
          message: `Your requested changes to ${sub.property_name} were not approved.${revisionNotes[sub.id] ? " Feedback: " + revisionNotes[sub.id] : ""}`,
          link: "/portal/properties",
          submission_id: sub.id,
          property_name: sub.property_name,
          is_read: false,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(["admin-property-edits"]);
      toast.success("Edit rejected");
    },
  });

  const requestRevisionMut = useMutation({
    mutationFn: async (sub) => {
      const notes = revisionNotes[sub.id] || "";
      await base44.entities.PropertySubmission.update(sub.id, {
        status: "needs_revision",
        revision_notes: notes,
      });
      if (sub.partner_email) {
        await base44.entities.PortalNotification.create({
          recipient_email: sub.partner_email,
          recipient_role: "partner",
          type: "needs_revision",
          title: `Revision requested for ${sub.property_name}`,
          message: `Our team has requested revisions to your changes for ${sub.property_name}.${notes ? " Notes: " + notes : ""}`,
          link: "/portal/properties",
          submission_id: sub.id,
          property_name: sub.property_name,
          is_read: false,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(["admin-property-edits"]);
      toast.success("Revision request sent");
    },
  });

  const statusCounts = {
    pending: editSubmissions.filter(s => s.status === "submitted").length,
    revision: editSubmissions.filter(s => s.status === "needs_revision").length,
    approved: editSubmissions.filter(s => s.status === "approved").length,
    rejected: editSubmissions.filter(s => s.status === "rejected").length,
  };

  return (
    <div>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-light text-[#0D1B2A]">Property Edit Submissions</h1>
          <p className="text-slate-400 text-sm mt-1">Partner-submitted change requests for active portfolio properties</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Awaiting Review", val: statusCounts.pending, color: "text-amber-600" },
          { label: "Needs Revision", val: statusCounts.revision, color: "text-orange-600" },
          { label: "Approved", val: statusCounts.approved, color: "text-emerald-600" },
          { label: "Rejected", val: statusCounts.rejected, color: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-100 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">{s.label}</div>
            <div className={`text-2xl font-light ${s.color}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by property or partner…"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white" />
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-slate-100 rounded w-1/3" />
                <div className="h-3 bg-slate-50 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No property edit submissions</p>
          <p className="text-slate-400 text-xs mt-1">Edit requests from partners will appear here</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {filtered.map(sub => (
              <div key={sub.id} className="px-6 py-5 hover:bg-slate-50/40 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="font-medium text-sm text-[#0D1B2A]">{sub.property_name}</p>
                      <StatusPill value={sub.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {sub.partner_name || "—"} · Submitted {sub.submitted_date ? new Date(sub.submitted_date).toLocaleDateString() : new Date(sub.created_date).toLocaleDateString()}
                    </p>
                    {sub.notes_to_team && (
                      <p className="text-xs text-slate-500 mt-2 italic">"{sub.notes_to_team}"</p>
                    )}
                    {/* Before/after change diff */}
                    <EditChanges sub={sub} sourceProperty={sourceProperties[sub.source_property_id]} />
                  </div>

                  {/* Actions */}
                  {(sub.status === "submitted" || sub.status === "needs_revision") && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveMut.mutate(sub)}
                        disabled={approveMut.isPending || !sub.source_property_id}
                        title={sub.source_property_id ? "Approve & apply changes" : "Missing source_property_id"}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => requestRevisionMut.mutate(sub)}
                        disabled={requestRevisionMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Revise
                      </button>
                      <button
                        onClick={() => rejectMut.mutate(sub)}
                        disabled={rejectMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>

                {/* Revision notes input */}
                {(sub.status === "submitted" || sub.status === "needs_revision") && (
                  <div className="mt-3">
                    <input
                      value={revisionNotes[sub.id] || ""}
                      onChange={e => setRevisionNotes(r => ({ ...r, [sub.id]: e.target.value }))}
                      placeholder="Optional notes for partner (shown on Revise or Reject)…"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/40">
            <p className="text-xs text-slate-400">{filtered.length} edit{filtered.length === 1 ? "" : "s"}</p>
          </div>
        </div>
      )}
    </div>
  );
}