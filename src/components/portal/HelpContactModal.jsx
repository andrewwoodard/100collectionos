import React, { useState } from "react";
import { X, Mail, HelpCircle, ExternalLink } from "lucide-react";

const FALLBACK_EMAIL = "support@theonehundredcollection.com";

const QUICK_SUBJECTS = [
  "Billing question",
  "Property question",
  "Account help",
  "Other",
];

export default function HelpContactModal({ onClose, partner }) {
  const [selectedSubject, setSelectedSubject] = useState("");

  const ownerName = partner?.assigned_internal_owner;
  const partnerName = partner?.partner_name;

  // Try to parse "Name <email>" format or just use as email
  let ownerEmail = null;
  let ownerDisplayName = ownerName;
  if (ownerName && ownerName.includes("@")) {
    // It's an email address
    ownerEmail = ownerName;
    ownerDisplayName = ownerName;
  } else if (ownerName) {
    // It's a name — we don't have their email separately, fall back
    ownerEmail = null;
  }

  const contactEmail = ownerEmail || FALLBACK_EMAIL;
  const contactDisplay = ownerDisplayName || "The 100 Collection Team";

  const buildMailto = (subject) => {
    const sub = subject
      ? `${subject} from ${partnerName || "Partner"}`
      : `Question from ${partnerName || "Partner"}`;
    return `mailto:${contactEmail}?subject=${encodeURIComponent(sub)}`;
  };

  const handleSendEmail = () => {
    window.location.href = buildMailto(selectedSubject);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#C9A96E]/10 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-[#C9A96E]" />
            </div>
            <h2 className="text-base font-semibold text-[#0D1B2A]">Contact The 100 Collection Team</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Intro */}
          <p className="text-sm text-slate-600 leading-relaxed">
            Have a question? Your dedicated contact is happy to help.
          </p>

          {/* Contact info */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            {ownerName && !ownerEmail ? (
              <div>
                <p className="text-sm font-medium text-[#0D1B2A]">Reach out to {ownerDisplayName}</p>
                <p className="text-xs text-slate-400 mt-0.5">Contact via the email button below</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-[#0D1B2A]">
                  {ownerDisplayName !== FALLBACK_EMAIL ? `Reach out to ${ownerDisplayName}` : "Reach out to our team"}
                </p>
                <p className="text-xs text-[#C9A96E] mt-0.5 font-mono">{contactEmail}</p>
              </div>
            )}
          </div>

          {/* Quick-action subject chips */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">What's your question about?</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_SUBJECTS.map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedSubject(selectedSubject === s ? "" : s)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    selectedSubject === s
                      ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Send button */}
          <button
            onClick={handleSendEmail}
            className="w-full flex items-center justify-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-5 py-3 rounded-xl hover:bg-[#1a2e45] transition-colors"
          >
            <Mail className="w-4 h-4" />
            Send Email{selectedSubject ? ` — ${selectedSubject}` : ""}
          </button>

          {/* FAQ stub */}
          <div className="text-center pt-1">
            <a
              href="/faq"
              onClick={(e) => { e.preventDefault(); alert("FAQ coming soon!"); }}
              className="inline-flex items-center gap-1 text-xs text-[#C9A96E] hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Frequently asked questions
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}