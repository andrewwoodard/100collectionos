import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useToast } from "@/components/ui/use-toast";
import PortalLayout from "../../components/portal/PortalLayout";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { filterNotificationsByRole, getEffectiveRole } from "@/lib/partnerRoles";

const TYPE_STYLES = {
  submitted:      "bg-indigo-50 text-indigo-600",
  approved:       "bg-emerald-50 text-emerald-600",
  needs_revision: "bg-orange-50 text-orange-600",
  rejected:       "bg-red-50 text-red-600",
  licensed:       "bg-teal-50 text-teal-600",
  billed:         "bg-blue-50 text-blue-600",
  general:        "bg-slate-50 text-slate-600",
};

export default function PortalNotifications() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: rawNotifications = [], isLoading: loadingNotifications } = useQuery({
    queryKey: ["all-notifications", user?.email],
    queryFn: () => base44.entities.PortalNotification.filter({ recipient_email: user.email }),
    enabled: !!user?.email,
  });
  const effectiveRole = getEffectiveRole(user);
  const notifications = filterNotificationsByRole(rawNotifications, effectiveRole);

  const markRead = useMutation({
    mutationFn: (id) => base44.entities.PortalNotification.update(id, { is_read: true }),
    onSuccess: () => qc.invalidateQueries(["all-notifications"]),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const updates = notifications.filter(n => !n.is_read).map(n => ({ id: n.id, is_read: true }));
      return base44.entities.PortalNotification.bulkUpdate(updates);
    },
    onSuccess: () => {
      qc.invalidateQueries(["all-notifications"]);
      toast({ title: "All notifications cleared." });
    },
    onError: (error) => {
      toast({ title: "Failed to clear notifications", description: error?.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const unread = notifications.filter(n => !n.is_read);

  return (
    <PortalLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Partner Portal</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Notifications</h1>
        </div>
        {unread.length > 0 && (
          <button
            onClick={() => clearAllMutation.mutate()}
            disabled={clearAllMutation.isPending}
            className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 hover:text-[#C9A96E] transition-colors disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" /> {clearAllMutation.isPending ? "Clearing…" : "Clear all"}
          </button>
        )}
      </div>

      <div className="max-w-2xl">
        {loadingNotifications ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-slate-100 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-slate-100 rounded w-2/3" />
                    <div className="h-3 bg-slate-50 rounded w-full" />
                    <div className="h-2.5 bg-slate-50 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
            <Bell className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">You're all caught up.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...notifications].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map(n => (
              <div key={n.id}
                onClick={() => {
                  if (!n.is_read) markRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={`bg-white rounded-2xl border shadow-sm p-5 cursor-pointer transition-all ${n.is_read ? "border-slate-100 opacity-60" : "border-[#C9A96E]/30 hover:border-[#C9A96E]/50"}`}>
                <div className="flex items-start gap-3">
                  {/* Unread dot */}
                  <div className="flex-shrink-0 pt-1.5">
                    {!n.is_read
                      ? <span className="w-2 h-2 rounded-full bg-[#C9A96E] block" />
                      : <span className="w-2 h-2 rounded-full block" />
                    }
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-[#0D1B2A]">{n.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_STYLES[n.type] || TYPE_STYLES.general}`}>
                        {n.type?.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
                    <div className="text-[10px] text-slate-400 mt-2">{new Date(n.created_date).toLocaleString()}</div>
                  </div>
                  {n.link && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}