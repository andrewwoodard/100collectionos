import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Link2, AlertTriangle, Loader2, CheckCircle } from "lucide-react";

function confidenceColor(c) {
  if (c >= 85) return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
  if (c >= 60) return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
  return { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" };
}

export default function LinkActivationModal({ app, onClose, onSuccess }) {
  const qc = useQueryClient();
  const candidates = app.match_candidates || [];
  const hasConfident = candidates.some(c => c.confidence >= 60);
  const [selectedPartnerId, setSelectedPartnerId] = useState(hasConfident ? candidates[0]?.partner_id : "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const partners = await base44.entities.Partner.list("-created_date", 500);
      setSearchResults(
        partners.filter(p => (p.partner_name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 8)
      );
    } catch (_) { setSearchResults([]); }
    setSearching(false);
  };

  const handleConfirm = async () => {
    if (!selectedPartnerId) return;
    setLoading(true);
    setToast(null);
    try {
      const partner = await base44.entities.Partner.get(selectedPartnerId);
      if (!partner) { setToast("Partner not found."); setLoading(false); return; }

      if (partner.status === "inactive" || partner.status === "paused") {
        setToast(`Cannot activate a ${partner.status} partner.`);
        setLoading(false);
        return;
      }
      if (partner.portal_user_id) {
        setToast("This partner has already activated their portal.");
        setLoading(false);
        return;
      }

      if (!partner.primary_contact_email) {
        await base44.entities.Partner.update(partner.id, {
          primary_contact_email: app.email,
          primary_contact_name: app.full_name,
        });
      }

      const res = await base44.functions.invoke("sendActivationEmail", { partner_id: partner.id });
      if (res?.data?.error) {
        setToast(`Activation email failed: ${res.data.error}`);
        setLoading(false);
        return;
      }

      await base44.entities.PartnerApplication.update(app.id, { status: "approved" });

      qc.invalidateQueries(["partner-applications"]);
      onSuccess(`Linked to ${partner.partner_name} and activation email sent to ${partner.primary_contact_email || app.email}.`);
      onClose();
    } catch (e) {
      setToast(e.message || "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#C9A96E]/15 rounded-full flex items-center justify-center">
            <Link2 className="w-5 h-5 text-[#C9A96E]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0D1B2A]">Link & Send Activation</h3>
            <p className="text-xs text-slate-500">{app.full_name} ({app.email})</p>
          </div>
        </div>

        {toast && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {toast}
          </div>
        )}

        {/* Match candidates */}
        <div className="mb-5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Match Candidates</div>
          {candidates.length === 0 || !hasConfident ? (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> No confident match found. Search for a partner below.
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((c, i) => {
                const colors = confidenceColor(c.confidence);
                const isSelected = selectedPartnerId === c.partner_id;
                return (
                  <button
                    key={c.partner_id}
                    type="button"
                    onClick={() => setSelectedPartnerId(c.partner_id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${isSelected ? "border-[#C9A96E] bg-[#FBF6EF]" : "border-slate-100 hover:border-slate-300"}`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "border-[#C9A96E] bg-[#C9A96E]" : "border-slate-300"}`}>
                      {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#0D1B2A] truncate">{c.partner_name}</div>
                      <div className="text-xs text-slate-400 truncate">{c.reason}</div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}>
                      {c.confidence}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Manual search */}
        <div className="mb-5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Or Search All Partners</div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Type a partner name…"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-[#C9A96E]"
            />
          </div>
          {searching && <div className="text-xs text-slate-400 mt-1.5">Searching…</div>}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-slate-100 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setSelectedPartnerId(p.id); setSearchQuery(p.partner_name); setSearchResults([]); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${selectedPartnerId === p.id ? "bg-[#FBF6EF] font-medium text-[#0D1B2A]" : "text-slate-600"}`}
                >
                  {p.partner_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !selectedPartnerId}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-[#0D1B2A] text-white rounded-lg hover:bg-[#1a2e45] disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Linking…</> : <><Link2 className="w-4 h-4" /> Confirm & Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}