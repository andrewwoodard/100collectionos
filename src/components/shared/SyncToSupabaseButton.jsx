import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Database, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SyncToSupabaseButton({ onSyncComplete }) {
  const [status, setStatus] = useState("idle"); // idle | syncing | success | error
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setStatus("syncing");
    setResult(null);
    let skip = 0;
    let totalSynced = 0;
    let hasMore = true;
    try {
      // Loop through batches until the backend reports has_more = false.
      // Each call syncs a small batch so no single request times out.
      while (hasMore) {
        const res = await base44.functions.invoke("syncPropertyToSupabase", {
          action: "backfill_properties",
          skip,
          batch_size: 25,
        });
        const data = res.data || {};
        totalSynced += data.synced || 0;
        hasMore = !!data.has_more;
        skip += data.synced || 25;
        setResult({ total: totalSynced, syncing: true });
      }
      setResult({ total: totalSynced });
      setStatus("success");
      if (onSyncComplete) onSyncComplete();
      setTimeout(() => setStatus("idle"), 5000);
    } catch (err) {
      setResult({ error: err.message });
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={status === "syncing"}
        className="flex items-center gap-2 border-[#0F172A] text-[#0F172A] hover:bg-[#0F172A]/10"
      >
        <Database className={`w-4 h-4 ${status === "syncing" ? "animate-spin" : ""}`} />
        {status === "syncing" ? "Syncing to Supabase..." : "Sync to Supabase"}
      </Button>

      {status === "success" && result && (
        <span className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          {result.total != null ? `Synced ${result.total} properties` : "Sync complete"}
        </span>
      )}

      {status === "error" && result && (
        <span className="flex items-center gap-1.5 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          {result.error || "Sync failed"}
        </span>
      )}
    </div>
  );
}