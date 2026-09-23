import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { FlaskConical, Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

export default function EmailTestHarnessCard() {
  const { toast } = useToast();
  const [recipient, setRecipient] = useState("buck@theonehundredcollection.com");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [showReport, setShowReport] = useState(true);

  const run = async () => {
    if (!recipient.trim()) {
      toast({ title: "Enter a recipient email first", variant: "destructive" });
      return;
    }
    setRunning(true);
    setReport(null);
    try {
      const res = await base44.functions.invoke("sendAllTestEmails", {
        recipient_email: recipient.trim(),
        subjectPrefix: "[TEST] ",
      });
      const data = res?.data;
      if (data?.ok || data?.sent) {
        setReport(data);
        const total = (data.sent?.length || 0) + (data.failed?.length || 0) + (data.skipped?.length || 0);
        toast({
          title: "Email QA complete",
          description: `${data.sent?.length || 0} sent, ${data.skipped?.length || 0} skipped, ${data.failed?.length || 0} failed out of ${total}`,
        });
      } else {
        toast({ title: "Email QA failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Email QA failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const sentCount = report?.sent?.length || 0;
  const failedCount = report?.failed?.length || 0;
  const skippedCount = report?.skipped?.length || 0;

  const statusBadge = (status) => {
    const colors = {
      sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
      failed: "bg-red-50 text-red-700 border-red-200",
      skipped: "bg-amber-50 text-amber-700 border-amber-200",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors[status] || colors.skipped}`}>
        {status}
      </span>
    );
  };

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-amber-500" /> Email QA — Send All Variations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Sends 30+ emails to the recipient at once. Use a test address.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Test Recipient Email</label>
          <input
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="buck@theonehundredcollection.com"
            disabled={running}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-50"
          />
        </div>

        <button
          onClick={run}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 bg-[#0D1B2A] text-white text-sm px-4 py-3 rounded-lg hover:bg-[#1a2e45] disabled:opacity-50 transition-colors font-medium"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending 30+ emails, this takes about a minute...
            </>
          ) : (
            <FlaskConical className="w-4 h-4" />
          )}
          {running ? "" : "Send all email variations as test"}
        </button>

        {report && (
          <div className="space-y-3">
            {/* Summary bar */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {sentCount} sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {skippedCount} skipped
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {failedCount} failed
              </span>
              <button
                onClick={() => setShowReport((s) => !s)}
                className="ml-auto flex items-center gap-1 text-gray-500 hover:text-gray-700"
              >
                {showReport ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showReport ? "Hide" : "Show"} report
              </button>
            </div>

            {showReport && (
              <div className="border border-gray-100 rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left font-medium text-gray-500 px-3 py-2">Variation</th>
                      <th className="text-left font-medium text-gray-500 px-3 py-2">Subject</th>
                      <th className="text-left font-medium text-gray-500 px-3 py-2 whitespace-nowrap">Status</th>
                      <th className="text-left font-medium text-gray-500 px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sent?.map((r, i) => (
                      <tr key={`s-${i}`} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-700">{r.variation}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{r.subject}</td>
                        <td className="px-3 py-2">{statusBadge("sent")}</td>
                        <td className="px-3 py-2 text-gray-400">—</td>
                      </tr>
                    ))}
                    {report.skipped?.map((r, i) => (
                      <tr key={`k-${i}`} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-700">{r.variation}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{r.subject || "—"}</td>
                        <td className="px-3 py-2">{statusBadge("skipped")}</td>
                        <td className="px-3 py-2 text-amber-600">{r.reason || "—"}</td>
                      </tr>
                    ))}
                    {report.failed?.map((r, i) => (
                      <tr key={`f-${i}`} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-700">{r.variation}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{r.subject || "—"}</td>
                        <td className="px-3 py-2">{statusBadge("failed")}</td>
                        <td className="px-3 py-2 text-red-600">{r.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}