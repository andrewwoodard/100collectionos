import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Check } from "lucide-react";

// All hideable menu items (must match page keys in Sidebar navGroups)
const MENU_ITEMS = [
  { page: "Dashboard", label: "Dashboard" },
  { page: "Partners", label: "Partners" },
  { page: "Properties", label: "Properties" },
  { page: "Onboarding", label: "Onboarding" },
  { page: "PartnerFunnelTracker", label: "Funnel Tracker" },
  { page: "Tasks", label: "Tasks" },
  { page: "Documents", label: "Documents" },
  { page: "MediaLibrary", label: "Media Library" },
  { page: "Billing", label: "Billing" },
  { page: "FinanceAlerts", label: "Finance Alerts" },
  { page: "ActivityFeed", label: "Activity" },
  { page: "Reports", label: "Reports" },
  { page: "PartnerReport", label: "Partner Report" },
  { page: "Analytics", label: "Analytics" },
  { page: "LeadershipSummary", label: "Leadership Summary" },
  { page: "Settings", label: "Settings" },
];

export default function MenuVisibilityCard() {
  const { user, refreshUser } = useAuth();
  const [hidden, setHiddenState] = useState(user?.sidebar_hidden_pages || []);
  const [changes, setChanges] = useState({});
  const [saved, setSaved] = useState(false);
  const loading = !user;

  const toggle = (page) => {
    const next = hidden.includes(page)
      ? hidden.filter(p => p !== page)
      : [...hidden, page];
    setHiddenState(next);
    setChanges({ [page]: true });
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      await base44.auth.updateMe({ sidebar_hidden_pages: hidden });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setChanges({});
    } catch (err) {
      console.error("Failed to save menu visibility:", err);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-400" /> Menu Visibility
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="w-4 h-4 text-gray-400" /> Menu Visibility
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-4">Toggle which menu items are visible to all users. Hidden items are still accessible via direct URL.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {MENU_ITEMS.map(({ page, label }) => {
            const isHidden = hidden.includes(page);
            return (
              <div key={page} className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <span className={`text-sm ${isHidden ? "text-gray-400 line-through" : "text-gray-800 font-medium"}`}>{label}</span>
                <button
                  onClick={() => toggle(page)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    !isHidden ? "bg-[#0F172A]" : "bg-gray-200"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    !isHidden ? "translate-x-[18px]" : "translate-x-1"
                  }`} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={Object.keys(changes).length === 0}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              Object.keys(changes).length === 0
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-[#0F172A] text-white hover:bg-[#1a2442]"
            }`}
          >
            Save Changes
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <Check className="w-4 h-4" /> Saved
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}