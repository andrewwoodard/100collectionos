import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "../shared/EmptyState";
import { AlertCircle, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";

export default function OpenInvoicesSection({ invoices, loading, billingEmail }) {
  const queryClient = useQueryClient();
  const [pendingVoid, setPendingVoid] = useState(null);
  const [voidingId, setVoidingId] = useState(null);

  const openInvoices = (invoices || []).filter(inv => inv.status === "open");
  const totalDue = openInvoices.reduce((sum, inv) => sum + (inv.amount_due ?? inv.total ?? 0), 0);

  const handleVoidInvoice = async () => {
    if (!pendingVoid) return;
    setVoidingId(pendingVoid.id);
    try {
      const res = await base44.functions.invoke("voidStripeInvoice", { invoice_id: pendingVoid.id });
      if (res.data?.error) {
        toast({ title: "Could not remove invoice", description: res.data.error, variant: "destructive" });
      } else {
        toast({ title: "Invoice voided", description: `${pendingVoid.number || pendingVoid.id} has been removed from Stripe.` });
        await queryClient.invalidateQueries({ queryKey: ["stripe-invoices", billingEmail] });
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Unexpected error";
      toast({ title: "Could not remove invoice", description: msg, variant: "destructive" });
    } finally {
      setVoidingId(null);
      setPendingVoid(null);
    }
  };

  if (!billingEmail) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No Stripe billing email"
        description="Add a Stripe billing email to this partner to see their open invoices."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading open invoices...
      </div>
    );
  }

  if (openInvoices.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No open invoices"
        description="This partner has no outstanding Stripe invoices."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <span className="font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> Open Invoices
          </span>
          <span className="text-gray-600">
            Count: <strong className="text-gray-900">{openInvoices.length}</strong>
          </span>
          <span className="text-gray-600">
            Total due: <strong className="text-red-700">${(totalDue / 100).toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="text-xs">Invoice #</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Amount Due</TableHead>
              <TableHead className="text-xs">Total</TableHead>
              <TableHead className="text-xs">Created</TableHead>
              <TableHead className="text-xs">Due</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openInvoices.map(inv => (
              <TableRow key={inv.id}>
                <TableCell className="text-xs font-mono text-gray-500">
                  {inv.number || inv.id?.slice(-8)}
                </TableCell>
                <TableCell className="text-sm">
                  {inv.description || inv.lines?.[0]?.description || "—"}
                </TableCell>
                <TableCell className="text-sm font-semibold text-red-700">
                  ${((inv.amount_due ?? inv.total ?? 0) / 100).toFixed(2)}
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  ${((inv.total ?? inv.amount_paid ?? 0) / 100).toFixed(2)}
                </TableCell>
                <TableCell className="text-xs text-gray-400">
                  {inv.created ? format(new Date(inv.created * 1000), "MMM d, yyyy") : "—"}
                </TableCell>
                <TableCell className="text-xs text-gray-400">
                  {inv.due_date ? format(new Date(inv.due_date * 1000), "MMM d, yyyy") : "—"}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                    {inv.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {inv.hosted_invoice_url && (
                      <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" title="View invoice">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                      </a>
                    )}
                    <button
                      onClick={() => setPendingVoid(inv)}
                      disabled={voidingId === inv.id}
                      title="Void invoice"
                      className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                    >
                      {voidingId === inv.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Void confirm dialog */}
      <Dialog open={!!pendingVoid} onOpenChange={(o) => !o && setPendingVoid(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this Stripe invoice?</DialogTitle>
            <DialogDescription>
              This will permanently void invoice{" "}
              <span className="font-mono font-medium">{pendingVoid?.number || pendingVoid?.id}</span> in Stripe.
              Only open invoices can be removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingVoid(null)} disabled={!!voidingId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleVoidInvoice} disabled={!!voidingId}>
              {voidingId ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Remove invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}