import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X } from "lucide-react";

const MENTIONABLE_ROLES = ["admin", "operations", "onboarding", "finance", "marketing"];

export default function MentionInput({
  value,
  onChange,
  mentionedUserIds = [],
  onMentionsChange,
  placeholder = "Add a note… type @ to mention someone",
}) {
  const textareaRef = useRef(null);
  const [mention, setMention] = useState(null); // { start, query } or null

  const { data: users = [] } = useQuery({
    queryKey: ["mentionable-users"],
    queryFn: async () => {
      const all = await base44.entities.User.list("-created_date", 100);
      return all.filter(u => MENTIONABLE_ROLES.includes(u.role));
    },
  });

  const detectMention = (text, cursorPos) => {
    // Look backwards from cursor for @ preceded by start-of-string or whitespace
    let i = cursorPos - 1;
    while (i >= 0 && text[i] !== " " && text[i] !== "\n" && text[i] !== "\t") {
      if (text[i] === "@") {
        const atStart = i;
        const before = atStart === 0 ? "" : text[atStart - 1];
        if (atStart === 0 || /\s/.test(before)) {
          return { start: atStart, query: text.slice(atStart + 1, cursorPos) };
        }
        return null;
      }
      i--;
    }
    return null;
  };

  const handleChange = (e) => {
    const newVal = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newVal);
    const detected = detectMention(newVal, cursorPos);
    setMention(detected);
  };

  const insertMention = (user) => {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.query.length);
    const insertText = `@${user.full_name || user.email} `;
    const newVal = before + insertText + after;
    onChange(newVal);
    onMentionsChange([...mentionedUserIds, user.id]);
    setMention(null);

    // Restore focus and cursor
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + insertText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const removeMention = (userId, idx) => {
    onMentionsChange(mentionedUserIds.filter(id => id !== userId));
  };

  const filteredUsers = mention
    ? users.filter(u => {
        const q = mention.query.toLowerCase();
        const name = (u.full_name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      }).filter(u => !mentionedUserIds.includes(u.id))
    : [];

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 resize-none"
      />

      {/* Mention typeahead */}
      {mention && filteredUsers.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
          {filteredUsers.slice(0, 8).map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => insertMention(u)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full bg-[#0D1B2A] text-[#C9A96E] text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                {(u.full_name || u.email || "?")[0]}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#0D1B2A] truncate">{u.full_name || "Unnamed"}</div>
                <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Mention chips */}
      {mentionedUserIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {mentionedUserIds.map(uid => {
            const u = users.find(x => x.id === uid);
            if (!u) return null;
            return (
              <span key={uid} className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#C9A96E]/15 text-[#0D1B2A] rounded-full border border-[#C9A96E]/30">
                @{u.full_name || u.email}
                <button onClick={() => removeMention(uid)} className="text-slate-400 hover:text-red-500">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}