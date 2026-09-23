import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link2, Search, Loader2, AlertTriangle } from "lucide-react";

export default function LinkExistingUserModal({ partnerId, partner, onClose, onSuccess }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState("");

  const existingIds = useMemo(() => {
    const ids = new Set(partner?.portal_user_ids || []);
    if (partner?.portal_user_id) ids.add(partner.portal_user_id);
    return ids;
  }, [partner]);

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ["linkable-users"],
    queryFn: () => base44.entities.User.list("-created_date", 500),
  });

  const eligibleUsers = useMemo(() => {
    return allUsers.filter(
      (u) => (u.role === "partner" || u.role === "admin") && !existingIds.has(u.id)
    );
  }, [allUsers, existingIds]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return eligibleUsers;
    const q = search.toLowerCase();
    return eligibleUsers.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [eligibleUsers, search]);

  const selectedUser = eligibleUsers.find((u) => u.id === selectedUserId);
  const displayName = (u) => u?.full_name || u?.email || "Unknown user";

  const handleLink = async (confirmTransfer = false) => {
    if (!selectedUserId) return;
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("managePartnerTeam", {
        action: "link_member",
        partner_id: partnerId,
        user_id: selectedUserId,
        confirm_transfer: confirmTransfer,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.conflict && !confirmTransfer) {
        setConflict(res.data);
        setLoading(false);
        return;
      }
      toast({
        description: `Linked ${displayName(selectedUser)} to ${partner?.partner_name}.`,
      });
      onSuccess?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to link user");
    } finally {
      setLoading(false);
    }
  };

  const resetConflict = () => {
    setConflict(null);
    setSelectedUserId(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#C9A96E]" /> Link existing user to {partner?.partner_name}
          </DialogTitle>
        </DialogHeader>

        {conflict ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>{displayName(selectedUser)}</strong> is currently linked to{" "}
                <strong>{conflict.other_partner_name}</strong>. Linking them here will
                remove them from that partner. Continue?
              </span>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto -mx-1 rounded-lg border border-gray-100">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  {search.trim()
                    ? "No matching users found."
                    : "No eligible partner-role users to link."}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredUsers.map((u) => {
                    const isSelected = u.id === selectedUserId;
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${
                          isSelected ? "bg-[#C9A96E]/10" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#C9A96E]/15 flex items-center justify-center text-[#C9A96E] font-semibold text-xs shrink-0">
                          {(u.full_name || u.email || "?")[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {u.full_name || u.email}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-[#C9A96E] flex items-center justify-center shrink-0">
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {conflict ? (
            <>
              <Button variant="outline" onClick={resetConflict} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={() => handleLink(true)}
                disabled={loading}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
                Link & Transfer
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={() => handleLink(false)}
                disabled={!selectedUserId || loading}
                className="bg-[#0D1B2A] text-white hover:bg-[#1a2f47]"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
                Link user
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}