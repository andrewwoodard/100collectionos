import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { sourceToneClass, formatAttributionTooltip } from "@/lib/attribution";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import ConfirmActionModal, { ACCESS_ACTIONS } from "@/components/admin/ConfirmActionModal";
import UndoActionToast from "@/components/admin/UndoActionToast";
import {
  Mail, UserPlus, ArrowRight, X, Building2, Sparkles, Inbox, Users as UsersIcon, Undo2, AlertTriangle,
} from "lucide-react";

// TODO: cross-reference with Google Calendar + Gmail to warn when a person in
// the queue already has a meeting scheduled or a recent email thread with a
// teammate. Until those connectors are wired up to check this automatically,
// we cannot surface external "context signals" on a row.

const SOURCE_LABEL = {
  cold_signup: "New sign-up",
  team_access_request: "Team access request",
  manual: "Manual",
};

const STATUS_TONE = {
  auto_routed: "bg-amber-50 border-amber-200 text-amber-700",
  pending: "bg-slate-100 border-slate-200 text-slate-700",
  approved: "bg-emerald-50 border-emerald-200 text-emerald-700",
  rejected: "bg-slate-100 border-slate-200 text-slate-500",
  routed_to_application: "bg-blue-50 border-blue-200 text-blue-700",
  converted_to_application: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

const SOURCE_TONE = {
  cold_signup: "bg-amber-50 border-amber-200 text-amber-700",
  team_access_request: "bg-slate-100 border-slate-200 text-slate-700",
  manual: "bg-slate-100 border-slate-200 text-slate-700",
};

function Pill({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${className}`}>
      {children}
    </span>
  );
}

function SourcePill({ request }) {
  const label = request.source_label || request.attribution?.source_label || "Unknown (pre-tracking)";
  const tooltip = formatAttributionTooltip(request.attribution);
  return (
    <span
      title={tooltip || label}
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${sourceToneClass(label)}`}
    >
      {label}
    </span>
  );
}

