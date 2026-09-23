import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const fmt = (n) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(n) || 0);

export default function EditNextInvoiceQtyModal({ slot, onClose, onSuccess }) {
  const [qty, setQty] = useState(slot?.currentQty ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setQty(slot?.currentQty ?? 1);
    setError("");
  }, [slot]);

  if (!slot) return null;

  const unitPrice = slot.unitPrice || 0;
  const newTotal = unitPrice * Number(qty);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("updateSubscriptionQuantity", {
        subscription_id: slot.subscriptionId,
        new_quantity: Number(qty),
      });
      if (res?.data?.error) throw new Error(res.data.error);
      onSuccess?.(res?.data);
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.data?.error || e?.message || "Failed to update quantity";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit next invoice quantity</DialogTitle>
          <DialogDescription>
            Update the quantity billed on this partner's next renewal invoice. No proration is charged now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Current quantity</span>
              <span className="font-medium">{slot.currentQty}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">New quantity</span>
              <input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
            <div className="border-t border-gray-200 pt-1.5 flex justify-between">
              <span className="text-gray-700 font-semibold">Next invoice total</span>
              <span className="font-bold">{fmt(newTotal)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Unit price {fmt(unitPrice)} × {qty}. The change applies on the next invoice; the current period is unaffected.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !qty || Number(qty) < 1}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Update quantity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}