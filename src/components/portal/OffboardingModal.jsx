import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  X, Power, CalendarClock, AlertTriangle, CheckCircle2, Loader2,
  PowerOff, RotateCcw, Clock, Ban,
} from "lucide-react";

const STATE_LABELS = {
  temporary_offline: { label: "Offline", color: "bg-amber-100 text-amber-700", icon: PowerOff },
  scheduled: { label: "Scheduled to Offboard", color: "bg-orange-100 text-orange-700", icon: CalendarClock },
  terminated: { label: "Terminated", color: "bg-red-100 text-red-700", icon: Ban },
};

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OffboardingModal({ property, basePropertyId, user, onClose, onCompleted, onSwitchToEdit }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("offline");
  const [reason, setReason] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [loading, setLoading] = useState(false);

  const currentState = property.offboarding_status;
  const stateInfo = STATE_LABELS[currentState];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["property"] });
    qc.invalidateQueries({ queryKey: ["my-linked-properties"] });
    qc.invalidateQueries({ queryKey: ["my-submissions"] });
    qc.invalidateQueries({ queryKey: ["propertiesbase44"] });
  };

  const call = async (payload, successMsg) => {
    setLoading(true);
    try {
      await base44.functions.invoke("manageOffboarding", payload);
      toast({ title: successMsg });
      invalidate();
      onCompleted?.();
    } catch (err) {
      const backendMsg = err?.response?.data?.error || err?.message || "Please try again.";
      console.error("[OffboardingModal] manageOffboarding failed", {
        action: payload?.action,
        propertyId: payload?.propertyId,
        error: err,
      });
      toast({
        variant: "destructive",
        title: "Action failed",
        description: `${backendMsg} (property ${payload?.propertyId || "?"}, action: ${payload?.action || "?"})`,
      });
    } finally {
      setLoading(false);
    }
  };

  const propertyId = basePropertyId || property.id;

  // ─── State-specific views ───
  if (currentState === "temporary_offline") {
    return (
      <ModalShell title="Manage Property Status" onClose={onClose} onSwitchToEdit={onSwitchToEdit}>
        <StateBanner state="temporary_offline" property={property} />
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800 leading-relaxed">
            This property is currently offline. It is hidden from The 100 Collection but remains in your inventory. You can bring it back online at any time.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Close</button>
          <button
            onClick={() => call({ action: "bring_online", propertyId }, "Property is back online")}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Bring Back Online
          </button>
        </div>
      </ModalShell>
    );
  }

  if (currentState === "scheduled") {
    return (
      <ModalShell title="Manage Property Status" onClose={onClose} onSwitchToEdit={onSwitchToEdit}>
        <StateBanner state="scheduled" property={property} />
        <div className="mt-6 bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-sm text-orange-800 leading-relaxed">
            This property is scheduled to offboard on <strong>{fmtDate(property.termination_date)}</strong>. It remains live on The 100 Collection until that date.
          </p>
          {property.offboarding_reason && (
            <p className="text-xs text-orange-600 mt-2">Reason: {property.offboarding_reason}</p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Close</button>
          <button
            onClick={() => call({ action: "cancel_scheduled", propertyId }, "Scheduled offboarding cancelled")}
            disabled={loading}
            className="flex items-center gap-2 bg-[#0D1B2A] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#1a2e45] disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Cancel Scheduled Offboarding
          </button>
        </div>
      </ModalShell>
    );
  }

  if (currentState === "terminated") {
    return (
      <ModalShell title="Manage Property Status" onClose={onClose} onSwitchToEdit={onSwitchToEdit}>
        <StateBanner state="terminated" property={property} />
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-800 leading-relaxed">
            This property has been terminated from The 100 Collection. This action is permanent.
          </p>
          {property.offboarding_reason && (
            <p className="text-xs text-red-600 mt-2">Reason: {property.offboarding_reason}</p>
          )}
          {property.offboarding_approved_at && (
            <p className="text-xs text-red-500 mt-1">Approved on {fmtDate(property.offboarding_approved_at)}</p>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Close</button>
        </div>
      </ModalShell>
    );
  }

  // ─── Active property: show 3 tabs ───
  if (!propertyId) {
    return (
      <ModalShell title="Manage Property Status" onClose={onClose} onSwitchToEdit={onSwitchToEdit}>
        <div className="py-8 text-center text-slate-400 text-sm">
          This property does not support offboarding actions. Please contact our team for assistance.
        </div>
      </ModalShell>
    );
  }

  const tabs = [
    { id: "offline", label: "Take Offline", icon: PowerOff },
    { id: "schedule", label: "Schedule", icon: CalendarClock },
    { id: "terminate", label: "Terminate", icon: AlertTriangle },
  ];

  return (
    <ModalShell title="Manage Property Status" onClose={onClose} onSwitchToEdit={onSwitchToEdit}>
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <span className="text-sm text-slate-600">This property is currently <strong className="text-emerald-700">active</strong>.</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === t.id
                ? t.id === "terminate" ? "bg-white text-red-600 shadow-sm" : "bg-white text-[#0D1B2A] shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab A: Take Offline */}
      {activeTab === "offline" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0D1B2A] mb-1">Take Offline Temporarily</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Hides this property from The 100 Collection while keeping it in your inventory. Bring it back online anytime.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5 block">
              Why are you taking this offline? <span className="text-slate-400 normal-case">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Seasonal closure, renovation, etc."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E] resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => call({ action: "take_offline", propertyId, reason }, "Property taken offline")}
              disabled={loading}
              className="flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />}
              Take Offline
            </button>
          </div>
        </div>
      )}

      {/* Tab B: Schedule */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0D1B2A] mb-1">Schedule Offboarding</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Set a future date when this property should come off The 100 Collection. Until that date, it remains live.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5 block">
              Termination Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={terminationDate}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              onChange={e => setTerminationDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5 block">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this property being offboarded?"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E] resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (!terminationDate) return toast({ variant: "destructive", title: "Please select a date" });
                if (!reason.trim()) return toast({ variant: "destructive", title: "Please provide a reason" });
                call({ action: "schedule", propertyId, terminationDate, reason }, `Offboarding scheduled for ${fmtDate(terminationDate)}`);
              }}
              disabled={loading}
              className="flex items-center gap-2 bg-orange-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
              Schedule for {terminationDate ? fmtDate(terminationDate) : "Date"}
            </button>
          </div>
        </div>
      )}

      {/* Tab C: Terminate */}
      {activeTab === "terminate" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0D1B2A] mb-1">Terminate Permanently</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Permanently remove this property from The 100 Collection. This requires our team's approval and will cancel the associated license.
            </p>
          </div>
          <div className="bg-gradient-to-r from-amber-50 to-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">
                Once approved, this cannot be undone by you. Contact us if you change your mind.
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5 block">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you terminating this property?"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (!reason.trim()) return toast({ variant: "destructive", title: "Please provide a reason" });
                call({
                  action: "request_termination",
                  propertyId,
                  reason,
                  partnerId: property.partner_id,
                  partnerName: property.partner_name,
                  partnerEmail: user?.email,
                  propertyName: property.property_name,
                  listingUrl: property.listing_url || property.vrm_url,
                  supabasePropertyId: property.supabase_property_id,
                }, "Termination request submitted for review");
              }}
              disabled={loading}
              className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Submit Termination Request
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function StateBanner({ state, property }) {
  const info = STATE_LABELS[state];
  if (!info) return null;
  const Icon = info.icon;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${info.color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-[#0D1B2A]">{property.property_name}</div>
        <div className="text-xs text-slate-500">{info.label}</div>
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, onSwitchToEdit, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-light text-[#0D1B2A]">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0D1B2A]">
            <X className="w-5 h-5" />
          </button>
        </div>
        {onSwitchToEdit && (
          <div className="flex justify-end -mt-3 mb-4">
            <button type="button" onClick={onSwitchToEdit} className="text-xs text-[#C9A96E] hover:text-[#A68B4B] font-medium">
              Or, edit this property's details →
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}