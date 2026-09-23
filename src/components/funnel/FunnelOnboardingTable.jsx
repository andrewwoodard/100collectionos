/** FunnelOnboardingTable — Phase 2 canonical, inlined config */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, ExternalLink, Plus, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import PartnerFormModal from "@/components/partners/PartnerFormModal";
import FunnelCommentsModal from "@/components/funnel/FunnelCommentsModal";

// ── Inlined canonical config (no external import) ─────────────────────────────

const CANONICAL_SUBTASKS = [
  // CONTRACTED (6)
  { dbField: "contract_sent",           displayName: "Contract Sent",               stage: "contracted", responsibleParty: "us" },
  { dbField: "contract_signed",         displayName: "Contract Signed",             stage: "contracted", responsibleParty: "partner" },
  { dbField: "stripe_added",            displayName: "Stripe Setup",                stage: "contracted", responsibleParty: "us" },
  { dbField: "onboarding_fee_invoiced", displayName: "Fee Invoiced",                stage: "contracted", responsibleParty: "us" },
  { dbField: "onboarding_fee_paid",     displayName: "Fee Paid",                    stage: "contracted", responsibleParty: "partner" },
  { dbField: "kickoff_email_sent",      displayName: "Kickoff Email",               stage: "contracted", responsibleParty: "us" },
  // CONTENT (6)
  { dbField: "partner_folder_created",  displayName: "Content Folder Created",      stage: "content", responsibleParty: "us" },
  { dbField: "intake_form_done",        displayName: "Intake Form Returned",        stage: "content", responsibleParty: "partner" },
  { dbField: "post_call_recap",         displayName: "Post-Call Recap Sent",        stage: "content", responsibleParty: "us" },
  { dbField: "writer_interview",        displayName: "Writer Interview Complete",   stage: "content", responsibleParty: "either" },
  { dbField: "writeup_completed",       displayName: "Write-Up Done",               stage: "content", responsibleParty: "us" },
  { dbField: "destination_writeup_approved", displayName: "Write-Up Approved",      stage: "content", responsibleParty: "partner" },
  // BUILD (7)
  { dbField: "properties_given",        displayName: "Properties Given",            stage: "build", responsibleParty: "partner" },
  { dbField: "analytics_given",         displayName: "Analytics Installed",         stage: "build", responsibleParty: "us" },
  { dbField: "gtag_given",              displayName: "GA Tag Added",                stage: "build", responsibleParty: "us" },
  { dbField: "website_access_given",    displayName: "Site Access Granted",         stage: "build", responsibleParty: "partner" },
  { dbField: "proud_header_mockup",     displayName: "Header Mock-Up Approved",     stage: "build", responsibleParty: "partner" },
  { dbField: "proud_header_added",      displayName: "Header Added",                stage: "build", responsibleParty: "partner" },
  { dbField: "vrm_landing_page",        displayName: "VRM Landing Page Created",    stage: "build", responsibleParty: "us" },
  // LISTED (2)
  { dbField: "fully_live",              displayName: "Listing Fully Live",          stage: "listed", responsibleParty: "us" },
  { dbField: "live_email_sent",         displayName: "Live Announcement Email Sent",stage: "listed", responsibleParty: "us" },
];

const TOTAL_CANONICAL = 21;

// Non-canonical reference columns — rendered after LISTED, NOT counted in /21
const REFERENCE_COLS = [
  { key: "social_media_announced", label: "Social Media",    isText: false },
  { key: "in_category",            label: "In Category",     isText: false },
  { key: "licensing_fee_deal",     label: "Fee Deal",        isText: true  },
  { key: "licensing_fees_invoiced",label: "Fees Invoiced",   isText: true  },
  { key: "landing_page_added",     label: "Landing Page",    isText: false },
];

const DONE_VALUES = ["Yes", "Complete", "Waived"];
function isDone(val) { return DONE_VALUES.includes(val); }

function getProgress(row) {
  const done = CANONICAL_SUBTASKS.filter(t => isDone(row[t.dbField])).length;
  return Math.round((done / TOTAL_CANONICAL) * 100);
}

// Stage groups in canonical order
const STAGE_GROUPS = [
  { stage: "contracted", label: "CONTRACTED", headerCls: "bg-blue-50 text-blue-700 border-blue-200",     borderCls: "border-blue-200" },
  { stage: "content",    label: "CONTENT",    headerCls: "bg-purple-50 text-purple-700 border-purple-200", borderCls: "border-purple-200" },
  { stage: "build",      label: "BUILD",      headerCls: "bg-green-50 text-green-700 border-green-200",   borderCls: "border-green-200" },
  { stage: "listed",     label: "LISTED",     headerCls: "bg-amber-50 text-amber-700 border-amber-200",   borderCls: "border-amber-200" },
].map(g => ({ ...g, fields: CANONICAL_SUBTASKS.filter(t => t.stage === g.stage) }));

