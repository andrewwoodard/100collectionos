import React, { useState } from "react";
import { Search, Bell, LogOut, Menu, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/lib/AuthContext";

export default function TopBar({ title, onMenuClick }) {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bellOpen, setBellOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["topbar-notifications", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const personal = await base44.entities.PortalNotification.filter({ recipient_email: user.email, is_read: false });
      if (user.role !== "partner") {
        const adminRole = await base44.entities.PortalNotification.filter({ recipient_role: "admin", is_read: false });
        const ids = new Set(personal.map(n => n.id));
        return [...personal, ...adminRole.filter(n => !ids.has(n.id))]
          .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
          .slice(0, 10);
      }
      return personal.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10);
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
  });
  const unreadCount = notifications.length;

  const { toast } = useToast();

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const updates = notifications.map(n => ({ id: n.id, is_read: true }));
      return base44.entities.PortalNotification.bulkUpdate(updates);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topbar-notifications"] });
      toast({ title: "All notifications cleared." });
      setBellOpen(false);
    },
    onError: (error) => {
      toast({ title: "Failed to clear notifications", description: error?.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(createPageUrl("Partners") + `?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const initials = user?.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").toUpperCase()
    : "?";

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden text-gray-500 hover:text-gray-700">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search partners, properties..."
            className="pl-9 w-64 h-9 bg-gray-50 border-gray-200 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>

        <DropdownMenu open={bellOpen} onOpenChange={setBellOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-4 h-4 text-gray-500" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#C9A96E] text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {unreadCount === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">No new notifications</div>
            ) : (
              <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notifications</span>
                <button
                  onClick={() => clearAllMutation.mutate()}
                  disabled={clearAllMutation.isPending}
                  className="text-[11px] text-gray-500 hover:text-[#C9A96E] transition-colors disabled:opacity-50"
                >
                  {clearAllMutation.isPending ? "Clearing…" : "Clear all"}
                </button>
              </div>
              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      if (!n.is_read) {
                        await base44.entities.PortalNotification.update(n.id, { is_read: true });
                        qc.invalidateQueries({ queryKey: ["topbar-notifications"] });
                      }
                      setBellOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer flex items-start gap-1"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate">{n.title}</div>
                      <div className="text-[11px] text-gray-500 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{new Date(n.created_date).toLocaleString()}</div>
                    </div>
                    {n.link && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1" />}
                  </button>
                ))}
              </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="h-8 w-8 cursor-pointer bg-[#0F172A]">
              <AvatarFallback className="bg-[#0F172A] text-[#C9A96E] text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-sm">
              <span className="font-medium">{user?.full_name || "User"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => logout()}
              className="text-red-600"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}