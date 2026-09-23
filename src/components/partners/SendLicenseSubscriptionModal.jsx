import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function SendLicenseSubscriptionModal({ open, onClose, partner, stripeData, onSuccess }) {
  const licensePrice = Number(partner?.license_unit_price) > 0 ? Number(partner.license_unit_price) : 1200;
  const [licenseCount, setLicenseCount] = useState(1);
  const [interval, setInterval] = useState("year");
  const [sending, setSending] = useState(false);

  const count = Math.max(1, Math.min(100, Number(licenseCount) || 1));
  const canMonthly = count >= 5;
  const totalAnnual = licensePrice * count;
  const totalMonthly = totalAnnual / 12;

  const handleSend = async () => {
    setSending(true);
    try {
      await base44.functions.invoke("createSubscriptionInvoice", {
        customer_id: stripeData?.customer_id,
        license_unit_price: licensePrice,
        property_count: count,
        billing_interval: interval,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      alert(e?.message || "Failed to send invoice");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send License Subscription</DialogTitle>
          <DialogDescription>Send a Stripe subscription invoice for 1–100 licenses to {partner?.stripe_billing_email || "the partner"}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Number of Licenses</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={licenseCount}
                onChange={(e) => setLicenseCount(e.target.value)}
                className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex gap-1">
                {[1, 5, 10, 25, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLicenseCount(n)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${count === n ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">License price</span><span className="font-medium">{fmt(licensePrice)}/license/yr</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Licenses</span><span className="font-medium">{count}</span></div>
            <div className="border-t border-gray-200 pt-1.5 flex justify-between"><span className="text-gray-700 font-semibold">Annual total</span><span className="font-bold text-gray-900">{fmt(totalAnnual)}</span></div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Payment Frequency</p>
            <div className="space-y-2">
              <label className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${interval === "year" ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="flex items-center gap-2">
                  <input type="radio" checked={interval === "year"} onChange={() => setInterval("year")} className="accent-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Annual (Bulk Sum)</p>
                    <p className="text-xs text-gray-500">{fmt(totalAnnual)} per year</p>
                  </div>
                </div>
              </label>
              <label className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${!canMonthly ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed" : interval === "month" ? "border-blue-400 bg-blue-50 cursor-pointer" : "border-gray-200 hover:border-gray-300 cursor-pointer"}`}>
                <div className="flex items-center gap-2">
                  <input type="radio" checked={interval === "month"} disabled={!canMonthly} onChange={() => canMonthly && setInterval("month")} className="accent-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Monthly</p>
                    <p className="text-xs text-gray-500">{fmt(totalMonthly)}/mo for 12 months</p>
                  </div>
                </div>
                {!canMonthly && <span className="text-[10px] text-gray-400 italic">Requires 5+ licenses</span>}
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || count < 1} className="gap-1.5">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}