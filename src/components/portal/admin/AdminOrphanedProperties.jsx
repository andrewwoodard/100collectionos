import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { sb } from "@/lib/supabase";
import { AlertTriangle, RefreshCw, Send, CheckCircle, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const normName = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Orphaned Properties + Orphaned Partners Report
 * Lists active Base44 Properties/Partners that have no Supabase link.
 * Admins review case-by-case and sync individually — no batch auto-sync, to avoid
 * accidentally publishing historical/offline inventory to theonehundredcollection.com.
 */
export default function AdminOrphanedProperties({ embedded }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [syncingId, setSyncingId] = useState(null);
  const [sending, setSending] = useState(false);
  const [syncingPartnerId, setSyncingPartnerId] = useState(null);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["orphaned-properties"],
    queryFn: () => base44.entities.Property.list("-created_date", 1000),
  });

  // All Base44 Partners — used to detect those with no matching Supabase row.
  const { data: allPartners = [] } = useQuery({
    queryKey: ["orphaned-partners-base44"],
    queryFn: () => base44.entities.Partner.list("-created_date", 1000),
  });

  // Supabase partners (resolved via supabaseData list).
  const { data: supabasePartners = [] } = useQuery({
    queryKey: ["orphaned-partners-supabase"],
    queryFn: async () => {
      const r = await sb.list("partners");
      return r?.items || [];
    },
  });

  const orphans = properties.filter(p =>
    p.status === "active" &&
    (!p.supabase_property_id || p.supabase_property_id === "null" || p.supabase_property_id === "undefined")
  );

  const byPartner = orphans.reduce((acc, p) => {
    const key = p.partner_name || "— Unknown —";
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});
  const partnerKeys = Object.keys(byPartner).sort();

  // Orphaned Partners: Base44 Partners not found in Supabase by base44_partner_id, email, or name.
  const supaByB44Id = new Set();
  const supaEmails = new Set();
  const supaNames = new Set();
  for (const sp of supabasePartners) {
    if (sp.base44_partner_id) supaByB44Id.add(sp.base44_partner_id);
    if (sp.primary_contact_email) supaEmails.add(sp.primary_contact_email.toLowerCase());
    if (sp.partner_name) supaNames.add(normName(sp.partner_name));
  }
  const orphanPartners = allPartners.filter(p =>
    !supaByB44Id.has(p.id) &&
    !(p.primary_contact_email && supaEmails.has(p.primary_contact_email.toLowerCase())) &&
    !(p.partner_name && supaNames.has(normName(p.partner_name)))
  );

  const syncOne = async (p) => {
    setSyncingId(p.id);
    try {
      const res = await base44.functions.invoke("syncPropertyToSupabase", { action: "sync_property", id: p.id });
      toast({ title: "Synced", description: `"${p.property_name}" published to Supabase (${res?.action || "ok"}).` });
      qc.invalidateQueries(["orphaned-properties"]);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync failed", description: e?.message || "Try again." });
    } finally {
      setSyncingId(null);
    }
  };

  const syncPartner = async (p) => {
    setSyncingPartnerId(p.id);
    try {
      const res = await base44.functions.invoke("syncPartnerToSupabase", {
        partnerId: p.id,
        partnerEmail: p.primary_contact_email,
      });
      toast({ title: "Synced", description: `"${p.partner_name}" published to Supabase (${res?.action || "ok"}).` });
      qc.invalidateQueries(["orphaned-partners-supabase"]);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync failed", description: e?.message || "Try again." });
    } finally {
      setSyncingPartnerId(null);
    }
  };

  const sendReport = async () => {
    setSending(true);
    try {
      const lines = [
        `Orphaned Report — ${new Date().toISOString()}`,
        `Total orphaned properties: ${orphans.length}`,
        `Total orphaned partners: ${orphanPartners.length}`,
        "",
        "Properties by partner:",
      ];
      for (const k of partnerKeys) {
        lines.push(`- ${k}: ${byPartner[k].length}`);
      }
      lines.push("", "Properties:");
      for (const p of orphans) {
        lines.push(`- ${p.property_name} | ${p.partner_name || "—"} | created ${p.created_date || "—"} | id ${p.id}`);
      }
      lines.push("", "Partners:");
      for (const p of orphanPartners) {
        lines.push(`- ${p.partner_name} | ${p.primary_contact_email || "—"} | created ${p.created_date || "—"} | id ${p.id}`);
      }
      await base44.integrations.Core.SendEmail({
        to: "buck@theonehundredcollection.com",
        subject: `Orphaned Report: ${orphans.length} properties, ${orphanPartners.length} partners pending Supabase sync`,
        body: lines.join("\n"),
      });
      toast({ title: "Report sent", description: `Sent to buck@theonehundredcollection.com (${orphans.length} properties, ${orphanPartners.length} partners).` });
    } catch (e) {
      toast({ variant: "destructive", title: "Send failed", description: e?.message || "Try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-light text-[#0D1B2A]">Orphaned Properties</h2>
          <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            {orphans.length} pending
          </span>
        </div>
        <button
          onClick={sendReport}
          disabled={sending || orphans.length === 0}
          className="flex items-center gap-2 text-sm border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50 disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Send report to Buck"}
        </button>
      </div>

      <p className="text-xs text-slate-500 -mt-2 leading-relaxed">
        Active Base44 Properties not yet synced to Supabase. These do not appear in the /Properties list or on
        theonehundredcollection.com. Review case-by-case and sync individually. New approvals auto-sync going forward.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-4 border-slate-100 border-t-[#C9A96E] rounded-full animate-spin" />
        </div>
      ) : orphans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <CheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
          <p className="text-sm">No orphaned properties. Everything is synced.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {partnerKeys.map(partner => (
            <div key={partner} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#0D1B2A]">{partner}</span>
                <span className="text-xs text-slate-400">
                  {byPartner[partner].length} orphan{byPartner[partner].length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {byPartner[partner].map(p => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0D1B2A] truncate">{p.property_name}</p>
                      <p className="text-xs text-slate-400">
                        created {p.created_date ? new Date(p.created_date).toLocaleDateString() : "—"} · id {p.id}
                      </p>
                    </div>
                    <button
                      onClick={() => syncOne(p)}
                      disabled={syncingId === p.id}
                      className="flex items-center gap-1.5 text-xs bg-[#0D1B2A] text-white px-3 py-1.5 rounded-lg disabled:opacity-40 whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncingId === p.id ? "animate-spin" : ""}`} />
                      Sync
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Orphaned Partners section */}
      <div className="mt-8 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-light text-[#0D1B2A]">Orphaned Partners</h2>
          <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            {orphanPartners.length} pending
          </span>
        </div>
        <p className="text-xs text-slate-500 -mt-2 leading-relaxed">
          Base44 Partner records not yet synced to Supabase. PartnerDetail reads Supabase-first, so these render
          empty until synced. Review case-by-case and sync individually. New approvals auto-sync going forward.
        </p>
        {orphanPartners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <CheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
            <p className="text-sm">No orphaned partners. Everything is synced.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-50">
              {orphanPartners.map(p => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0D1B2A] truncate">{p.partner_name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {p.primary_contact_email || "—"} · created {p.created_date ? new Date(p.created_date).toLocaleDateString() : "—"} · id {p.id}
                    </p>
                  </div>
                  <button
                    onClick={() => syncPartner(p)}
                    disabled={syncingPartnerId === p.id}
                    className="flex items-center gap-1.5 text-xs bg-[#0D1B2A] text-white px-3 py-1.5 rounded-lg disabled:opacity-40 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingPartnerId === p.id ? "animate-spin" : ""}`} />
                    Sync
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}