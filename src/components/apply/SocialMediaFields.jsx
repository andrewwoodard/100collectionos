import React from "react";
import { Plus, X } from "lucide-react";

const PLATFORMS = [
  "Instagram", "TikTok", "Facebook", "LinkedIn", "YouTube",
  "X (Twitter)", "Pinterest", "Threads", "Other",
];

const PLACEHOLDERS = {
  Instagram: "instagram.com/yourbrand",
  TikTok: "tiktok.com/@yourbrand",
  Facebook: "facebook.com/yourbrand",
  LinkedIn: "linkedin.com/company/yourbrand",
  YouTube: "youtube.com/@yourbrand",
  "X (Twitter)": "x.com/yourbrand",
  Pinterest: "pinterest.com/yourbrand",
  Threads: "threads.net/@yourbrand",
  Other: "yourbrand.com",
};

const INPUT_CLS =
  "w-full px-4 py-3 bg-white border border-[#D9C8B4] rounded-lg text-[#1a1a1a] text-sm placeholder-[#B0A090] focus:outline-none focus:border-[#C9A96E] focus:ring-2 focus:ring-[#C9A96E]/20 transition-all";
const LABEL_CLS =
  "text-[11px] font-semibold text-[#8B7355] uppercase tracking-widest mb-1.5 block";

const EMPTY_ROW = { platform: "", platform_other: "", url: "" };

export default function SocialMediaFields({ label, links, onChange }) {
  const rows =
    Array.isArray(links) && links.length > 0 ? links : [{ ...EMPTY_ROW }];

  const updateRow = (idx, field, val) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  };
  const addRow = () => onChange([...rows, { ...EMPTY_ROW }]);
  const removeRow = (idx) => {
    if (rows.length === 1) {
      onChange([{ ...EMPTY_ROW }]);
    } else {
      onChange(rows.filter((_, i) => i !== idx));
    }
  };

  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-wrap gap-2 items-center">
            <select
              value={row.platform}
              onChange={(e) => updateRow(idx, "platform", e.target.value)}
              className={INPUT_CLS + " w-full sm:w-40 flex-shrink-0"}
            >
              <option value="">Platform</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {row.platform === "Other" && (
              <input
                value={row.platform_other || ""}
                onChange={(e) => updateRow(idx, "platform_other", e.target.value)}
                className={INPUT_CLS + " w-full sm:w-36 flex-shrink-0"}
                placeholder="Platform name"
              />
            )}
            <div className="flex gap-2 w-full sm:flex-1 min-w-0">
              <input
                value={row.url || ""}
                onChange={(e) => updateRow(idx, "url", e.target.value)}
                className={INPUT_CLS + " flex-1 min-w-0"}
                placeholder={PLACEHOLDERS[row.platform] || "yourbrand.com"}
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center border border-[#D9C8B4] rounded-lg text-[#8B7355] hover:bg-[#FBF6EF] hover:border-[#C9A96E] hover:text-[#C9A96E] transition-all"
                aria-label="Remove platform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#C9A96E] hover:text-[#b8935a] font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add another platform
      </button>
      <p className="text-[11px] text-[#B0A090] mt-1.5">If yes, please add link</p>
    </div>
  );
}