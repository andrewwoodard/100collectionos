import React, { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

const VARIABLE_GROUPS = [
  {
    group: "partner", label: "Partner", variables: [
      { token: "partner.partner_name", label: "Partner name" },
      { token: "partner.primary_contact_name", label: "Primary contact" },
      { token: "partner.primary_contact_email", label: "Contact email" },
      { token: "partner.market", label: "Market" },
    ],
  },
  {
    group: "property", label: "Property", variables: [
      { token: "property.property_name", label: "Property name" },
      { token: "property.location", label: "Location" },
      { token: "property.bedrooms", label: "Bedrooms" },
      { token: "property.listing_url", label: "Listing URL" },
      { token: "property.first_photo", label: "First photo" },
    ],
  },
  {
    group: "submission", label: "Submission", variables: [
      { token: "submission.partner_facing_message", label: "Partner message" },
      { token: "submission.revision_message", label: "Revision message" },
    ],
  },
  {
    group: "invoice", label: "Invoice", variables: [
      { token: "invoice.amount", label: "Amount" },
      { token: "invoice.license_number", label: "License number" },
      { token: "invoice.renewal_date", label: "Renewal date" },
    ],
  },
  {
    group: "application", label: "Application", variables: [
      { token: "application.first_name", label: "First name" },
      { token: "application.full_name", label: "Full name" },
      { token: "application.email", label: "Email" },
    ],
  },
  {
    group: "homeowner", label: "Homeowner", variables: [
      { token: "homeowner.first_name", label: "First name" },
      { token: "homeowner.properties_count", label: "Properties count" },
      { token: "homeowner.location", label: "Location" },
    ],
  },
  {
    group: "candidate", label: "Candidate", variables: [
      { token: "candidate.name", label: "Name" },
      { token: "candidate.job_title", label: "Job title" },
    ],
  },
  {
    group: "teammate", label: "Teammate", variables: [
      { token: "teammate.name", label: "Name" },
      { token: "teammate.email", label: "Email" },
      { token: "teammate.role", label: "Role" },
    ],
  },
  {
    group: "inviter", label: "Inviter", variables: [
      { token: "inviter.name", label: "Inviter name" },
      { token: "reviewed_by.name", label: "Reviewer name" },
    ],
  },
];

export default function VariableHelper() {
  const [expanded, setExpanded] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [copied, setCopied] = useState("");

  const copyToken = async (token) => {
    try {
      await navigator.clipboard.writeText(`{{${token}}}`);
      setCopied(token);
      setTimeout(() => setCopied(""), 1500);
    } catch (e) { /* ignore */ }
  };

  return (
    <div className="mb-3 border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-[11px] font-semibold text-gray-600">Available Variables</span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {expanded && (
        <div className="p-2 max-h-48 overflow-y-auto">
          {VARIABLE_GROUPS.map(g => (
            <div key={g.group} className="mb-2">
              <button
                onClick={() => setOpenGroups({ ...openGroups, [g.group]: !openGroups[g.group] })}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5"
              >
                {openGroups[g.group] ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                {g.label}
              </button>
              {openGroups[g.group] && (
                <div className="pl-3 space-y-0.5">
                  {g.variables.map(v => (
                    <button
                      key={v.token}
                      onClick={() => copyToken(v.token)}
                      className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-amber-600 w-full text-left group"
                    >
                      {copied === v.token ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />}
                      <code className="bg-gray-50 px-1 py-0.5 rounded text-amber-700">{`{{${v.token}}}`}</code>
                      <span>{v.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}