// Stage chip styling (read from Partner.funnel_stage — never recomputed here)
const STAGE_CHIP = {
  approved:   "bg-gray-100 text-gray-600",
  contracted: "bg-blue-100 text-blue-700",
  content:    "bg-purple-100 text-purple-700",
  build:      "bg-amber-100 text-amber-700",
  listed:     "bg-green-100 text-green-700",
};
const STAGE_CHIP_LABELS = {
  approved: "Approved", contracted: "Contracted", content: "Content",
  build: "Build", listed: "Listed",
};

const STATUS_OPTIONS = ["Yes", "No", "Waived", "Waiting Externally", "N/A"];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusIcon({ val }) {
  if (!val || val === "-" || val === "No")
    return <XCircle className="w-4 h-4 text-red-400 mx-auto" />;
  if (val === "Yes")
    return <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />;
  if (val === "Waived")
    return <CheckCircle2 className="w-4 h-4 text-blue-400 mx-auto" />;
  if (val?.toLowerCase().includes("waiting") || val === "N/A")
    return <Clock className="w-4 h-4 text-amber-400 mx-auto" />;
  return <span className="text-[10px] text-amber-700 font-medium leading-none text-center block px-0.5">{val}</span>;
}

function StatusCell({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative flex justify-center">
      <button onClick={() => setOpen(o => !o)} className="hover:bg-gray-100 rounded p-0.5 transition-colors">
        <StatusIcon val={value} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px] left-1/2 -translate-x-1/2">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2", value === opt && "bg-gray-50 font-semibold")}>
              <StatusIcon val={opt} /><span>{opt}</span>
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1 px-2">
            <input
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-amber-400"
              placeholder="Custom value…"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && custom.trim()) { onChange(custom.trim()); setCustom(""); setOpen(false); }
              }}
            />
          </div>
        </div>
      )}
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
      <input ref={inputRef}
        className="w-full text-xs border border-amber-300 rounded px-1.5 py-1 outline-none bg-amber-50"
        value={val} onChange={e => setVal(e.target.value)}
        onBlur={() => { onChange(val); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onChange(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      />
    );
  }
  return (
    <div onClick={() => setEditing(true)} className="cursor-text hover:bg-gray-50 rounded px-1 py-0.5 min-h-[24px] text-xs text-gray-700">
      {value || <span className="text-gray-300">{placeholder}</span>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FunnelOnboardingTable({ highlightPartnerId, autoOpenModal }) {
  const qc = useQueryClient();

  const { data: onboarding = [], isLoading } = useQuery({
    queryKey: ["partnerOnboarding"],
    queryFn: () => base44.entities.PartnerOnboarding.list(),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partners_funnel"],
    queryFn: () => base44.entities.Partner.list(),
  });

  const partnerMap = useMemo(() => {
    const m = {};
    for (const p of partners) m[p.id] = p;
    return m;
  }, [partners]);

  const { data: allComments = [] } = useQuery({
    queryKey: ["funnel-comment-counts"],
    queryFn: () => base44.entities.FunnelComment.list("-created_date", 500),
  });

  const commentCounts = useMemo(() => {
    const m = {};
    for (const c of allComments) {
      if (!c.partner_id) continue;
      if (!m[c.partner_id]) m[c.partner_id] = { total: 0, resolved: 0 };
      m[c.partner_id].total++;
      if (c.is_resolved) m[c.partner_id].resolved++;
    }
    return m;
  }, [allComments]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartnerOnboarding.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partnerOnboarding"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.PartnerOnboarding.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partnerOnboarding"] }),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [notesModal, setNotesModal] = useState(null);

  // Deep-link: scroll to row + auto-open notes modal
  useEffect(() => {
    if (!highlightPartnerId || isLoading) return;
    const row = document.getElementById(`funnel-row-${highlightPartnerId}`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    if (autoOpenModal) {
      const onboardingRow = onboarding.find(r => r.partner_id === highlightPartnerId);
      if (onboardingRow) {
        setNotesModal({
          partnerId: highlightPartnerId,
          partnerName: onboardingRow.partner_name,
          legacyNotes: onboardingRow.internal_notes,
          onboardingId: onboardingRow.id,
        });
      }
    }
  }, [highlightPartnerId, autoOpenModal, isLoading, onboarding]);

  // Creates a real Partner, then ensures a matching PartnerOnboarding row exists.
  const handleCreatePartner = async (form) => {
    const newPartner = await base44.entities.Partner.create(form);

    // Safety net: if the auto-hook didn't fire, explicitly create the onboarding row.
    const existing = onboarding.filter(r => r.partner_id === newPartner.id);
    if (existing.length === 0) {
      await base44.entities.PartnerOnboarding.create({
        partner_id: newPartner.id,
        partner_name: newPartner.partner_name,
      });
    }

    qc.invalidateQueries({ queryKey: ["partnerOnboarding"] });
    qc.invalidateQueries({ queryKey: ["partners_funnel"] });
    qc.invalidateQueries({ queryKey: ["base44-partners"] });
  };

  if (isLoading) return <div className="p-12 text-center text-gray-400">Loading…</div>;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            {/* Row 1: stage group headers */}
            <tr className="border-b border-gray-100">
              <th className="sticky left-0 bg-white z-20 border-r border-gray-100 text-left px-4 py-3 font-semibold text-gray-700 min-w-[180px]" rowSpan={2}>
                Partner
              </th>
              {/* Stage chip — read-only from Partner.funnel_stage */}
              <th className="border-r border-gray-100 text-center px-3 py-3 font-semibold text-gray-700 min-w-[90px] whitespace-nowrap" rowSpan={2}>
                Stage
              </th>
              <th className="border-r border-gray-100 text-center px-3 py-3 font-semibold text-gray-700 min-w-[70px]" rowSpan={2}>
                Progress
              </th>
              {STAGE_GROUPS.map(sg => (
                <th key={sg.stage} colSpan={sg.fields.length}
                  className={cn("px-2 py-2 text-center font-bold text-[11px] tracking-wider border-l-2", sg.headerCls)}>
                  {sg.label}
                </th>
              ))}
              {/* Reference group header */}
              <th colSpan={REFERENCE_COLS.length + 1}
                className="px-2 py-2 text-center font-bold text-[11px] tracking-wider border-l-2 bg-slate-50 text-slate-400 border-slate-200">
                REFERENCE (not counted)
              </th>
              <th rowSpan={2} className="px-2 py-3 text-center font-semibold text-gray-700 min-w-[90px] border-l border-gray-100">Notes</th>
              <th rowSpan={2} className="w-8" />
            </tr>
            {/* Row 2: individual column labels */}
            <tr className="border-b border-gray-100">
              {STAGE_GROUPS.map(sg =>
                sg.fields.map((f, fi) => (
                  <th key={f.dbField}
                    className={cn("px-2 py-2 font-medium text-gray-600 text-center min-w-[90px]",
                      fi === 0 ? `border-l-2 ${sg.borderCls}` : "")}>
                    <div className="whitespace-nowrap">{f.displayName}</div>
                  </th>
                ))
              )}
              {/* Reference column labels */}
              {REFERENCE_COLS.map((c, ci) => (
                <th key={c.key}
                  className={cn("px-2 py-2 font-medium text-slate-400 text-center min-w-[90px]",
                    ci === 0 ? "border-l-2 border-slate-200" : "")}>
                  <div className="whitespace-nowrap">{c.label}</div>
                </th>
              ))}
              {/* Live URL */}
              <th className="px-3 py-2 font-medium text-slate-400 min-w-[140px] text-left">Live URL</th>
            </tr>
          </thead>
          <tbody>
            {onboarding.map((row, ri) => {
              const pct = getProgress(row);
              const doneCount = CANONICAL_SUBTASKS.filter(t => isDone(row[t.dbField])).length;
              const partner = row.partner_id ? partnerMap[row.partner_id] : null;
              const funnelStage = partner?.funnel_stage || null;

              return (
                <tr key={row.id} id={row.partner_id ? `funnel-row-${row.partner_id}` : undefined} className={cn("border-b border-gray-50 hover:bg-gray-50/60 group", ri % 2 !== 0 && "bg-gray-50/30", row.partner_id === highlightPartnerId && "ring-2 ring-amber-300 ring-inset")}>
                  {/* Partner name */}
                  <td className="sticky left-0 bg-white z-10 px-4 py-2 border-r border-gray-100">
                    <TextCell value={row.partner_name}
                      onChange={v => updateMutation.mutate({ id: row.id, data: { partner_name: v } })}
                      placeholder="Partner name" />
                  </td>

                  {/* Stage chip — read-only from Partner.funnel_stage */}
                  <td className="px-3 py-2 text-center border-r border-gray-100">
                    {funnelStage ? (
                      <span className={cn(
                        "inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        STAGE_CHIP[funnelStage] || "bg-gray-100 text-gray-600"
                      )}>
                        {STAGE_CHIP_LABELS[funnelStage] || funnelStage}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[10px]">—</span>
                    )}
                  </td>

                  {/* Progress */}
                  <td className="px-3 py-2 text-center border-r border-gray-100">
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-xs font-bold text-gray-700">{pct}%</div>
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#C9A96E] to-green-400" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-gray-400">{doneCount}/{TOTAL_CANONICAL}</div>
                    </div>
                  </td>

                  {/* Canonical subtask cells */}
                  {STAGE_GROUPS.map(sg =>
                    sg.fields.map((f, fi) => (
                      <td key={f.dbField} className={cn("px-2 py-2 text-center", fi === 0 ? `border-l-2 ${sg.borderCls}` : "")}>
                        <StatusCell value={row[f.dbField]}
                          onChange={v => updateMutation.mutate({ id: row.id, data: { [f.dbField]: v } })} />
                      </td>
                    ))
                  )}

                  {/* Reference cells — not counted in /21 */}
                  {REFERENCE_COLS.map((c, ci) => (
                    <td key={c.key} className={cn("px-2 py-2 text-center opacity-70", ci === 0 ? "border-l-2 border-slate-200" : "")}>
                      {c.isText ? (
                        <TextCell value={row[c.key]} onChange={v => updateMutation.mutate({ id: row.id, data: { [c.key]: v } })} placeholder="—" />
                      ) : (
                        <StatusCell value={row[c.key]} onChange={v => updateMutation.mutate({ id: row.id, data: { [c.key]: v } })} />
                      )}
                    </td>
                  ))}

                  {/* Live URL */}
                  <td className="px-3 py-2 opacity-70">
                    <TextCell value={row.live_url}
                      onChange={v => updateMutation.mutate({ id: row.id, data: { live_url: v } })}
                      placeholder="https://…" />
                    {row.live_url && (
                      <a href={row.live_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-500 hover:underline mt-0.5">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-2 py-2 border-l border-gray-100">
                    {(() => {
                      const cc = commentCounts[row.partner_id];
                      const total = cc?.total || 0;
                      const allResolved = cc && cc.total > 0 && cc.resolved === cc.total;
                      if (total === 0) {
                        return (
                          <button onClick={() => setNotesModal({ partnerId: row.partner_id, partnerName: row.partner_name, legacyNotes: row.internal_notes, onboardingId: row.id })}
                            className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-[#C9A96E] transition-colors">
                            <Pencil className="w-3 h-3" /> Add notes…
                          </button>
                        );
                      }
                      if (allResolved) {
                        return (
                          <button onClick={() => setNotesModal({ partnerId: row.partner_id, partnerName: row.partner_name, legacyNotes: row.internal_notes, onboardingId: row.id })}
                            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                            {total} note{total !== 1 ? "s" : ""} · resolved
                          </button>
                        );
                      }
                      return (
                        <button onClick={() => setNotesModal({ partnerId: row.partner_id, partnerName: row.partner_name, legacyNotes: row.internal_notes, onboardingId: row.id })}
                          className="flex items-center gap-1 text-[10px] text-[#C9A96E] hover:text-[#b8935a] transition-colors">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {total} note{total !== 1 ? "s" : ""}
                        </button>
                      );
                    })()}
                  </td>

                  {/* Delete */}
                  <td className="px-2 py-2">
                    <button onClick={() => { if (confirm("Delete this row?")) deleteMutation.mutate(row.id); }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-3 border-t border-gray-100">
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#C9A96E] transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add partner
          </button>
        </div>
      </div>

      <PartnerFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        partner={null}
        onSave={handleCreatePartner}
      />

      {notesModal && (
        <FunnelCommentsModal
          partnerId={notesModal.partnerId}
          partnerName={notesModal.partnerName}
          legacyNotes={notesModal.legacyNotes}
          onboardingId={notesModal.onboardingId}
          onClose={() => setNotesModal(null)}
        />
      )}

      {/* Legend — single copy, with /21 footnote */}
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="font-medium text-gray-700">Legend:</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Yes / Complete</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Waived</span>
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-400" /> Waiting / N/A</span>
        <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-400" /> No / Not Done</span>
        <span className="text-gray-400">· Progress = (Yes + Waived) ÷ {TOTAL_CANONICAL} canonical tasks</span>
      </div>
    </>
  );
}