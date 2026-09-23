import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Building2, Tag, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

function StatusBadge({ val }) {
  if (!val || val === "No" || val === "-") return <span className="text-red-500 text-xs">✗ No</span>;
  if (val === "Yes") return <span className="text-green-600 text-xs">✓ Yes</span>;
  if (val === "Waived") return <span className="text-blue-500 text-xs">~ Waived</span>;
  if (val?.toLowerCase().includes("waiting")) return <span className="text-amber-500 text-xs">⏳ Waiting</span>;
  return <span className="text-gray-600 text-xs">{val}</span>;
}

export default function PartnerReport() {
  const [selectedPartner, setSelectedPartner] = useState("");
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const reportRef = useRef(null);

  const { data: funnelPartners = [], isLoading } = useQuery({
    queryKey: ["partnerOnboarding"],
    queryFn: () => base44.entities.PartnerOnboarding.filter({}, "partner_name", 1000),
  });

  const { data: propertyChanges = [] } = useQuery({
    queryKey: ["propertyChanges"],
    queryFn: () => base44.entities.PropertyChange.list("-created_date", 500),
  });

  const { data: partnerAudit = [] } = useQuery({
    queryKey: ["partnerAudit"],
    queryFn: () => base44.entities.PartnerAudit.list("company", 200),
  });

  const partner = funnelPartners.find(p => p.id === selectedPartner);
  const audit = partnerAudit.find(a =>
    a.company?.toLowerCase().trim() === partner?.partner_name?.toLowerCase().trim()
  );
  const changes = propertyChanges.filter(c =>
    c.partner?.toLowerCase().trim() === partner?.partner_name?.toLowerCase().trim()
  );

  const handlePrint = () => {
    window.print();
  };

  const onboardingFields = [
    { key: "contract_sent", label: "Contract Sent" },
    { key: "contract_signed", label: "Contract Signed" },
    { key: "stripe_added", label: "Added to Stripe" },
    { key: "onboarding_fee_invoiced", label: "Onboarding Fee Invoiced" },
    { key: "onboarding_fee_paid", label: "Onboarding Fee Paid" },
    { key: "kickoff_email_sent", label: "Kickoff Email Sent" },
    { key: "intake_form_done", label: "Intake Form Completed" },
    { key: "writeup_completed", label: "Write-Up Completed" },
    { key: "destination_writeup_approved", label: "Write-Up Approved" },
    { key: "properties_given", label: "Properties Given" },
    { key: "analytics_given", label: "Analytics Access Given" },
    { key: "gtag_given", label: "Gtag Manager Given" },
    { key: "website_access_given", label: "Website Access Given" },
    { key: "fully_live", label: "Fully Live on Site" },
    { key: "live_email_sent", label: "Live Email Sent" },
    { key: "proud_header_mockup", label: "Proud Header Mockup" },
    { key: "proud_header_added", label: "Proud Header Added" },
    { key: "vrm_landing_page", label: "VRM Landing Page" },
    { key: "landing_page_added", label: "Landing Page Added" },
    { key: "social_media_announced", label: "Social Media Announced" },
    { key: "in_category", label: "Listed in Category" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Partner Report Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Select a partner to preview and download their status report.</p>
        </div>
        {partner && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-[#C9A96E] hover:bg-[#A68B4B] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
        )}
      </div>

      {/* Partner Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Partner</label>
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading partners...</p>
        ) : (
          <div className="relative w-full max-w-sm" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropdownOpen(false); }}>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={partner ? partner.partner_name : "Search partners..."}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A96E] bg-white"
            />
            {dropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {funnelPartners
                  .filter(p => p.partner_name?.toLowerCase().includes(search.toLowerCase()))
                  .map(p => (
                    <button
                      key={p.id}
                      tabIndex={0}
                      onMouseDown={() => {
                        setSelectedPartner(p.id);
                        setSearch(p.partner_name);
                        setDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                    >
                      {p.partner_name}
                    </button>
                  ))}
                {funnelPartners.filter(p => p.partner_name?.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">No partners found</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report Preview */}
      {partner && (
        <div
          ref={reportRef}
          id="print-report"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden print:border-0 print:shadow-none"
        >
          {/* Header */}
          <div className="bg-[#0F172A] text-white px-8 py-6 print:px-6 print:py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded bg-gradient-to-br from-[#C9A96E] to-[#A68B4B] flex items-center justify-center text-white font-bold text-xs">100</div>
                  <span className="text-white/60 text-sm">The 100 Collection</span>
                </div>
                <h2 className="text-2xl font-bold">{partner.partner_name}</h2>
                <p className="text-white/50 text-sm mt-0.5">Partner Status Report · {format(new Date(), "MMMM d, yyyy")}</p>
              </div>
              {partner.live_url && (
                <div className="text-right">
                  <p className="text-white/40 text-xs mb-1">Live Page</p>
                  <a href={partner.live_url} target="_blank" rel="noopener noreferrer" className="text-[#C9A96E] text-sm hover:underline break-all max-w-[220px] block">{partner.live_url}</a>
                </div>
              )}
            </div>
          </div>

          <div className="p-8 space-y-8 print:p-6 print:space-y-6">
            {/* Licensing */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Licensing</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Fee Deal</p>
                  <p className="text-sm font-semibold text-gray-900">{partner.licensing_fee_deal || "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Fees Invoiced</p>
                  <p className="text-sm font-semibold text-gray-900">{partner.licensing_fees_invoiced || "—"}</p>
                </div>
              </div>
            </section>

            {/* Onboarding Checklist */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Onboarding Checklist</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                {onboardingFields.map(f => (
                  <div key={f.key} className="flex items-center justify-between py-1 border-b border-gray-50">
                    <span className="text-sm text-gray-700">{f.label}</span>
                    <StatusBadge val={partner[f.key]} />
                  </div>
                ))}
              </div>
            </section>

            {/* Audit Info */}
            {audit && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Trademark / Audit Status</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                  {[
                    { key: "analytics_given", label: "Analytics Given" },
                    { key: "website_access_given", label: "Website Access Given" },
                    { key: "proud_header_added", label: "Proud Header Added" },
                    { key: "vrm_landing_page_added", label: "VRM Landing Page" },
                  ].map(f => (
                    <div key={f.key} className="flex items-center justify-between py-1 border-b border-gray-50">
                      <span className="text-sm text-gray-700">{f.label}</span>
                      <StatusBadge val={audit[f.key]} />
                    </div>
                  ))}
                </div>
                {(audit.homepage_link || audit.lander_link) && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {audit.homepage_link && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Homepage</p>
                        <a href={audit.homepage_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">{audit.homepage_link}</a>
                      </div>
                    )}
                    {audit.lander_link && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">100 Collection Lander</p>
                        <a href={audit.lander_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">{audit.lander_link}</a>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Property Changes */}
            {changes.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Property Changes ({changes.length})</h3>
                <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Date", "Status", "Type", "Property URL", "Invoice Updated"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c, i) => {
                      const d = String(c.date || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1];
                      const display = d ? format(new Date(d), "MM/dd/yyyy") : (c.date || "—");
                      return (
                        <tr key={c.id} className={i % 2 !== 0 ? "bg-gray-50/50" : ""}>
                          <td className="px-3 py-2 whitespace-nowrap">{display}</td>
                          <td className="px-3 py-2">{c.status || "—"}</td>
                          <td className="px-3 py-2">{c.switch_or_addition || "—"}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">
                            {c.property_url ? (
                              <a href={c.property_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{c.property_url}</a>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2"><StatusBadge val={c.invoice_updated} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}

            <p className="text-xs text-gray-300 text-center pt-4 border-t border-gray-100">
              Generated by The 100 Collection OS · {format(new Date(), "MMMM d, yyyy")}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body > * { display: none !important; }
          #print-report { display: block !important; position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
          .print\\:border-0 { border: 0 !important; }
        }
      `}</style>
    </div>
  );
}