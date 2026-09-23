import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, Tag, CheckCircle2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * Resolves the authoritative Base44 Partner entity for this partner, independent
 * of whether the URL id is a Base44 id or a Supabase id. Tries id lookup first,
 * then falls back to an exact partner_name match. This guarantees the card reads
 * and writes license_unit_price / discount fields against the real Base44 record.
 */
function useBase44Partner(partnerId, partnerName) {
  return useQuery({
    queryKey: ["discount-card-partner", partnerId, partnerName],
    queryFn: async () => {
      if (partnerId) {
        try {
          const byId = await base44.entities.Partner.filter({ id: partnerId });
          if (byId?.[0]) return byId[0];
        } catch (e) { /* id may be a Supabase id — fall through to name */ }
      }
      if (partnerName) {
        const byName = await base44.entities.Partner.filter({ partner_name: partnerName });
        return byName?.[0] || null;
      }
      return null;
    },
    enabled: !!(partnerId || partnerName),
  });
}

export default function DiscountCard({ partner, partnerId, onUpdated }) {
  const queryClient = useQueryClient();
  const partnerName = partner?.partner_name;
  const { data: b44Partner } = useBase44Partner(partnerId, partnerName);

  const source = b44Partner || partner;
  const effectiveId = b44Partner?.id || partnerId;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    license_unit_price: source?.license_unit_price ?? 1200,
    discount_percent: source?.discount_percent ?? 0,
    discount_label: source?.discount_label ?? "",
    stripe_promotion_code: source?.stripe_promotion_code ?? "",
  });
  const [saving, setSaving] = useState(false);

  // Keep form in sync when the resolved Base44 partner changes (e.g. after refetch)
  useEffect(() => {
    setForm({
      license_unit_price: source?.license_unit_price ?? 1200,
      discount_percent: source?.discount_percent ?? 0,
      discount_label: source?.discount_label ?? "",
      stripe_promotion_code: source?.stripe_promotion_code ?? "",
    });
  }, [source?.license_unit_price, source?.discount_percent, source?.discount_label, source?.stripe_promotion_code]);

  const hasDiscount = source?.discount_percent > 0 || source?.discount_label || source?.stripe_promotion_code;

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

  const handleSave = async () => {
    if (!effectiveId) {
      alert("Could not resolve the Base44 partner record. Make sure this partner exists in Base44 before editing pricing.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        license_unit_price: Number(form.license_unit_price) > 0 ? Number(form.license_unit_price) : 1200,
        discount_percent: Math.min(100, Math.max(0, Number(form.discount_percent) || 0)),
        discount_label: form.discount_label?.trim() || null,
        stripe_promotion_code: form.stripe_promotion_code?.trim() || null,
      };
      await base44.entities.Partner.update(effectiveId, payload);
      await queryClient.invalidateQueries({ queryKey: ["discount-card-partner", partnerId, partnerName] });
      setEditing(false);
      onUpdated?.();
    } catch (e) {
      console.error("DiscountCard save failed:", e);
      alert(e?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      license_unit_price: source?.license_unit_price ?? 1200,
      discount_percent: source?.discount_percent ?? 0,
      discount_label: source?.discount_label ?? "",
      stripe_promotion_code: source?.stripe_promotion_code ?? "",
    });
    setEditing(false);
  };

  const inputCls = "w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300";

  return (
    <div className="bg-white rounded-lg border border-amber-100 p-3 col-span-2 md:col-span-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Discount &amp; License Pricing</span>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-amber-500 transition-colors" title="Edit discount & pricing">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">License Unit Price ($/yr) — default 1200</label>
            <input
              autoFocus
              type="number"
              min="0"
              step="any"
              value={form.license_unit_price}
              onChange={e => setForm(f => ({ ...f, license_unit_price: e.target.value }))}
              placeholder="1200"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Discount %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={form.discount_percent}
                onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Discount Label</label>
              <input
                type="text"
                value={form.discount_label}
                onChange={e => setForm(f => ({ ...f, discount_label: e.target.value }))}
                placeholder="e.g. 15% Discount (20+)"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Stripe Promo Code ID (promo_xxx)</label>
            <input
              type="text"
              value={form.stripe_promotion_code}
              onChange={e => setForm(f => ({ ...f, stripe_promotion_code: e.target.value }))}
              placeholder="promo_… (optional)"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-gray-600">
              License price: <span className="font-semibold text-gray-800">{fmt(source?.license_unit_price || 1200)}</span>/yr
              {Number(source?.license_unit_price) > 0 && Number(source?.license_unit_price) !== 1200 && (
                <span className="text-[10px] text-amber-600 ml-1">(custom)</span>
              )}
            </span>
          </div>
          {hasDiscount ? (
            <div className="space-y-1">
              {source.discount_label && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="text-xs font-medium text-gray-800">{source.discount_label}</span>
                  {source.discount_percent > 0 && (
                    <span className="text-xs text-amber-600 font-semibold">({source.discount_percent}% off)</span>
                  )}
                </div>
              )}
              {source.stripe_promotion_code ? (
                <p className="text-[10px] text-gray-400 font-mono pl-5">{source.stripe_promotion_code}</p>
              ) : (
                <p className="text-[10px] text-amber-500 pl-5 italic">⚠ No Stripe promo code linked yet</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}