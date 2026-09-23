import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import InviteTeammateModal from "./InviteTeammateModal";
import LinkExistingUserModal from "./LinkExistingUserModal";
import { UserPlus, Loader2, Crown, Trash2, Clock, RotateCcw, XCircle, Mail, Users, Link2, Eye } from "lucide-react";
import { useImpersonation } from "@/lib/ImpersonationContext";
import { useToast } from "@/components/ui/use-toast";
import { ROLE_LABELS, ROLE_STYLES, PARTNER_ROLES } from "@/lib/partnerRoles";

export default function TeamMembersSection({ partnerId, canManage, currentUserId }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const { startImpersonation } = useImpersonation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partner-team", partnerId],
    queryFn: async () => {
      const res = await base44.functions.invoke("getPartnerTeam", { partner_id: partnerId });
      return res.data;
    },
    enabled: !!partnerId,
  });

  const partner = data?.partner;
  const teamMembers = data?.teamMembers || [];
  const invitations = data?.invitations || [];
  const pendingInvitations = invitations.filter(i => i.status === "pending");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["partner-team", partnerId] });

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(`role-${userId}`);
    try {
      await base44.functions.invoke("managePartnerTeam", {
        action: "change_role",
        partner_id: partnerId,
        user_id: userId,
        new_role: newRole,
      });
      invalidate();
      toast({ title: `Role changed to ${ROLE_LABELS[newRole]}` });
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message || "Failed to change role";
      toast({ variant: "destructive", title: "Role change failed", description: errMsg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (userId) => {
    if (!confirm("Remove this team member? They will lose portal access immediately.")) return;
    setActionLoading(`remove-${userId}`);
    try {
      await base44.functions.invoke("managePartnerTeam", { action: "remove_member", partner_id: partnerId, user_id: userId });
      invalidate();
    } catch (e) {
      alert(e.response?.data?.error || e.message || "Failed to remove member");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMakePrimary = async (userId) => {
    if (!confirm("Make this member the primary contact? They will become the team manager.")) return;
    setActionLoading(`primary-${userId}`);
    try {
      await base44.functions.invoke("managePartnerTeam", { action: "make_primary", partner_id: partnerId, user_id: userId });
      invalidate();
    } catch (e) {
      alert(e.response?.data?.error || e.message || "Failed to change primary contact");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResend = async (invId) => {
    setActionLoading(`resend-${invId}`);
    try {
      const res = await base44.functions.invoke("managePartnerInvitation", { action: "resend", invitation_id: invId });
      if (res.data?.resend_status === "failed") {
        toast({ variant: "destructive", title: "Email failed to send", description: res.data?.resend_error || "Try again or contact support." });
      } else if (res.data?.resend_status === "skipped") {
        toast({ variant: "destructive", title: "Email not sent", description: "Email sending is not configured." });
      } else {
        toast({ title: "Invitation resent" });
      }
      invalidate();
    } catch (e) {
      alert(e.response?.data?.error || e.message || "Failed to resend invitation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (invId) => {
    if (!confirm("Revoke this invitation? The recipient will no longer be able to accept it.")) return;
    setActionLoading(`revoke-${invId}`);
    try {
      await base44.functions.invoke("managePartnerInvitation", { action: "revoke", invitation_id: invId });
      invalidate();
    } catch (e) {
      alert(e.response?.data?.error || e.message || "Failed to revoke invitation");
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-[#C9A96E]" />
          <h3 className="text-sm font-semibold text-gray-900">Team Members</h3>
        </div>
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded w-1/4" />
                <div className="h-2.5 bg-gray-50 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-[#C9A96E]" />
          <h3 className="text-sm font-semibold text-gray-900">Team Members</h3>
        </div>
        <p className="text-sm text-gray-400 py-4 text-center">
          Unable to load team members. This partner may not be fully synced to Base44 yet.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#C9A96E]" />
          <h3 className="text-sm font-semibold text-gray-900">Team Members</h3>
          {teamMembers.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{teamMembers.length}</span>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)} className="text-gray-500 hover:text-gray-700 text-xs">
              <Link2 className="w-3.5 h-3.5 mr-1.5" /> Link existing user
            </Button>
            <Button size="sm" onClick={() => setInviteOpen(true)} className="bg-[#0D1B2A] text-white hover:bg-[#1a2f47] text-xs">
              <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Invite Teammate
            </Button>
          </div>
        )}
      </div>

      {teamMembers.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          No team members linked yet.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {teamMembers.map(member => {
            const isPrimary = partner?.portal_user_id === member.id;
            return (
              <div key={member.id} className="flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-full bg-[#C9A96E]/15 flex items-center justify-center text-[#C9A96E] font-semibold text-xs shrink-0">
                  {member.full_name?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{member.full_name || member.email}</p>
                  <p className="text-xs text-gray-400 truncate">{member.email}</p>
                </div>
                {isPrimary && (
                  <Badge className="bg-[#C9A96E]/15 text-[#C9A96E] border-0 text-xs shrink-0">
                    <Crown className="w-3 h-3 mr-1" /> Primary
                  </Badge>
                )}
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${ROLE_STYLES[member.partner_role || "owner"] || ROLE_STYLES.owner}`}>
                  {ROLE_LABELS[member.partner_role || "owner"] || "Owner"}
                </span>
                {canManage && member.id !== currentUserId && (
                  <select
                    value={member.partner_role || "owner"}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    disabled={actionLoading === `role-${member.id}`}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 disabled:opacity-50"
                  >
                    {PARTNER_ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => startImpersonation(member.id)}
                  title="View the portal as this user (view-only)"
                  className="text-gray-400 hover:text-blue-500 p-1 rounded transition-colors hover:bg-blue-50"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {canManage && !isPrimary && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMakePrimary(member.id)}
                      disabled={actionLoading === `primary-${member.id}`}
                      title="Make primary"
                      className="text-xs text-gray-400 hover:text-[#C9A96E] px-1.5 py-1 rounded transition-colors hover:bg-[#C9A96E]/5"
                    >
                      {actionLoading === `primary-${member.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Make primary"}
                    </button>
                    <button
                      onClick={() => handleRemove(member.id)}
                      disabled={actionLoading === `remove-${member.id}`}
                      title="Remove from team"
                      className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors hover:bg-red-50"
                    >
                      {actionLoading === `remove-${member.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending Invitations */}
      {canManage && pendingInvitations.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending Invitations</h4>
          </div>
          <div className="space-y-2">
            {pendingInvitations.map(inv => {
              const isExpired = new Date(inv.expires_at) < new Date();
              return (
                <div key={inv.id} className="flex items-center gap-3 py-2 px-3 bg-amber-50/50 rounded-lg">
                  <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{inv.email}</p>
                    <p className="text-[10px] text-gray-400">
                      Sent {new Date(inv.created_date).toLocaleDateString()}
                      {inv.invited_by_name ? ` by ${inv.invited_by_name}` : ""}
                      {isExpired ? " · Expired" : ` · Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleResend(inv.id)}
                      disabled={actionLoading === `resend-${inv.id}`}
                      title="Resend invitation"
                      className="text-gray-400 hover:text-[#C9A96E] p-1 rounded transition-colors hover:bg-[#C9A96E]/5"
                    >
                      {actionLoading === `resend-${inv.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      disabled={actionLoading === `revoke-${inv.id}`}
                      title="Revoke invitation"
                      className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors hover:bg-red-50"
                    >
                      {actionLoading === `revoke-${inv.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Read-only note for non-primary portal users */}
      {!canManage && teamMembers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-50">
          <p className="text-xs text-gray-400">
            Only your account Owner can invite teammates or change roles.
            {(() => {
              const primary = teamMembers.find(m => m.id === partner?.portal_user_id);
              return primary ? ` Contact ${primary.full_name || primary.email} if you need access.` : "";
            })()}
          </p>
        </div>
      )}

      {inviteOpen && (
        <InviteTeammateModal
          partnerId={partnerId}
          partnerName={partner?.partner_name}
          onClose={() => setInviteOpen(false)}
          onSuccess={() => {
            setInviteOpen(false);
            invalidate();
          }}
        />
      )}

      {linkOpen && (
        <LinkExistingUserModal
          partnerId={partnerId}
          partner={partner}
          onClose={() => setLinkOpen(false)}
          onSuccess={() => {
            setLinkOpen(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}