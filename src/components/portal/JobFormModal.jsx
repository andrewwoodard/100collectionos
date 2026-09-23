import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

const DEFAULTS = {
  title: "", location: "", job_type: "full_time", department: "operations",
  description: "", requirements: "", compensation: "", application_email: "",
  application_url: "", status: "active", closes_at: "",
};

export default function JobFormModal({ job, partnerId, partnerName, onClose }) {
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (job) setForm({ ...DEFAULTS, ...job });
    else setForm(DEFAULTS);
  }, [job]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, partner_id: partnerId, partner_name: partnerName };
    if (job?.id) {
      await base44.entities.JobPosting.update(job.id, data);
    } else {
      await base44.entities.JobPosting.create(data);
    }
    qc.invalidateQueries({ queryKey: ["partner-jobs"] });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-medium text-[#0D1B2A]">{job ? "Edit Job Posting" : "New Job Posting"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Logo note */}
          <div className="flex items-center gap-2.5 bg-[#FBF6EF] border border-[#E8DDD0] rounded-lg px-4 py-3">
            <div className="w-5 h-5 rounded-full bg-[#C9A96E]/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[#C9A96E] text-[10px] font-bold">i</span>
            </div>
            <p className="text-xs text-[#8B7355] leading-relaxed">
              Your company logo (from your <strong>Partner Profile</strong>) will appear automatically on the public listing — no upload needed here.
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Job Title *</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
              value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Property Manager, Housekeeping Supervisor"
            />
          </div>

          {/* Location + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Location</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.location} onChange={e => set("location", e.target.value)}
                placeholder="e.g. Myrtle Beach, SC / Remote"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Job Type</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.job_type} onChange={e => set("job_type", e.target.value)}
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="seasonal">Seasonal</option>
                <option value="internship">Internship</option>
              </select>
            </div>
          </div>

          {/* Department + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Department</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.department} onChange={e => set("department", e.target.value)}
              >
                <option value="operations">Operations</option>
                <option value="guest_services">Guest Services</option>
                <option value="housekeeping">Housekeeping</option>
                <option value="maintenance">Maintenance</option>
                <option value="marketing">Marketing</option>
                <option value="management">Management</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Status</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.status} onChange={e => set("status", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Compensation + Closes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Compensation *</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.compensation} onChange={e => set("compensation", e.target.value)}
                placeholder="e.g. $45,000 – $55,000/yr"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Application Deadline</label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.closes_at} onChange={e => set("closes_at", e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Job Description</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40 h-28 resize-none"
              value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="Describe the role, responsibilities, and what a typical day looks like..."
            />
          </div>

          {/* Requirements */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Requirements</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40 h-20 resize-none"
              value={form.requirements} onChange={e => set("requirements", e.target.value)}
              placeholder="Skills, experience, certifications required..."
            />
          </div>

          {/* Application info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Application Email</label>
              <input
                type="email"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.application_email} onChange={e => set("application_email", e.target.value)}
                placeholder="jobs@yourcompany.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">Application URL</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40"
                value={form.application_url} onChange={e => set("application_url", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title || !form.compensation}
            className="px-5 py-2 bg-[#0D1B2A] text-white text-sm rounded-lg hover:bg-[#1a2e45] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : job ? "Save Changes" : "Post Job"}
          </button>
        </div>
      </div>
    </div>
  );
}