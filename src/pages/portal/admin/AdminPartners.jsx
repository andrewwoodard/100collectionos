import React, { useState } from "react";
import { sb } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PortalLayout from "../../../components/portal/PortalLayout";
import LinkPropertiesModal from "../../../components/portal/LinkPropertiesModal";
import PropertyDetailsModal from "../../../components/portal/PropertyDetailsModal";
import PartnerFormModal from "../../../components/partners/PartnerFormModal";
import PartnerLogoCell from "../../../components/admin/PartnerLogoCell";
import { Users, Search, Link2, Edit2 } from "lucide-react";
import UnpaidInvoicesTab from "../../../components/admin/UnpaidInvoicesTab";

export default function AdminPartners({ embedded = false }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("partners");
  const [linkingPartner, setLinkingPartner] = useState(null);
  const [editingProperty, setEditingProperty] = useState(null);
  const [editingPartner, setEditingPartner] = useState(null);
  const qc = useQueryClient();

  const { data: submissions = [] } = useQuery({
    queryKey: ["all-submissions-partners"],
    queryFn: () => base44.entities.PropertySubmission.list("-created_date", 500),
  });

  const { data: partnerEntities = [] } = useQuery({
    queryKey: ["partner-entities-admin"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users-partners"],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: allProperties = [] } = useQuery({
    queryKey: ["all-properties-partners"],
    queryFn: () => fetchAllProperties(),
  });

  // Build partner map from partner-role users first
  const partnerMap = {};

  // Seed from actual User records with role=partner
  allUsers.filter(u => u.role === "partner").forEach(u => {
    partnerMap[u.email] = {
      id: u.id,
      email: u.email,
      name: u.full_name || u.email,
      total: 0, approved: 0, pending: 0, rejected: 0,
      linkedProperties: 0,
    };
  });

  // Augment with submission data (also catches partners without user accounts)
  submissions.forEach(s => {
    const key = s.partner_email;
    if (!key) return;
    if (!partnerMap[key]) {
      partnerMap[key] = { email: key, name: s.partner_name, total: 0, approved: 0, pending: 0, rejected: 0, linkedProperties: 0 };
    }
    // Keep the better name if available
    if (s.partner_name && !partnerMap[key].name) partnerMap[key].name = s.partner_name;
    partnerMap[key].total++;
    if (["approved", "licensed", "active"].includes(s.status)) partnerMap[key].approved++;
    else if (s.status === "rejected") partnerMap[key].rejected++;
    else partnerMap[key].pending++;
  });

  // Count linked properties per partner
  allProperties.forEach(p => {
    const key = p.partner_email || allUsers.find(u => u.id === p.partner_id)?.email;
    if (key && partnerMap[key]) partnerMap[key].linkedProperties++;
  });

  const partners = Object.values(partnerMap).filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const inner = (
    <div>
      {!embedded && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Partner Management</h1>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex gap-1 border-b border-slate-100">
          {[
            { id: "partners", label: "All Partners" },
            { id: "unpaid", label: "Unpaid Invoices" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#0D1B2A] text-[#0D1B2A]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search partners…"
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white w-52" />
        </div>
      </div>

      {tab === "unpaid" ? (
        <UnpaidInvoicesTab />
      ) : (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1200px]">
          <thead>
            <tr className="border-b border-slate-100">
              {["Partner", "Logo", "Email", "Linked Props", "Submitted", "Approved", "Pending", "Rejected", "Rate", ""].map((h, i) => (
                <th key={h} className={`text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 ${i === 0 ? "sticky left-0 bg-white z-10" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {partners.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center">
                <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">No partners yet</p>
              </td></tr>
            ) : partners.map(p => (
              <tr key={p.email} className="hover:bg-slate-50/50">
                <td className="px-5 py-4 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0D1B2A]/5 flex items-center justify-center text-[#0D1B2A] font-semibold text-xs">
                      {p.name?.[0] || "?"}
                    </div>
                    <span className="font-medium text-sm text-[#0D1B2A]">{p.name || "—"}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <PartnerLogoCell
                    partner={partnerEntities.find(e => e.primary_contact_email === p.email || e.partner_name === p.name)}
                    onUpdated={() => qc.invalidateQueries(["partner-entities-admin"])}
                  />
                </td>
                <td className="px-5 py-4 text-xs text-slate-500">{p.email}</td>
                <td className="px-5 py-4">
                  <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{p.linkedProperties}</span>
                </td>
                <td className="px-5 py-4 text-sm font-medium text-[#0D1B2A]">{p.total}</td>
                <td className="px-5 py-4"><span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{p.approved}</span></td>
                <td className="px-5 py-4"><span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{p.pending}</span></td>
                <td className="px-5 py-4"><span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{p.rejected}</span></td>
                <td className="px-5 py-4 text-sm text-slate-600">
                  {p.total > 0 ? `${Math.round((p.approved / p.total) * 100)}%` : "—"}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLinkingPartner(p)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-[#C9A96E] hover:text-[#C9A96E] transition-colors"
                    >
                      <Link2 className="w-3 h-3" /> Properties
                    </button>
                    <button
                      onClick={() => {
                        const entity = partnerEntities.find(e => e.primary_contact_email === p.email || e.partner_name === p.name);
                        if (entity) setEditingPartner(entity);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
  const handlePartnerSave = async (formData) => {
    await base44.entities.Partner.update(editingPartner.id, formData);
    qc.invalidateQueries(["partner-entities-admin"]);
    setEditingPartner(null);
  };

  return (
    <>
      {embedded ? inner : <PortalLayout>{inner}</PortalLayout>}
      {editingPartner && (
        <PartnerFormModal
          open={!!editingPartner}
          onOpenChange={(open) => { if (!open) setEditingPartner(null); }}
          partner={editingPartner}
          onSave={handlePartnerSave}
        />
      )}
      {linkingPartner && (
        <LinkPropertiesModal
          partner={linkingPartner}
          onClose={() => setLinkingPartner(null)}
          onEditProperty={setEditingProperty}
        />
      )}
      {editingProperty && (
        <PropertyDetailsModal
          property={editingProperty}
          onClose={() => setEditingProperty(null)}
        />
      )}
    </>
  );
}