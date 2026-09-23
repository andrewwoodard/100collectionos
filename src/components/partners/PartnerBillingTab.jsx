import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import EditNextInvoiceQtyModal from "./EditNextInvoiceQtyModal";

const fmt = (n) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(n) || 0);
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "../shared/StatusBadge";
import EmptyState from "../shared/EmptyState";
import { CreditCard, ExternalLink, Loader2, Trash2, Pencil, Calendar, Pause, Play } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import OpenInvoicesSection from "./OpenInvoicesSection";
import PaidByMonthSection from "./PaidByMonthSection";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function PartnerBillingTab({ billing = [], stripeBillingEmail, stripeData, isHomeowner }) {
  const [activeTab, setActiveTab] = useState("stripe");
  const [voidingId, setVoidingId] = useState(null);
  const [pendingVoid, setPendingVoid] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [pauseTarget, setPauseTarget] = useState(null);
  const [pausing, setPausing] = useState(false);
  const queryClient = useQueryClient();

  // Group Stripe credit slots by subscription so admins can adjust the
  // property count billed on the next renewal invoice.
  const subscriptions = useMemo(() => {
    const bySub = {};
    for (const s of (stripeData?.credit_slots || [])) {
      if (!s.subscription_id) continue;
      if (!bySub[s.subscription_id]) {
        bySub[s.subscription_id] = {
          subscriptionId: s.subscription_id,
          currentQty: 0,
          unitPrice: s.unit_price || 0,
          status: s.status,
          description: s.line_description,
          billingCycle: stripeData?.billing_cycle,
          nextInvoiceDate: s.period_end || 0,
          paused: false,
          resumes_at: null,
        };
      }
      bySub[s.subscription_id].currentQty += 1;
      if (s.paused) bySub[s.subscription_id].paused = true;
      if (s.resumes_at) bySub[s.subscription_id].resumes_at = s.resumes_at;
      if (s.period_end && s.period_end > (bySub[s.subscription_id].nextInvoiceDate || 0)) {
        bySub[s.subscription_id].nextInvoiceDate = s.period_end;
      }
      }
      return Object.values(bySub);
  }, [stripeData]);

  // Fetch full Stripe invoice list
  const { data: stripeInvoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ["stripe-invoices", stripeBillingEmail],
    queryFn: async () => {
      if (!stripeBillingEmail) return [];
      const res = await base44.functions.invoke("stripeInvoices", { email: stripeBillingEmail });
      return res.data?.invoices || [];
    },
    enabled: !!stripeBillingEmail,
  });

  const handleVoidInvoice = async () => {
    if (!pendingVoid) return;
    setVoidingId(pendingVoid.id);
    try {
      const res = await base44.functions.invoke("voidStripeInvoice", { invoice_id: pendingVoid.id });
      if (res.data?.error) {
        toast({ title: "Could not remove invoice", description: res.data.error, variant: "destructive" });
      } else {
        toast({ title: "Invoice voided", description: `${pendingVoid.number || pendingVoid.id} has been removed from Stripe.` });
        await queryClient.invalidateQueries({ queryKey: ["stripe-invoices", stripeBillingEmail] });
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Unexpected error";
      toast({ title: "Could not remove invoice", description: msg, variant: "destructive" });
    } finally {
      setVoidingId(null);
      setPendingVoid(null);
    }
  };

  const handleTogglePause = async () => {
    if (!pauseTarget) return;
    setPausing(true);
    try {
      const action = pauseTarget.paused ? "resume" : "pause";
      const res = await base44.functions.invoke("manageSubscriptionPause", {
        subscription_id: pauseTarget.subscriptionId,
        action,
      });
      if (res.data?.error) {
        toast({ title: "Could not update billing", description: res.data.error, variant: "destructive" });
      } else {
        toast({
          title: action === "pause" ? "Billing paused" : "Billing restarted",
          description: action === "pause"
            ? "Renewal invoices are paused for this subscription."
            : "Renewal billing has been restarted.",
        });
        await queryClient.invalidateQueries({ queryKey: ["stripe-partner", stripeBillingEmail] });
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Unexpected error";
      toast({ title: "Could not update billing", description: msg, variant: "destructive" });
    } finally {
      setPausing(false);
      setPauseTarget(null);
    }
  };

  const openCount = (stripeInvoices || []).filter(inv => inv.status === "open").length;

  const tabs = [
    { id: "stripe", label: "Stripe Invoices" },
    { id: "open", label: `Open Invoices (${openCount})` },
    { id: "paid", label: "Paid by Month" },
    { id: "internal", label: `Internal Records (${billing.length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Stripe summary bar */}
      {stripeData && (
        <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-semibold text-green-700 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" /> Stripe Active
            </span>
            <span className="text-gray-600">
              <strong className="text-blue-700">{stripeData.property_credits ?? 0}</strong> property credits
            </span>
            {stripeData.last_invoice_amount != null && (
              <span className="text-gray-600">
                Last invoice: <strong>${stripeData.last_invoice_amount.toFixed(2)}</strong>
              </span>
            )}
            {stripeData.last_invoice_date && (
              <span className="text-gray-500 text-xs">
                {format(new Date(stripeData.last_invoice_date * 1000), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {stripeData.customer_id && (
            <a
              href={`https://dashboard.stripe.com/customers/${stripeData.customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline flex items-center gap-1"
            >
              View Customer <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Next invoice quantity — adjust the count billed on the next renewal */}
      {stripeData && subscriptions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Next invoice quantity</h3>
            <p className="text-xs text-gray-500">
              Adjust the {isHomeowner ? "home" : "property"} count billed on the next renewal invoice. No proration is charged now.
            </p>
          </div>
          <div className="space-y-2">
            {subscriptions.map(s => (
              <div key={s.subscriptionId} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {s.currentQty} {isHomeowner ? "homes" : "properties"}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {s.billingCycle ? `${s.billingCycle} · ` : ""}{s.description || "Property License"} · {fmt(s.unitPrice)}/unit
                  </div>
                  {s.paused ? (
                    <div className="text-xs text-amber-600 mt-1 flex items-center gap-1.5">
                      <Pause className="w-3 h-3" /> Renewal billing is paused — no invoice will be created
                    </div>
                  ) : s.nextInvoiceDate ? (
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      Next invoice goes out <strong className="text-gray-700">{format(new Date(s.nextInvoiceDate * 1000), "MMM d, yyyy")}</strong>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.paused && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1">
                      Paused
                    </span>
                  )}
                  <button
                    onClick={() => setEditTarget(s)}
                    className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 flex items-center gap-1.5"
                  >
                    <Pencil className="w-3 h-3" /> Edit next qty
                  </button>
                  {s.subscriptionId?.startsWith("sub_sched_") ? (
                    <span className="text-xs text-gray-400" title="Pausing is not supported for subscription schedules">
                      Pause n/a
                    </span>
                  ) : s.paused ? (
                    <button
                      onClick={() => setPauseTarget(s)}
                      className="text-xs font-medium text-green-600 border border-green-200 rounded-lg px-2.5 py-1.5 hover:bg-green-50 flex items-center gap-1.5"
                    >
                      <Play className="w-3 h-3" /> Restart
                    </button>
                  ) : (
                    <button
                      onClick={() => setPauseTarget(s)}
                      className="text-xs font-medium text-amber-600 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-50 flex items-center gap-1.5"
                    >
                      <Pause className="w-3 h-3" /> Pause
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-100">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stripe Invoices */}
      {activeTab === "stripe" && (
        <>
          {!stripeBillingEmail ? (
            <EmptyState icon={CreditCard} title="No Stripe billing email" description="Add a Stripe billing email to this partner to see their invoices." />
          ) : loadingInvoices ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading Stripe invoices...
            </div>
          ) : !stripeInvoices || stripeInvoices.length === 0 ? (
            <EmptyState icon={CreditCard} title="No Stripe invoices found" description="No invoices found for this billing email in Stripe." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="text-xs">Invoice #</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Qty</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stripeInvoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs font-mono text-gray-500">{inv.number || inv.id?.slice(-8)}</TableCell>
                      <TableCell className="text-sm">{inv.description || inv.lines?.[0]?.description || "—"}</TableCell>
                      <TableCell className="text-sm font-semibold text-blue-700">{inv.quantity ?? "—"}</TableCell>
                      <TableCell className="text-sm font-semibold">${((inv.total ?? inv.amount_paid) / 100).toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "paid" ? "bg-green-100 text-green-700" :
                          inv.status === "open" ? "bg-yellow-100 text-yellow-700" :
                          inv.status === "void" ? "bg-gray-100 text-gray-500" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {inv.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-400">
                        {inv.created ? format(new Date(inv.created * 1000), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {inv.hosted_invoice_url && (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                            </a>
                          )}
                          {inv.status === "open" && (
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
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Open Invoices */}
      {activeTab === "open" && (
        <OpenInvoicesSection
          invoices={stripeInvoices}
          loading={loadingInvoices}
          billingEmail={stripeBillingEmail}
        />
      )}

      {/* Paid by Month */}
      {activeTab === "paid" && (
        <PaidByMonthSection
          invoices={stripeInvoices}
          loading={loadingInvoices}
          billingEmail={stripeBillingEmail}
        />
      )}

      {/* Pause / restart confirm dialog */}
      <Dialog open={!!pauseTarget} onOpenChange={(o) => !o && !pausing && setPauseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pauseTarget?.paused ? "Restart renewal billing?" : "Pause renewal billing?"}</DialogTitle>
            <DialogDescription>
              {pauseTarget?.paused ? (
                <>This will clear the pause on <span className="font-mono font-medium">{pauseTarget?.subscriptionId}</span> so renewal invoices resume on the normal cycle.</>
              ) : (
                <>This will pause <span className="font-mono font-medium">{pauseTarget?.subscriptionId}</span>. No renewal invoices will be created while paused. You can restart it any time.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseTarget(null)} disabled={pausing}>
              Cancel
            </Button>
            <Button
              variant={pauseTarget?.paused ? "default" : "destructive"}
              onClick={handleTogglePause}
              disabled={pausing}
            >
              {pausing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {pauseTarget?.paused ? "Restart billing" : "Pause billing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Internal Records */}
      {activeTab === "internal" && (
        <>
          {billing.length === 0 ? (
            <EmptyState icon={CreditCard} title="No internal billing records" description="Internal billing records linked to this partner will appear here." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="text-xs">Invoice #</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm font-medium">{b.invoice_number || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-500">{b.billing_type?.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-sm font-semibold">${(b.amount || 0).toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={b.status} /></TableCell>
                      <TableCell className="text-xs text-gray-400">{b.due_date ? format(new Date(b.due_date), "MMM d") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {editTarget && (
        <EditNextInvoiceQtyModal
          slot={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            queryClient.invalidateQueries({ queryKey: ["stripe-partner", stripeBillingEmail] });
            queryClient.invalidateQueries({ queryKey: ["stripe-invoices", stripeBillingEmail] });
          }}
        />
      )}
    </div>
  );
}