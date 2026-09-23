import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function SendSubscriptionInvoiceModal({ open, onClose, partner, properties, stripeData, onSuccess }) {
  const licensePrice = Number(partner?.license_unit_price) > 0 ? Number(partner.license_unit_price) : 1200;
  const activeProperties = (properties || []).filter(p => p?.status === "active");
  const propertyCount = activeProperties.length;
  const canMonthly = propertyCount >= 5;

  const [interval, setInterval] = useState("year");
  const [sending, setSending] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [sendDate, setSendDate] = useState("");
  const todayStr = new Date().toISOString().slice(0, 10);
  const dateValid = schedule ? (!!sendDate && sendDate >= todayStr) : true;

  const totalAnnual = licensePrice * propertyCount;
  const totalMonthly = totalAnnual / 12;

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await base44.functions.invoke("createSubscriptionInvoice", {
        customer_id: stripeData?.customer_id,
        license_unit_price: licensePrice,
        property_count: propertyCount,
        billing_interval: interval,
        send_date: schedule ? sendDate : null,
      });
      onSuccess?.(res?.scheduled ? { scheduled: true, scheduled_for: res?.scheduled_for } : null);
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
          <DialogTitle>Send Subscription Invoice</DialogTitle>
          <DialogDescription>Create a Stripe subscription and email the first invoice to {partner?.stripe_billing_email || "the partner"}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">License price</span><span className="font-medium">{fmt(licensePrice)}/property/yr</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Properties</span><span className="font-medium">{propertyCount}</span></div>
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
                {!canMonthly && <span className="text-[10px] text-gray-400 italic">Requires 5+ properties</span>}
              </label>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">When to send</p>
          <div className="space-y-2">
            <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${!schedule ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
              <input type="radio" checked={!schedule} onChange={() => setSchedule(false)} className="accent-blue-600" />
              <span className="text-sm font-medium text-gray-900">Now</span>
            </label>
            <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${schedule ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
              <input type="radio" checked={schedule} onChange={() => setSchedule(true)} className="accent-blue-600" />
              <span className="text-sm font-medium text-gray-900">Schedule for a future date</span>
            </label>
            {schedule && (
              <input
                type="date"
                value={sendDate}
                min={todayStr}
                onChange={(e) => setSendDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-400"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || propertyCount < 1 || !dateValid} className="gap-1.5">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {schedule ? "Schedule Invoice" : "Send Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}