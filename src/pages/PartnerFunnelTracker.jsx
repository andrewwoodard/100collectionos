import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, ExternalLink, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import FunnelOnboardingTable from "@/components/funnel/FunnelOnboardingTable";

// Simple StatusCell for non-onboarding tabs (no audit/waive prompt needed)
function StatusCell({ value, onChange }) {
  const STATUS_OPTIONS = ["Yes", "No", "Waived", "Waiting Externally", "N/A"];
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  const Icon = ({ v }) => {
    if (!v || v === "No") return <XCircle className="w-4 h-4 text-red-400 mx-auto" />;
    if (v === "Yes") return <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />;
    if (v === "Waived") return <CheckCircle2 className="w-4 h-4 text-blue-400 mx-auto" />;
    if (v?.toLowerCase().includes("waiting") || v === "N/A") return <Clock className="w-4 h-4 text-amber-400 mx-auto" />;
    return <span className="text-[10px] text-amber-700 font-medium">{v}</span>;
  };
  return (
    <div ref={ref} className="relative flex justify-center">
      <button onClick={() => setOpen(o => !o)} className="hover:bg-gray-100 rounded p-0.5">
        <Icon v={value} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px] left-1/2 -translate-x-1/2">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2", value === opt && "font-semibold bg-gray-50")}>
              <Icon v={opt} /><span>{opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DateCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  // Normalize stored value (e.g. "2026-02-13 00:00:00") to "YYYY-MM-DD"
  const toInputVal = (v) => {
    if (!v) return "";
    const m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  };

  const displayVal = (v) => {
    const d = toInputVal(v);
    if (!d) return null;
    const [y, mo, day] = d.split("-");
    return `${mo}/${day}/${y}`;
  };

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="date"
        className="text-xs border border-amber-300 rounded px-1.5 py-1 outline-none bg-amber-50 w-[130px]"
        defaultValue={toInputVal(value)}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        autoFocus
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="cursor-pointer hover:bg-gray-50 rounded px-1.5 py-1 min-h-[24px] text-xs text-gray-700 whitespace-nowrap flex items-center gap-1 group/date"
    >
      {displayVal(value) || <span className="text-gray-300">—</span>}
      <span className="opacity-0 group-hover/date:opacity-50 text-gray-400 text-[10px]">✏</span>
    </div>
  );
}

function TextCell({ value, onChange, placeholder = "—" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setVal(value || ""); }, [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-full text-xs border border-amber-300 rounded px-1.5 py-1 outline-none bg-amber-50"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onChange(val); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onChange(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      />
    );
  }
  return (
    <div
      onClick={() => setEditing(true)}
      className="cursor-text hover:bg-gray-50 rounded px-1 py-0.5 min-h-[24px] text-xs text-gray-700"
    >
      {value || <span className="text-gray-300">{placeholder}</span>}
    </div>
  );
}

const OFFBOARDING_COLS = [
  { key: "partner_name", label: "Partner", isText: true },
  { key: "contract_end_date", label: "Contract End", isText: true },
  { key: "offboarding_email_sent", label: "Offboarding Email", isStatus: true },
  { key: "taken_off_site", label: "Off Site", isStatus: true },
  { key: "our_brand_removed", label: "Brand Removed", isStatus: true },
  { key: "time_with_us", label: "Time w/ Us", isText: true },
  { key: "reason", label: "Reason", isText: true },
];

