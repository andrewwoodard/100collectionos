import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Mail, RotateCcw, Ban, Loader2, Clock, CheckCircle2, Send, AlertCircle } from "lucide-react";

const ROLE_STYLES = {
  owner: "bg-blue-50 text-blue-700 border-blue-200",
  marketing: "bg-amber-50 text-amber-700 border-amber-200",
  finance: "bg-emerald-50 text-emerald-700 border-emerald-200",
  operations: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function AdminInvitations({ embedded = false }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: () => base44.entities.PartnerInvitation.list("-created_date", 200),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partner-entities-admin"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
  });

  const partnerMap = partners.reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {});

  const pending = invitations.filter(i => i.status === "pending");
  const accepted = invitations.filter(i => i.status === "accepted");

  // Approved partners with no portal access and no pending invitation — need an invite sent
  const pendingPartnerIds = new Set(pending.map(i => i.partner_id));
  const needsInvite = partners.filter(p =>
    p.primary_contact_email &&
    !p.portal_user_id &&
    !pendingPartnerIds.has(p.id) &&
    ["approved", "onboarding", "live"].includes(p.status)
  );

  const handleSendInvite = async (partner) => {
    setBusyId(partner.id);
    try {
      const res = await base44.functions.invoke("sendActivationEmail", {
        partner_id: partner.id,
        preview_only: false,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: `Activation email sent to ${res.data.email || partner.primary_contact_email}.` });
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
    } catch (e) {
      toast({ title: e.message || "Failed to send invite", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const filteredPending = pending.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.email?.toLowerCase().includes(q) ||
      i.partner_name?.toLowerCase().includes(q)
    );
  });

  const isExpired = (i) => i.expires_at && new Date(i.expires_at) < new Date();

  const handleResend = async (inv) => {
    setBusyId(inv.id);
    try {
      if (inv.invitation_type === "primary_activation") {
        const res = await base44.functions.invoke("sendActivationEmail", {
          partner_id: inv.partner_id,
          resend: true,
          preview_only: false,
        });
        if (res.data?.error) throw new Error(res.data.error);
        toast({ title: `New activation link sent to ${inv.email}.` });
      } else {
        const res = await base44.functions.invoke("managePartnerInvitation", {
          action: "resend",
          invitation_id: inv.id,
        });
        if (res.data?.error) throw new Error(res.data.error);
        toast({ title: `Invitation resent to ${inv.email}.` });
      }
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
    } catch (e) {
      toast({ title: e.message || "Failed to resend invite", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (inv) => {
    if (!confirm(`Revoke the invitation to ${inv.email}? They will not be able to accept the link.`)) return;
    setBusyId(inv.id);
    try {
      const res = await base44.functions.invoke("managePartnerInvitation", {
        action: "revoke",
        invitation_id: inv.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: `Invitation to ${inv.email} revoked.` });
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
    } catch (e) {
      toast({ title: e.message || "Failed to revoke invite", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveActivate = async (inv) => {
    if (!confirm(`Approve ${inv.email} and activate their portal?\n\nThey'll receive an email to set their own password, and the invitation will be marked accepted.`)) return;
    setBusyId(inv.id);
    try {
      const res = await base44.functions.invoke("approveInviteeActivation", {
        invitation_id: inv.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({
        title: `Approved — activation email sent to ${res.data.email || inv.email}.`,
        description: res.data.linked
          ? "Portal activated. They can log in once they set their password."
          : "Account pre-authorized. They'll be linked when they set their password.",
      });
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
    } catch (e) {
      toast({ title: e.message || "Failed to approve invitee", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const Row = ({ inv }) => {
    const expired = isExpired(inv);
    return (
      <tr key={inv.id} className="hover:bg-slate-50/50">
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0D1B2A]/5 flex items-center justify-center text-[#0D1B2A] font-semibold text-xs">
              {inv.email?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <div className="font-medium text-sm text-[#0D1B2A]">{inv.email}</div>
              {inv.invitation_type === "primary_activation" && (
                <span className="text-[10px] text-[#C9A96E] font-semibold uppercase tracking-wide">Primary Activation</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-sm text-slate-600">{inv.partner_name || "—"}</td>
        <td className="px-5 py-4">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_STYLES[inv.partner_role] || ROLE_STYLES.operations}`}>
            {inv.partner_role}
          </span>
        </td>
        <td className="px-5 py-4 text-xs text-slate-500">
          {inv.expires_at ? (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(inv.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          ) : "—"}
        </td>
        <td className="px-5 py-4">
          {expired ? (
            <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Expired</span>
          ) : (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
          )}
        </td>
        <td className="px-5 py-4">
          <div className="flex gap-2">
            <button
              onClick={() => handleApproveActivate(inv)}
              disabled={busyId === inv.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B2A] text-white text-xs hover:bg-[#1a2f47] transition-colors disabled:opacity-50"
            >
              {busyId === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Approve & Activate
            </button>
            <button
              onClick={() => handleResend(inv)}
              disabled={busyId === inv.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-[#C9A96E] hover:text-[#C9A96E] transition-colors disabled:opacity-50"
            >
              {busyId === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              {expired ? "Resend new link" : "Resend"}
            </button>
            <button
              onClick={() => handleRevoke(inv)}
              disabled={busyId === inv.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              <Ban className="w-3 h-3" /> Revoke
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const inner = (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-light text-[#0D1B2A]">Invitations</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {pending.length} pending · {needsInvite.length} need invite · {accepted.length} accepted
          </p>
        </div>
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or partner..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white w-64"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
        </div>
      </div>

      {needsInvite.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-medium text-slate-600">
              Approved partners needing an invite ({needsInvite.length})
            </h3>
          </div>
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Partner", "Contact", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {needsInvite.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 font-semibold text-xs">
                          {p.partner_name?.[0] || "?"}
                        </div>
                        <span className="font-medium text-sm text-[#0D1B2A]">{p.partner_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">{p.primary_contact_email}</td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full capitalize">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleSendInvite(p)}
                        disabled={busyId === p.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A96E] text-white text-xs hover:bg-[#B8965C] transition-colors disabled:opacity-50"
                      >
                        {busyId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Send invite
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : filteredPending.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
          <Mail className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">
            {search ? "No invitations match your search." : "No pending invitations."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100">
                {["Invitee", "Partner", "Role", "Expires", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredPending.map((inv) => <Row key={inv.id} inv={inv} />)}
            </tbody>
          </table>
        </div>
      )}

      {accepted.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-slate-500 mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Recently Accepted
          </h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Invitee", "Partner", "Role", "Accepted"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {accepted.slice(0, 10).map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-semibold text-xs">
                          {inv.email?.[0]?.toUpperCase() || "?"}
                        </div>
                        <span className="font-medium text-sm text-[#0D1B2A]">{inv.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{inv.partner_name || "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_STYLES[inv.partner_role] || ROLE_STYLES.operations}`}>
                        {inv.partner_role}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {inv.accepted_at ? new Date(inv.accepted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  return embedded ? inner : <div className="p-4 lg:p-6">{inner}</div>;
}