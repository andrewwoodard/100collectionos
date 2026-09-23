import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, Loader2, Crown, Trash2, Mail, Clock, RotateCcw, XCircle, AlertCircle } from "lucide-react";
import { ROLE_LABELS, ROLE_PAGE_PREVIEW, PARTNER_ROLES } from "@/lib/partnerRoles";

export default function InviteTeammateModal({ partnerId, partnerName, onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("operations");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("createPartnerInvitation", {
        partner_id: partnerId,
        email: email.trim(),
        partner_role: role,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.resend_status === "failed") {
        throw new Error(res.data?.resend_error || "Email failed to send. Try resending from the Team page.");
      }
      if (res.data?.resend_status === "skipped") {
        throw new Error("Email sending is not configured. Contact an admin.");
      }
      onSuccess?.(res.data);
    } catch (e) {
      setError(e.message || "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#C9A96E]" /> Invite Teammate
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-slate-500">
            Invite a teammate to join <strong>{partnerName}</strong>'s portal. They'll receive an email with a link to create their account.
          </p>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Email address</label>
            <Input
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
            >
              {PARTNER_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">As {ROLE_LABELS[role]}, this person will see: {ROLE_PAGE_PREVIEW[role]}</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!email.trim() || loading} className="bg-[#0D1B2A] text-white hover:bg-[#1a2f47]">
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
            Send Invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}