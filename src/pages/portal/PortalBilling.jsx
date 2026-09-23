import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import PortalLayout from "../../components/portal/PortalLayout";
import LicenseTransferModal from "../../components/portal/LicenseTransferModal";
import { CreditCard, CheckCircle, Clock, AlertCircle, ArrowLeftRight, ArrowLeft, TriangleAlert, Tag, ExternalLink, Loader2 } from "lucide-react";
import StatusPill from "@/components/shared/StatusPill";
import { Link } from "react-router-dom";
import AssignLicenseModal from "../../components/portal/AssignLicenseModal";



function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function PortalBilling() {
  const { user } = useCurrentUser();
  const [transferLicense, setTransferLicense] = React.useState(null);
  const [assignLicense, setAssignLicense] = React.useState(null);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [licenseQty, setLicenseQty] = React.useState(1);
  const qc = useQueryClient();

  const handlePayNow = async (overdueLicenses) => {
    setCheckoutLoading(true);
    const res = await base44.functions.invoke("createStripeCheckout", {
      quantity: overdueLicenses.length || 1,
      billing_interval: "year",
      success_url: window.location.href + "?payment=success",
      cancel_url: window.location.href,
    });
    setCheckoutLoading(false);
    if (res.data?.url) window.location.href = res.data.url;
  };

  const { data: billingData = {}, isLoading } = useQuery({
    queryKey: ["my-licenses", user?.id],
    queryFn: async () => {
      if (!user?.id) return {};
      const partners = await base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } });
      if (partners.length === 0) return { licenses: [], partner: null };
      const partner = partners[0];
      const partnerNames = partners.map(p => p.partner_name);
      const allLicenses = await base44.entities.LicenseRecord.list();
      const licenses = allLicenses.filter(l => partnerNames.includes(l.partner_name));
      return { licenses, partner };
    },
    enabled: !!user?.id,
  });
  const licenses = billingData.licenses || [];
  const partner = billingData.partner || null;

  const { data: promoInfo } = useQuery({
    queryKey: ["promo-display", partner?.stripe_promotion_code],
    queryFn: () => base44.functions.invoke("getPromoCodeDisplay", { promo_id: partner.stripe_promotion_code }),
    enabled: !!partner?.stripe_promotion_code,
  });
  const promoCode = promoInfo?.data?.code || null;
  const discountPct = partner?.discount_percent || 0;
  const baseUnitPrice = licenseQty === 1 ? (Number(partner?.license_unit_price) > 0 ? Number(partner.license_unit_price) : 1200) : 498;
  const discountedUnitPrice = +(baseUnitPrice * (1 - discountPct / 100)).toFixed(2);

  const isAdmin = user?.role === "admin";

  const activeLicenses = licenses.filter(l => l.license_status === "active");
  const activeCount = activeLicenses.length;
  const annualSpend = activeLicenses.reduce((s, l) => s + (l.annual_fee || 0), 0);

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcomingRenewals = licenses.filter(l => l.license_end_date && new Date(l.license_end_date) <= in30 && l.license_status === "active");
  const overdueCount = licenses.filter(l => l.payment_status === "overdue").length;
  const overdueTotal = licenses.filter(l => l.payment_status === "overdue").reduce((s, l) => s + (l.annual_fee || 0), 0);

  const nextRenewal = licenses
    .filter(l => l.license_end_date && l.license_status === "active")
    .map(l => new Date(l.license_end_date))
    .sort((a, b) => a - b)[0];

  return (
    <PortalLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Partner Portal</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Billing & Licensing</h1>
        </div>
        {isAdmin && (
          <Link to="/admin/billing" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Admin
          </Link>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Active Licenses", value: activeCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Annual Spend", value: `$${annualSpend.toLocaleString()}`, icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Upcoming Renewals", value: upcomingRenewals.length, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Overdue", value: overdueCount, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className="text-xl font-light text-[#0D1B2A]">{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Callout banners */}
      {overdueCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <TriangleAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">
              <strong>{overdueCount} overdue payment{overdueCount > 1 ? "s" : ""}</strong> — total ${overdueTotal.toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => handlePayNow(licenses.filter(l => l.payment_status === "overdue"))}
            disabled={checkoutLoading}
            className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {checkoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Pay Now
          </button>
        </div>
      )}
      {upcomingRenewals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-4">
          <p className="text-sm text-amber-800">
            <strong>{upcomingRenewals.length} license{upcomingRenewals.length > 1 ? "s" : ""}</strong> expiring in the next 30 days
          </p>
        </div>
      )}
      {overdueCount === 0 && upcomingRenewals.length === 0 && activeCount > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 mb-4">
          <p className="text-sm text-emerald-700">
            All paid up.{nextRenewal ? ` Next renewal: ${fmtDate(nextRenewal)}.` : ""}
          </p>
        </div>
      )}

      {/* Purchase licenses */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <h2 className="font-medium text-[#0D1B2A] text-sm mb-1">Purchase a License</h2>
        <p className="text-xs text-slate-400 mb-4">
          Each license covers one property. Single license: ${Number(baseUnitPrice).toLocaleString()}/yr. Monthly billing ($41.50/mo) is available when purchasing 10 or more licenses.
        </p>

        {/* Quantity picker */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-slate-600 font-medium">Licenses:</span>
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setLicenseQty(q => Math.max(1, q - 1))}
              className="px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors text-lg leading-none font-light"
            >−</button>
            <input
              type="number"
              min={1}
              value={licenseQty}
              onChange={e => setLicenseQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-14 text-center text-sm font-medium text-[#0D1B2A] border-x border-slate-200 py-2 focus:outline-none"
            />
            <button
              onClick={() => setLicenseQty(q => q + 1)}
              className="px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors text-lg leading-none font-light"
            >+</button>
          </div>
          <span className="text-xs text-slate-400">
            Total:{" "}
            {discountPct > 0 ? (
              <>
                <span className="font-medium text-slate-600">${(licenseQty * discountedUnitPrice).toFixed(2)}/yr</span>
                <span className="ml-1.5 line-through text-slate-300">${(licenseQty * baseUnitPrice).toLocaleString()}</span>
              </>
            ) : (
              <span className="font-medium text-slate-600">${(licenseQty * baseUnitPrice).toLocaleString()}/yr</span>
            )}
            {licenseQty >= 10 && <span className="ml-2">or <span className="font-medium">${(licenseQty * 41.50).toFixed(2)}/mo</span></span>}
          </span>
        </div>

        {/* Discount chip */}
        {partner?.stripe_promotion_code && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
            <span className="text-lg">🎯</span>
            <div>
              <p className="text-sm font-medium text-amber-900">
                Partner discount: {discountPct}% off{promoCode ? ` (${promoCode})` : ""}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your price: ${discountedUnitPrice.toFixed(2)}/yr per license
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={async () => {
              setCheckoutLoading(true);
              const res = await base44.functions.invoke("createStripeCheckout", {
                quantity: licenseQty,
                billing_interval: "year",
                success_url: window.location.href + "?payment=success",
                cancel_url: window.location.href,
              });
              setCheckoutLoading(false);
              if (res.data?.url) window.location.href = res.data.url;
            }}
            disabled={checkoutLoading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0D1B2A] text-white text-sm font-medium rounded-xl hover:bg-[#162535] transition-colors disabled:opacity-60"
          >
            {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Buy Annual — {discountPct > 0 ? `$${(licenseQty * discountedUnitPrice).toFixed(2)}/yr` : `$${(licenseQty * baseUnitPrice).toLocaleString()}/yr`}
          </button>
          {licenseQty >= 10 && (
            <button
              onClick={async () => {
                setCheckoutLoading(true);
                const res = await base44.functions.invoke("createStripeCheckout", {
                  quantity: licenseQty,
                  billing_interval: "month",
                  success_url: window.location.href + "?payment=success",
                  cancel_url: window.location.href,
                });
                setCheckoutLoading(false);
                if (res.data?.url) window.location.href = res.data.url;
              }}
              disabled={checkoutLoading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Buy Monthly — ${(licenseQty * 41.50).toFixed(2)}/mo
            </button>
          )}
        </div>
        {licenseQty < 10 && (
          <p className="mt-2 text-xs text-slate-400">Monthly billing unlocks at 10+ licenses.</p>
        )}
        {window.location.search.includes("payment=success") && (
          <div className="mt-4 flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Payment successful! Your new license will appear in the table below shortly.
          </div>
        )}
      </div>

      {/* License table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-medium text-[#0D1B2A] text-sm">License Records</h2>
        </div>
        {isLoading ? (
          <div className="divide-y divide-slate-50">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded w-1/3" />
                  <div className="h-3 bg-slate-50 rounded w-1/5" />
                </div>
                <div className="w-16 h-5 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : licenses.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Clock className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No licenses yet — they'll appear here once your first property is approved.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    {["Property", "License #", "Status", "Annual Fee", "Payment", "Start", "End", ""].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {licenses.map(l => {
                    return (
                      <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 text-sm font-medium text-[#0D1B2A] max-w-[180px] truncate">{l.property_name}</td>
                        <td className="px-5 py-4 text-xs text-slate-500 font-mono">{l.license_number || "—"}</td>
                        <td className="px-5 py-4">
                         <StatusPill value={l.license_status} />
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {l.annual_fee > 0 ? `$${l.annual_fee.toLocaleString()}` : l.annual_fee === 0 ? <span className="text-xs text-slate-400 italic">Pending</span> : <span className="text-xs text-slate-400 italic">Pending approval</span>}
                          {l.discount_applied_percent > 0 && (
                            <span className="ml-1.5 text-[10px] text-[#C9A96E] font-medium">{l.discount_applied_percent}% off</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill value={l.payment_status} />
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">{fmtDate(l.license_start_date)}</td>
                        <td className="px-5 py-4 text-xs text-slate-500">{fmtDate(l.license_end_date)}</td>
                        <td className="px-5 py-4">
                         <div className="flex flex-col gap-1.5">
                           {l.property_name === "Unassigned" || !l.property_id ? (
                             <button onClick={() => setAssignLicense(l)} className="flex items-center gap-1.5 text-xs text-[#C9A96E] hover:text-[#b8935a] font-medium transition-colors">
                               <Tag className="w-3.5 h-3.5" /> Assign to Property
                             </button>
                           ) : (l.license_status === "active" || l.license_status === "pending") && (
                             <button onClick={() => setTransferLicense(l)} className="flex items-center gap-1.5 text-xs text-[#C9A96E] hover:text-[#b8935a] font-medium transition-colors">
                               <ArrowLeftRight className="w-3.5 h-3.5" /> Transfer
                             </button>
                           )}
                         </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="md:hidden divide-y divide-slate-50">
              {licenses.map(l => (
                  <div key={l.id} className="px-5 py-4 space-y-2">
                    <div className="font-medium text-sm text-[#0D1B2A]">{l.property_name}</div>
                    <div className="text-xs text-slate-400 font-mono">{l.license_number || "No license #"}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusPill value={l.license_status} />
                      <StatusPill value={l.payment_status} />
                      {l.annual_fee != null && <span className="text-xs text-slate-600">${l.annual_fee.toLocaleString()}/yr</span>}
                    </div>
                    {l.license_start_date && <div className="text-xs text-slate-400">{fmtDate(l.license_start_date)} → {fmtDate(l.license_end_date)}</div>}
                    {l.property_name === "Unassigned" || !l.property_id ? (
                      <button onClick={() => setAssignLicense(l)} className="flex items-center gap-1.5 text-xs text-[#C9A96E] font-medium">
                        <Tag className="w-3.5 h-3.5" /> Assign to Property
                      </button>
                    ) : (l.license_status === "active" || l.license_status === "pending") && (
                      <button onClick={() => setTransferLicense(l)} className="flex items-center gap-1.5 text-xs text-[#C9A96E] font-medium">
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Transfer
                      </button>
                    )}
                  </div>
              ))}
            </div>
          </>
        )}
      </div>



      {transferLicense && (
        <LicenseTransferModal
          license={transferLicense}
          partnerEmail={user?.email}
          onClose={() => setTransferLicense(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["my-licenses"] })}
        />
      )}

      {assignLicense && (
        <AssignLicenseModal
          license={assignLicense}
          onClose={() => setAssignLicense(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["my-licenses"] })}
        />
      )}
    </PortalLayout>
  );
}