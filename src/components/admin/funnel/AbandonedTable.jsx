import React from "react";
import { Mail, Ban, EyeOff, RotateCcw } from "lucide-react";
import { timeAgo, applicantLabel } from "@/lib/applyFunnelAdmin";

const TABS = [
  { id: "all_active", label: "All active" },
  { id: "email_captured", label: "Email captured" },
  { id: "just_page_views", label: "Just page views" },
  { id: "started_form", label: "Started form" },
  { id: "spam", label: "Spam" },
];

function reachOutUrl(row) {
  const name = row.full_name || "there";
  const subject = "Following up on your 100 Collection application";
  const body = `Hi ${name},\n\nWe noticed you started an application to The 100 Collection but didn't finish it. No pressure at all — if you'd like to pick up where you left off, you can return to the application anytime: https://100c-os.base44.app/apply\n\nIf you had a question that stopped you, just reply here and we'll help.\n\nWarmly,\nThe 100 Collection team`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(row.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function AbandonedTable({ rows, tab, onTabChange, showSpam, onToggleSpam, onMarkSpam, onIgnore, onRestore }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Started but not submitted</h3>
        <div className="flex items-center gap-2">
          {tab !== "spam" && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showSpam} onChange={(e) => onToggleSpam(e.target.checked)} className="rounded" />
              Show spam
            </label>
          )}
        </div>
      </div>

      <div className="px-5 pt-3 flex flex-wrap gap-1 border-b border-gray-50">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-[#C9A96E] text-[#0D1B2A]" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">No sessions match this filter.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Path</th>
                <th className="px-5 py-3 font-medium">Last event</th>
                <th className="px-5 py-3 font-medium">Time since</th>
                <th className="px-5 py-3 font-medium">Fields touched</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.session_id} className="hover:bg-gray-50/40">
                  <td className="px-5 py-3">
                    {r.email ? (
                      <span className="text-gray-900">{r.email}{r.is_returning && <span className="ml-1.5 text-[10px] text-[#C9A96E] font-medium">↻ returning</span>}</span>
                    ) : (
                      <span className="text-gray-300 italic">not captured</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{r.full_name || "—"}</td>
                  <td className="px-5 py-3 text-gray-700">{r.company_name || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{applicantLabel(r.applicant_type)}</td>
                  <td className="px-5 py-3 text-gray-500">{r.last_event_type?.replace(/_/g, " ") || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{timeAgo(r.last_event_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {r.fields_touched.slice(0, 4).map((f) => (
                        <span key={f} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{f}</span>
                      ))}
                      {r.fields_touched.length > 4 && <span className="text-[10px] text-gray-400">+{r.fields_touched.length - 4}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.email && (
                        <a
                          href={reachOutUrl(r)}
                          target="_blank"
                          rel="noreferrer"
                          title="Reach out via Gmail"
                          className="p-1.5 rounded-md text-[#C9A96E] hover:bg-[#C9A96E]/10 transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                        </a>
                      )}
                      {tab === "spam" ? (
                        <button
                          onClick={() => onRestore(r.session_id)}
                          title="Restore (un-spam)"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => onMarkSpam(r.session_id)}
                            title="Mark as spam"
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onIgnore(r.session_id)}
                            title="Ignore (hide)"
                            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
                          >
                            <EyeOff className="w-4 h-4" />
                          </button>
                        </>
                      )}
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
}