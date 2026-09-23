import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Webhook, Save, Send, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const GHL_KEYS = ["GHL_WEBHOOK_URL", "GHL_ENABLED"];

export default function GhlConfigCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState({});
  const [testing, setTesting] = useState(false);

  const { data: configRows = [], isLoading } = useQuery({
    queryKey: ["ghl-config"],
    queryFn: () => base44.entities.AppConfig.list("-updated_date", 100),
  });

  const { data: allLogs = [] } = useQuery({
    queryKey: ["ghl-webhook-logs"],
    queryFn: () => base44.entities.AuditEntry.list("-created_date", 50),
  });
  const webhookLogs = allLogs
    .filter((l) => l.action === "ghl_webhook_fired" || l.action === "ghl_webhook_failed")
    .slice(0, 10);

  useEffect(() => {
    if (!isLoading && Object.keys(draft).length === 0) {
      const map = {};
      for (const row of configRows) {
        if (GHL_KEYS.includes(row.key)) {
          map[row.key] = row.value || "";
        }
      }
      for (const k of GHL_KEYS) {
        if (!(k in map)) map[k] = k === "GHL_ENABLED" ? "false" : "";
      }
      setDraft(map);
    }
  }, [isLoading, configRows]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      for (const key of GHL_KEYS) {
        const existing = configRows.find((r) => r.key === key);
        if (existing) {
          await base44.entities.AppConfig.update(existing.id, {
            value: draft[key] || "",
            updated_by: user?.email || "",
          });
        } else {
          await base44.entities.AppConfig.create({
            key,
            value: draft[key] || "",
            updated_by: user?.email || "",
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(["ghl-config"]);
      toast({ title: "GHL settings saved" });
    },
  });

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await base44.functions.invoke("fireGhlWebhook", { is_test: true });
      if (res?.data?.ok) {
        toast({ title: "Test webhook sent", description: `Status: ${res.data.status_code || "ok"}` });
      } else {
        toast({ title: "Webhook test failed", description: res?.data?.error || res?.data?.skipped || "Unknown error", variant: "destructive" });
      }
      qc.invalidateQueries(["ghl-webhook-logs"]);
    } catch (e) {
      toast({ title: "Webhook test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const isEnabled = draft.GHL_ENABLED === "true";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Webhook className="w-4 h-4 text-gray-400" /> GHL Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-500">
          Sync qualification decisions to Go High Level so marketing automations can segment contacts.
          Multi-property homeowners are tagged differently so they stay in nurture for future qualification.
        </p>

        {/* Webhook URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">GHL Webhook URL</label>
          <input
            type="text"
            value={draft.GHL_WEBHOOK_URL || ""}
            onChange={(e) => setDraft((d) => ({ ...d, GHL_WEBHOOK_URL: e.target.value }))}
            placeholder="https://rest.gohighlevel.com/v1/webhooks/..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        {/* Enabled toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-medium text-gray-600">Enable GHL sync</label>
            <p className="text-[11px] text-gray-400">When off, webhook calls are skipped gracefully.</p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => setDraft((d) => ({ ...d, GHL_ENABLED: checked ? "true" : "false" }))}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || isLoading}
            className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#1a2e45] disabled:opacity-40 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> {saveMut.isPending ? "Saving..." : "Save Settings"}
          </button>
          <button
            onClick={sendTest}
            disabled={testing}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send test webhook
          </button>
        </div>

        {/* Recent webhook fires */}
        {webhookLogs.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent webhook fires</div>
            <div className="space-y-1.5">
              {webhookLogs.map((log) => {
                const details = (() => { try { return JSON.parse(log.details); } catch { return {}; } })();
                const isFailed = log.action === "ghl_webhook_failed";
                return (
                  <div key={log.id} className="flex items-center gap-2 text-xs">
                    {isFailed ? (
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    )}
                    <span className="text-gray-500">{details.decision || "—"}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">{details.tag || "—"}</span>
                    {details.status_code && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className={isFailed ? "text-red-500" : "text-gray-400"}>{details.status_code}</span>
                      </>
                    )}
                    <span className="text-gray-300 ml-auto">{new Date(log.created_date).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}