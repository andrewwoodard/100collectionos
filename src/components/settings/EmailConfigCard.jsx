import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Mail, Save, Eye, EyeOff, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

const CONFIG_KEYS = ["RESEND_API_KEY", "RESEND_FROM", "ADMIN_NOTIFICATION_LIST"];

const LABELS = {
  RESEND_API_KEY: "Resend API Key",
  RESEND_FROM: "Resend From Address",
  ADMIN_NOTIFICATION_LIST: "Admin Notification List",
};

const PLACEHOLDERS = {
  RESEND_API_KEY: "re_xxxxxxxxxxxx",
  RESEND_FROM: "The 100 Collection <noreply@the100collection.com>",
  ADMIN_NOTIFICATION_LIST: "admin@the100collection.com, ops@the100collection.com",
};

export default function EmailConfigCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const [draft, setDraft] = useState({});
  const [sendingTest, setSendingTest] = useState(false);

  const sendTestEmail = async () => {
    const user = await base44.auth.me();
    if (!user?.email) {
      toast({ title: "Could not determine your email", variant: "destructive" });
      return;
    }
    setSendingTest(true);
    try {
      const res = await base44.functions.invoke("sendAdminNotification", {
        eventType: "TEST EMAIL",
        urgency: "success",
        headline: "Admin email template test",
        subheadline: "If you can read this, the branded template is rendering correctly.",
        contextBlock: "This is a test send from Settings to verify the 100 Collection admin email template in your inbox.",
        dataRows: [
          { label: "Sent To", value: user.email },
          { label: "Sent By", value: user.full_name || user.email },
        ],
        ctaLabel: "Open Admin Hub",
        ctaUrl: "https://100c-os.base44.app/AdminHub",
        subject: "Test — 100 Collection admin email template",
        dedup_key: `test_email__${user.id}__${Date.now()}`,
        recipient_override: user.email,
        portalNotification: { type: "general", title: "Admin email test", message: "Template test from Settings", link: "/AdminHub" },
      });
      toast({ title: "Test email sent", description: `Check ${user.email}` + (res?.data?.emailSent ? "" : " (email delivery depends on Resend config)") });
    } catch (e) {
      toast({ title: "Test email failed", description: e.message, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const { data: configRows = [], isLoading } = useQuery({
    queryKey: ["email-config"],
    queryFn: () => base44.entities.AppConfig.list("-updated_date", 50),
  });

  // Initialize draft from loaded config
  React.useEffect(() => {
    if (!isLoading && Object.keys(draft).length === 0) {
      const map = {};
      for (const row of configRows) {
        if (CONFIG_KEYS.includes(row.key)) {
          map[row.key] = row.value || "";
        }
      }
      // Fill missing keys with empty strings
      for (const k of CONFIG_KEYS) {
        if (!(k in map)) map[k] = "";
      }
      setDraft(map);
    }
  }, [isLoading, configRows]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      for (const key of CONFIG_KEYS) {
        const existing = configRows.find(r => r.key === key);
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
      qc.invalidateQueries(["email-config"]);
      toast({ title: "Email settings saved" });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4 text-gray-400" /> Email &amp; Resend Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-500">
          Configure Resend for transactional emails. Leave the API key blank to gracefully skip sends until you&apos;re ready to enable.
        </p>

        {/* API Key */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">{LABELS.RESEND_API_KEY}</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={draft.RESEND_API_KEY || ""}
              onChange={e => setDraft(d => ({ ...d, RESEND_API_KEY: e.target.value }))}
              placeholder={PLACEHOLDERS.RESEND_API_KEY}
              className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* From Address */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">{LABELS.RESEND_FROM}</label>
          <input
            type="text"
            value={draft.RESEND_FROM || ""}
            onChange={e => setDraft(d => ({ ...d, RESEND_FROM: e.target.value }))}
            placeholder={PLACEHOLDERS.RESEND_FROM}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        {/* Admin Notification List */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">{LABELS.ADMIN_NOTIFICATION_LIST}</label>
          <input
            type="text"
            value={draft.ADMIN_NOTIFICATION_LIST || ""}
            onChange={e => setDraft(d => ({ ...d, ADMIN_NOTIFICATION_LIST: e.target.value }))}
            placeholder={PLACEHOLDERS.ADMIN_NOTIFICATION_LIST}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
          <p className="text-[11px] text-gray-400">Comma-separated email addresses for admin submission notifications.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || isLoading}
            className="flex items-center gap-2 bg-[#0D1B2A] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#1a2e45] disabled:opacity-40 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> {saveMut.isPending ? "Saving…" : "Save Settings"}
          </button>
          <button
            onClick={sendTestEmail}
            disabled={sendingTest}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {sendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send Test Admin Email
          </button>
        </div>
      </CardContent>
    </Card>
  );
}