import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CalendarClock, Send, Eye, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const DIGEST_KEYS = {
  daily: { enabled: "DAILY_DIGEST_ENABLED", last: "LAST_DAILY_DIGEST", fn: "dailyAdminDigest", label: "Daily Briefing", schedule: "Weekdays, 8:00 AM ET" },
  weekly: { enabled: "WEEKLY_DIGEST_ENABLED", last: "LAST_WEEKLY_DIGEST", fn: "weeklyAdminDigest", label: "Weekly Digest", schedule: "Mondays, 7:00 AM ET" },
  monthly: { enabled: "MONTHLY_BILLING_ENABLED", last: "LAST_MONTHLY_DIGEST", fn: "monthlyBillingSummary", label: "Monthly Billing", schedule: "1st of month, 8:00 AM ET" },
};

export default function DigestConfigCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draftRecipients, setDraftRecipients] = useState("");
  const [sendingPreview, setSendingPreview] = useState(null);

  const { data: configRows = [], isLoading } = useQuery({
    queryKey: ["digest-config"],
    queryFn: () => base44.entities.AppConfig.list("-updated_date", 100),
  });

  const configMap = {};
  for (const row of configRows) configMap[row.key] = row.value;

  useEffect(() => {
    if (!isLoading) setDraftRecipients(configMap.DIGEST_RECIPIENTS || "");
  }, [isLoading, configMap.DIGEST_RECIPIENTS]);

  const upsertConfig = async (key, value) => {
    const user = await base44.auth.me();
    const existing = configRows.find(r => r.key === key);
    if (existing) {
      await base44.entities.AppConfig.update(existing.id, { value, updated_by: user?.email || "" });
    } else {
      await base44.entities.AppConfig.create({ key, value, updated_by: user?.email || "" });
    }
  };

  const toggleMut = useMutation({
    mutationFn: async ({ key, enabled }) => {
      await upsertConfig(key, enabled ? "true" : "false");
    },
    onSuccess: () => {
      qc.invalidateQueries(["digest-config"]);
      toast({ title: "Digest setting updated" });
    },
  });

  const saveRecipientsMut = useMutation({
    mutationFn: () => upsertConfig("DIGEST_RECIPIENTS", draftRecipients),
    onSuccess: () => {
      qc.invalidateQueries(["digest-config"]);
      toast({ title: "Digest recipients saved" });
    },
  });

  const sendPreview = async (digestKey) => {
    const cfg = DIGEST_KEYS[digestKey];
    const user = await base44.auth.me();
    if (!user?.email) {
      toast({ title: "Could not determine your email", variant: "destructive" });
      return;
    }
    setSendingPreview(digestKey);
    try {
      const res = await base44.functions.invoke(cfg.fn, { preview_recipient: user.email });
      if (res?.data?.skipped === "all_zero") {
        toast({ title: "No activity to digest for this period", description: "The daily briefing skips when everything is zero." });
      } else if (res?.data?.ok || res?.data?.sent) {
        toast({ title: `${cfg.label} preview sent`, description: `Check ${user.email}` });
      } else {
        toast({ title: `${cfg.label} preview sent`, description: `Check ${user.email} (email delivery depends on Resend config)` });
      }
    } catch (e) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setSendingPreview(null);
    }
  };

  const viewLast = async (digestKey) => {
    const cfg = DIGEST_KEYS[digestKey];
    const html = configMap[cfg.last];
    if (!html) {
      toast({ title: "No digest sent yet", description: "Once a digest runs, you can preview it here." });
      return;
    }
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-gray-400" /> Scheduled Digests
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-gray-500">
          Automated briefings sent to your digest recipients (or the admin notification list if blank). Toggle off to pause without disabling the whole system.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Digest Recipients</label>
          <input
            type="text"
            value={draftRecipients}
            onChange={(e) => setDraftRecipients(e.target.value)}
            placeholder="Leave blank to use the Admin Notification List"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
          <p className="text-[11px] text-gray-400">Comma-separated emails. Overrides the admin list for all three digests.</p>
        </div>

        <div className="space-y-3">
          {Object.entries(DIGEST_KEYS).map(([key, cfg]) => {
            const enabled = (configMap[cfg.enabled] ?? "true") !== "false";
            return (
              <div key={key} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Switch checked={enabled} onCheckedChange={(v) => toggleMut.mutate({ key: cfg.enabled, enabled: v })} />
                    <span className="text-sm font-medium text-gray-900">{cfg.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 ml-7">{cfg.schedule}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => viewLast(key)}
                    className="flex items-center gap-1.5 text-xs text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-white transition-colors"
                  >
                    <Eye className="w-3 h-3" /> View last
                  </button>
                  <button
                    onClick={() => sendPreview(key)}
                    disabled={sendingPreview === key}
                    className="flex items-center gap-1.5 text-xs text-white bg-[#0D1B2A] px-2.5 py-1.5 rounded-lg hover:bg-[#1a2e45] disabled:opacity-40 transition-colors"
                  >
                    {sendingPreview === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Send preview
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => saveRecipientsMut.mutate()}
          disabled={saveRecipientsMut.isPending}
          className="text-xs text-[#0D1B2A] font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
        >
          {saveRecipientsMut.isPending ? "Saving…" : "Save recipients"}
        </button>
      </CardContent>
    </Card>
  );
}