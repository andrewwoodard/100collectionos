import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SyncButton({ onSyncComplete }) {
  const [status, setStatus] = useState("idle"); // idle | syncing | success | error
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setStatus("syncing");
    setResult(null);
    try {
      const res = await base44.functions.invoke("syncInventory", {});
      setResult(res.data);
      setStatus("success");
      if (onSyncComplete) onSyncComplete();
      // Reset to idle after 5 seconds
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
        className="flex items-center gap-2 border-[#C9A96E] text-[#C9A96E] hover:bg-[#C9A96E]/10"
      >
        <RefreshCw className={`w-4 h-4 ${status === "syncing" ? "animate-spin" : ""}`} />
        {status === "syncing" ? "Syncing..." : "Sync from Site"}
      </Button>

      {status === "success" && result && (
        <span className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          {result.message || `+${result.newPartners} partners, +${result.newProperties} properties`}
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