export default function AdminAccessQueue({ embedded, applications = [] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [approveTarget, setApproveTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [undoState, setUndoState] = useState(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["portal-access-requests"],
    queryFn: () => base44.entities.PortalAccessRequest.list("-created_date", 200),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["admin-partners-light"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
  });

  const openRequests = requests.filter(r => ["auto_routed", "pending"].includes(r.status));
  const coldSignups = openRequests.filter(r => r.source === "cold_signup");
  const teamRequests = openRequests.filter(r => r.source === "team_access_request");
  const newApplicants = applications.filter(a => a.status === "pending");
  const convertedRequests = requests.filter(r => r.status === "converted_to_application");

  // Recovery banner: actions another admin took in the last 30 minutes that
  // haven't been dismissed. Lets a teammate undo a colleague's accidental
  // route/decline without that person needing to figure it out themselves.
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
  const recentByOthers = requests.filter(r =>
    r.action_taken_by &&
    r.action_taken_at &&
    r.action_taken_by !== user?.email &&
    new Date(r.action_taken_at).getTime() > thirtyMinAgo &&
    ["routed_to_application", "rejected", "approved"].includes(r.status) &&
    !localStorage.getItem(`undo_dismissed_${r.id}`)
  );

  const tabs = [
    { id: "all", label: "All", count: openRequests.length + newApplicants.length },
    { id: "cold_signup", label: "New sign-up", count: coldSignups.length },
    { id: "team", label: "Team access request", count: teamRequests.length },
    { id: "applicant", label: "New applicant", count: newApplicants.length },
    { id: "converted", label: "Converted", count: convertedRequests.length },
  ];

  const processMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("processAccessRequest", payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["portal-access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-partners-light"] });
      setSelected(new Set());
      setApproveTarget(null);
      setConfirmTarget(null);
      const ctx = vars?._context;
      if (ctx?.offerUndo) {
        setUndoState({
          requestId: vars.request_id,
          name: ctx.name,
          email: ctx.email,
          actionLabel: ctx.actionLabel,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
      } else {
        toast({ title: "Action complete" });
      }
    },
    onError: (err) => toast({
      title: "Action failed",
      description: err?.response?.data?.error || err.message,
      variant: "destructive",
    }),
  });

  const undoMutation = useMutation({
    mutationFn: (requestId) => base44.functions.invoke("undoAccessRequestAction", { request_id: requestId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portal-access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
      setUndoState(null);
      toast({
        title: data?.email_cancelled ? "Undone — email cancelled" : "Undone — queue restored",
        description: data?.email_cancelled
          ? "The scheduled email was cancelled before it sent."
          : "The email may have already sent. The queue row is back. Check the audit log.",
      });
    },
    onError: (err) => toast({
      title: "Undo failed",
      description: err?.response?.data?.error || err.message,
      variant: "destructive",
    }),
  });

  const handleAction = (requestId, action, extra = {}, context = {}) => {
    processMutation.mutate({ request_id: requestId, action, ...extra, _context: context });
  };

  const handleBulkRoute = () => {
    for (const id of selected) {
      processMutation.mutate({ request_id: id, action: "route_to_application" });
    }
    setSelected(new Set());
    toast({ title: `Routing ${selected.size} sign-up${selected.size > 1 ? "s" : ""} to application` });
  };

  const dismissRecovery = (id) => {
    localStorage.setItem(`undo_dismissed_${id}`, "1");
    queryClient.invalidateQueries({ queryKey: ["portal-access-requests"] });
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const renderRequestRow = (r) => {
    const isCold = r.source === "cold_signup";
    return (
      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
        <td className="px-3 py-3 w-8">
          {isCold && (
            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
          )}
        </td>
        <td className="px-3 py-3">
          <div className="font-medium text-[#0D1B2A] text-sm">{r.full_name || r.email}</div>
          {r.full_name && <div className="text-xs text-slate-500">{r.email}</div>}
          <div className="mt-1">
            <Pill className="bg-slate-50 border-slate-200 text-slate-600">
              <Mail className="w-3 h-3" /> {r.email_domain || r.email.split("@")[1]}
            </Pill>
          </div>
        </td>
        <td className="px-3 py-3">
          <Pill className={SOURCE_TONE[r.source] || SOURCE_TONE.manual}>
            {SOURCE_LABEL[r.source] || r.source}
          </Pill>
          {r.status !== "auto_routed" && r.status !== "pending" && (
            <Pill className={STATUS_TONE[r.status] || "bg-slate-100 border-slate-200 text-slate-600"}>
              {r.status.replace(/_/g, " ")}
            </Pill>
          )}
        </td>
        <td className="px-3 py-3">
          <SourcePill request={r} />
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap gap-1">
            {r.matched_partner_name ? (
              <Pill className="bg-emerald-50 border-emerald-200 text-emerald-700">
                <Building2 className="w-3 h-3" /> {r.matched_partner_name}
              </Pill>
            ) : (
              <Pill className="bg-slate-50 border-slate-200 text-slate-400">No partner match</Pill>
            )}
            {r.matched_application_id && (
              <Pill className="bg-blue-50 border-blue-200 text-blue-700">
                <Inbox className="w-3 h-3" /> Applied {r.matched_application_date ? new Date(r.matched_application_date).toLocaleDateString() : ""}
              </Pill>
            )}
            {!r.matched_partner_name && !r.matched_application_id && isCold && (
              <Pill className="bg-amber-50 border-amber-200 text-amber-700">
                <Sparkles className="w-3 h-3" /> Route to application
              </Pill>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-right">
          {["auto_routed", "pending"].includes(r.status) ? (
            <div className="flex flex-col items-end gap-2">
              {[
                { key: "grant", onClick: () => setApproveTarget(r) },
                { key: "invite", onClick: () => setConfirmTarget({ request: r, actionKey: "invite" }) },
                { key: "decline", onClick: () => setConfirmTarget({ request: r, actionKey: "decline" }) },
              ].map(({ key, onClick }) => {
                const def = ACCESS_ACTIONS[key];
                const isDecline = key === "decline";
                return (
                  <button
                    key={key}
                    onClick={onClick}
                    className={`group text-left rounded-lg border px-3 py-1.5 transition-colors ${
                      isDecline
                        ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-[13px] font-medium leading-tight">{def.label}</div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{def.subtitle}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-slate-400">
              {r.action_taken?.replace(/_/g, " ")} {r.action_taken_at ? `on ${new Date(r.action_taken_at).toLocaleDateString()}` : ""}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const renderApplicantRow = (a) => (
    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/60">
      <td></td>
      <td className="px-3 py-3">
        <div className="font-medium text-[#0D1B2A] text-sm">{a.full_name || a.email}</div>
        {a.full_name && <div className="text-xs text-slate-500">{a.email}</div>}
      </td>
      <td className="px-3 py-3">
        <Pill className="bg-emerald-50 border-emerald-200 text-emerald-700">New applicant</Pill>
      </td>
      <td className="px-3 py-3">
        <span className="text-xs text-slate-500">{a.company_name || a.property_locations || "—"}</span>
      </td>
      <td className="px-3 py-3 text-right">
        <Button size="sm" variant="outline" onClick={() => window.location.href = `/admin/applications`}>
          Review <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </td>
    </tr>
  );

  const showRows = useMemo(() => {
    if (tab === "all") return [...openRequests.map(renderRequestRow), ...newApplicants.map(renderApplicantRow)];
    if (tab === "cold_signup") return coldSignups.map(renderRequestRow);
    if (tab === "team") return teamRequests.map(renderRequestRow);
    if (tab === "applicant") return newApplicants.map(renderApplicantRow);
    if (tab === "converted") return convertedRequests.map(renderRequestRow);
    return [];
  }, [tab, requests, applications, selected]);

  return (
    <div className={embedded ? "" : "max-w-6xl mx-auto"}>
      <div className="mb-4">
        <h2 className="text-lg font-light text-[#0D1B2A]">Access Requests</h2>
        <p className="text-sm text-slate-500">Unified queue for cold signups, team access requests, and new applicants.</p>
      </div>

      {/* Recovery banner: recent actions by other admins */}
      {recentByOthers.map(r => {
        const def = r.action_taken === "reject"
          ? ACCESS_ACTIONS.decline
          : r.action_taken === "route_to_application"
            ? ACCESS_ACTIONS.invite
            : ACCESS_ACTIONS.grant;
        const when = new Date(r.action_taken_at).toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
        return (
          <div key={r.id} className="mb-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 text-sm text-amber-900">
              <span className="font-medium">{r.action_taken_by}</span> {def.label.toLowerCase()}d{" "}
              <span className="font-medium">{r.full_name || r.email}</span> ({r.email}) at {when}.
              {r.scheduled_email_id && " The email may still be cancellable."}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-amber-800 border-amber-300 hover:bg-amber-100"
                disabled={undoMutation.isPending}
                onClick={() => undoMutation.mutate(r.id)}
              >
                <Undo2 className="w-3 h-3 mr-1" /> Undo
              </Button>
              <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => dismissRecovery(r.id)}>
                <X className="w-3 h-3 mr-1" /> Dismiss
              </Button>
            </div>
          </div>
        );
      })}

      {/* Tabs */}
      <div className="mb-4 border-b border-slate-100 overflow-x-auto">
        <div className="flex min-w-max">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-all ${
                  active ? "border-[#C9A96E] text-[#0D1B2A]" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight ${
                  active ? "bg-[#C9A96E] text-white" : "bg-slate-100 text-slate-600"
                }`}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk bar */}
      {tab === "cold_signup" && selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <span className="text-sm text-amber-800 font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
            <Button size="sm" onClick={handleBulkRoute} disabled={processMutation.isPending}>
              <UserPlus className="w-3 h-3 mr-1" /> Route to application
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#C9A96E] rounded-full animate-spin"></div>
        </div>
      ) : showRows.length === 0 ? (
        <div className="py-16 text-center">
          <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No requests in this queue right now.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-slate-100 rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Signals</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>{showRows}</tbody>
          </table>
        </div>
      )}

      {/* Approve modal (serves as the confirm step for grant portal access) */}
      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          partners={partners}
          onClose={() => setApproveTarget(null)}
          onApprove={(payload) =>
            handleAction(approveTarget.id, payload.action, payload, {
              name: approveTarget.full_name || approveTarget.email.split("@")[0],
              email: approveTarget.email,
              actionLabel: ACCESS_ACTIONS.grant.label,
              offerUndo: false,
            })
          }
          pending={processMutation.isPending}
        />
      )}

      {/* Confirm modal for send application invite / decline */}
      {confirmTarget && (
        <ConfirmActionModal
          request={confirmTarget.request}
          actionKey={confirmTarget.actionKey}
          pending={processMutation.isPending}
          onClose={() => setConfirmTarget(null)}
          onConfirm={(extra) => {
            const r = confirmTarget.request;
            const action = confirmTarget.actionKey === "invite" ? "route_to_application" : "reject";
            const label = ACCESS_ACTIONS[confirmTarget.actionKey].label;
            handleAction(
              r.id,
              action,
              extra,
              {
                name: r.full_name || r.email.split("@")[0],
                email: r.email,
                actionLabel: label,
                offerUndo: true,
              }
            );
          }}
        />
      )}

      {/* Persistent undo toast */}
      <UndoActionToast
        undoState={undoState}
        undoing={undoMutation.isPending}
        onUndo={() => undoMutation.mutate(undoState.requestId)}
        onDismiss={() => setUndoState(null)}
      />
    </div>
  );
}

function ApproveModal({ request, partners, onClose, onApprove, pending }) {
  const [mode, setMode] = useState(request.matched_partner_id ? "team" : "new");
  const [partnerId, setPartnerId] = useState(request.matched_partner_id || "");
  const [role, setRole] = useState("operations");
  const [partnerName, setPartnerName] = useState("");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approve portal access</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-slate-600">
            <span className="font-medium text-[#0D1B2A]">{request.email}</span>
            {request.matched_partner_name && (
              <span className="block mt-1 text-xs">Matched partner: {request.matched_partner_name}</span>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">What will happen</div>
            <ul className="space-y-1">
              {ACCESS_ACTIONS.grant.bullets(request.email).map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#0D1B2A" }} />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setMode("team")}
              className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border ${mode === "team" ? "border-[#C9A96E] bg-[#FBF6EF] text-[#0D1B2A]" : "border-slate-200 text-slate-500"}`}
            >
              Existing partner team
            </button>
            <button
              onClick={() => setMode("new")}
              className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border ${mode === "new" ? "border-[#C9A96E] bg-[#FBF6EF] text-[#0D1B2A]" : "border-slate-200 text-slate-500"}`}
            >
              New partner
            </button>
          </div>

          {mode === "team" ? (
            <>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Partner</label>
                <select
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a partner...</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.partner_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="owner">Owner</option>
                  <option value="marketing">Marketing</option>
                  <option value="finance">Finance</option>
                  <option value="operations">Operations</option>
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Partner name</label>
              <input
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder={request.full_name || request.email.split("@")[0]}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || (mode === "team" && !partnerId)}
            onClick={() => onApprove(
              mode === "team"
                ? { action: "approve_team_member", partner_id: partnerId, partner_role: role }
                : { action: "approve_new_partner", partner_name: partnerName }
            )}
          >
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}