export default function PartnerFunnelTracker() {
  const [searchParams] = useSearchParams();
  const partnerIdParam = searchParams.get("partnerId");
  const [tab, setTab] = useState("onboarding");
  const qc = useQueryClient();

  const { data: offboarding = [], isLoading: loadingOffboarding } = useQuery({
    queryKey: ["offboardingRecords"],
    queryFn: () => base44.entities.OffboardingRecord.list(),
  });

  const { data: propertyChanges = [], isLoading: loadingPropertyChanges } = useQuery({
    queryKey: ["propertyChanges"],
    queryFn: () => base44.entities.PropertyChange.list("-created_date", 200),
  });

  const { data: partnerAudit = [], isLoading: loadingPartnerAudit } = useQuery({
    queryKey: ["partnerAudit"],
    queryFn: () => base44.entities.PartnerAudit.list("company", 200),
  });



  const updateOffboarding = useMutation({
    mutationFn: ({ id, data }) => base44.entities.OffboardingRecord.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offboardingRecords"] }),
  });

  const createOffboarding = useMutation({
    mutationFn: (data) => base44.entities.OffboardingRecord.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offboardingRecords"] }),
  });

  const deleteOffboarding = useMutation({
    mutationFn: (id) => base44.entities.OffboardingRecord.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offboardingRecords"] }),
  });

  const updatePropertyChange = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PropertyChange.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["propertyChanges"] }),
  });

  const createPropertyChange = useMutation({
    mutationFn: (data) => base44.entities.PropertyChange.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["propertyChanges"] }),
  });

  const deletePropertyChange = useMutation({
    mutationFn: (id) => base44.entities.PropertyChange.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["propertyChanges"] }),
  });

  const updatePartnerAudit = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartnerAudit.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partnerAudit"] }),
  });

  const createPartnerAudit = useMutation({
    mutationFn: (data) => base44.entities.PartnerAudit.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partnerAudit"] }),
  });

  const deletePartnerAudit = useMutation({
    mutationFn: (id) => base44.entities.PartnerAudit.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partnerAudit"] }),
  });

  function handleOffboardingChange(row, field, value) {
    updateOffboarding.mutate({ id: row.id, data: { [field]: value } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Partner Funnel Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">Click any cell to edit. Changes save automatically.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {[
          { id: "onboarding", label: "Onboarding" },
          { id: "offboarding", label: `Offboarding (${offboarding.length})` },
          { id: "property_changes", label: `Property Changes (${propertyChanges.length})` },
          { id: "partner_audit", label: `Partner Audit (${partnerAudit.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t.id ? "border-[#C9A96E] text-[#C9A96E]" : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Onboarding Tab */}
      {tab === "onboarding" && (
        <div className="space-y-4">
          <FunnelOnboardingTable highlightPartnerId={partnerIdParam} autoOpenModal={!!partnerIdParam} />
        </div>
      )}

      {/* Offboarding Tab */}
      {tab === "offboarding" && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {loadingOffboarding ? (
            <div className="p-12 text-center text-gray-400">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {OFFBOARDING_COLS.map(c => (
                    <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{c.label}</th>
                  ))}
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {offboarding.map((r, i) => (
                  <tr key={r.id} className={cn("border-b border-gray-50 hover:bg-gray-50/60 group", i % 2 !== 0 && "bg-gray-50/40")}>
                    {OFFBOARDING_COLS.map(c => (
                      <td key={c.key} className="px-4 py-2">
                        {c.isStatus ? (
                          <StatusCell
                            value={r[c.key]}
                            onChange={v => handleOffboardingChange(r, c.key, v)}
                          />
                        ) : (
                          <TextCell
                            value={r[c.key]}
                            onChange={v => handleOffboardingChange(r, c.key, v)}
                            placeholder="—"
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <button
                        onClick={() => { if (confirm("Delete this row?")) deleteOffboarding.mutate(r.id); }}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="p-3 border-t border-gray-100">
            <button
              onClick={() => createOffboarding.mutate({ partner_name: "New Partner" })}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#C9A96E] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add record
            </button>
          </div>
        </div>
      )}

      {/* Property Changes Tab */}
      {tab === "property_changes" && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {loadingPropertyChanges ? (
            <div className="p-12 text-center text-gray-400">Loading...</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Date", "Partner", "Status", "Waiting On", "Type", "Property URL", "Photos", "Acknowledged", "Invoice Updated"].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {propertyChanges.map((r, i) => (
                  <tr key={r.id} className={cn("border-b border-gray-50 hover:bg-gray-50/60 group", i % 2 !== 0 && "bg-gray-50/30")}>
                    <td className="px-3 py-2"><DateCell value={r.date} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { date: v } })} /></td>
                    <td className="px-3 py-2"><TextCell value={r.partner} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { partner: v } })} /></td>
                    <td className="px-3 py-2"><TextCell value={r.status} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { status: v } })} /></td>
                    <td className="px-3 py-2"><TextCell value={r.waiting_on} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { waiting_on: v } })} /></td>
                    <td className="px-3 py-2"><TextCell value={r.switch_or_addition} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { switch_or_addition: v } })} /></td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <TextCell value={r.property_url} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { property_url: v } })} />
                      {r.property_url && <a href={r.property_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 mt-0.5"><ExternalLink className="w-3 h-3" /></a>}
                    </td>
                    <td className="px-3 py-2">
                      {r.link_to_photos ? <a href={r.link_to_photos} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline"><ExternalLink className="w-3 h-3" /></a> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center"><StatusCell value={r.acknowledged} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { acknowledged: v } })} /></td>
                    <td className="px-3 py-2 text-center"><StatusCell value={r.invoice_updated} onChange={v => updatePropertyChange.mutate({ id: r.id, data: { invoice_updated: v } })} /></td>
                    <td className="px-2 py-2">
                      <button onClick={() => { if (confirm("Delete?")) deletePropertyChange.mutate(r.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="p-3 border-t border-gray-100">
            <button onClick={() => createPropertyChange.mutate({ partner: "New Partner" })} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#C9A96E] transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add record
            </button>
          </div>
        </div>
      )}

      {/* Partner Audit Tab */}
      {tab === "partner_audit" && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {loadingPartnerAudit ? (
            <div className="p-12 text-center text-gray-400">Loading...</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Company", "Analytics Given", "Website Access", "Proud Header Added", "VRM Landing Page", "Homepage Link", "100 Collection Lander"].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {partnerAudit.map((r, i) => (
                  <tr key={r.id} className={cn("border-b border-gray-50 hover:bg-gray-50/60 group", i % 2 !== 0 && "bg-gray-50/30")}>
                    <td className="px-3 py-2 font-medium">
                      <TextCell value={r.company} onChange={v => updatePartnerAudit.mutate({ id: r.id, data: { company: v } })} />
                    </td>
                    <td className="px-3 py-2 text-center"><StatusCell value={r.analytics_given} onChange={v => updatePartnerAudit.mutate({ id: r.id, data: { analytics_given: v } })} /></td>
                    <td className="px-3 py-2 text-center"><StatusCell value={r.website_access_given} onChange={v => updatePartnerAudit.mutate({ id: r.id, data: { website_access_given: v } })} /></td>
                    <td className="px-3 py-2 text-center"><StatusCell value={r.proud_header_added} onChange={v => updatePartnerAudit.mutate({ id: r.id, data: { proud_header_added: v } })} /></td>
                    <td className="px-3 py-2 text-center"><StatusCell value={r.vrm_landing_page_added} onChange={v => updatePartnerAudit.mutate({ id: r.id, data: { vrm_landing_page_added: v } })} /></td>
                    <td className="px-3 py-2">
                      <TextCell value={r.homepage_link} onChange={v => updatePartnerAudit.mutate({ id: r.id, data: { homepage_link: v } })} />
                      {r.homepage_link && <a href={r.homepage_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 flex items-center gap-1 mt-0.5"><ExternalLink className="w-3 h-3" /></a>}
                    </td>
                    <td className="px-3 py-2">
                      <TextCell value={r.lander_link} onChange={v => updatePartnerAudit.mutate({ id: r.id, data: { lander_link: v } })} />
                      {r.lander_link && <a href={r.lander_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 flex items-center gap-1 mt-0.5"><ExternalLink className="w-3 h-3" /></a>}
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => { if (confirm("Delete?")) deletePartnerAudit.mutate(r.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="p-3 border-t border-gray-100">
            <button onClick={() => createPartnerAudit.mutate({ company: "New Partner" })} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#C9A96E] transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add record
            </button>
          </div>
        </div>
      )}

    </div>
  );
}