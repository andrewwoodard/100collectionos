import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X } from "lucide-react";

const MENTIONABLE_ROLES = [
  "admin",
  "super_admin",
  "projects",
  "operations",
  "onboarding",
  "finance",
  "marketing",
];

export function mentionLabel(u) {
  return u?.full_name || u?.name || u?.email || "Unnamed";
}

function mentionInitial(u) {
  return (mentionLabel(u)[0] || "?").toUpperCase();
}

export default function MentionInput({
  value,
  onChange,
  mentionedUserIds = [],
  onMentionsChange,
  placeholder = "Add a note… type @ to mention someone",
  users: usersProp,
  className = "",
  rows = 2,
}) {
  const textareaRef = useRef(null);
  const [mention, setMention] = useState(null); // { start, query } or null

  const { data: fetchedUsers = [] } = useQuery({
    queryKey: ["mentionable-users"],
    queryFn: async () => {
      const all = await base44.entities.User.list("-created_date", 100);
      return all.filter((u) => MENTIONABLE_ROLES.includes(u.role));
    },
    enabled: !usersProp,
  });
  const users = usersProp || fetchedUsers;

  const detectMention = (text, cursorPos) => {
    // Walk back from the cursor to the nearest "@" that starts a word.
    let i = cursorPos - 1;
    while (i >= 0 && text[i] !== "\n") {
      if (text[i] === "@") {
        const before = i === 0 ? "" : text[i - 1];
        if (i === 0 || /\s/.test(before)) {
          return { start: i, query: text.slice(i + 1, cursorPos) };
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
    setMention(detectMention(newVal, cursorPos));
  };

  const insertMention = (user) => {
    if (!mention) return;
    const current = value || "";
    const before = current.slice(0, mention.start);
    const after = current.slice(mention.start + 1 + mention.query.length);
    const insertText = `@${mentionLabel(user)} `;
    const newVal = before + insertText + after;
    onChange(newVal);
    if (!mentionedUserIds.includes(user.id)) {
      onMentionsChange([...mentionedUserIds, user.id]);
    }
    setMention(null);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + insertText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const removeMention = (userId) => {
    onMentionsChange(mentionedUserIds.filter((id) => id !== userId));
  };

  const filteredUsers = mention
    ? users
        .filter((u) => {
          const q = mention.query.trim().toLowerCase();
          if (!q) return true;
          const name = mentionLabel(u).toLowerCase();
          const email = String(u.email || "").toLowerCase();
          return name.includes(q) || email.includes(q);
        })
        .filter((u) => !mentionedUserIds.includes(u.id))
    : [];

  const taggedUsers = mentionedUserIds
    .map((uid) => users.find((x) => x.id === uid))
    .filter(Boolean);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        className={
          className ||
          "w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 resize-none"
        }
      />

      {mention && filteredUsers.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Tag a teammate
          </div>
          {filteredUsers.slice(0, 8).map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(u)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full bg-[#0D1B2A] text-[#C9A96E] text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                {mentionInitial(u)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#0D1B2A] truncate">{mentionLabel(u)}</div>
                {u.email && <div className="text-[10px] text-slate-400 truncate">{u.email}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {taggedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {taggedUsers.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#C9A96E]/15 text-[#0D1B2A] rounded-full border border-[#C9A96E]/30"
            >
              @{mentionLabel(u)}
              <button
                type="button"
                onClick={() => removeMention(u.id)}
                className="text-slate-400 hover:text-red-500"
                aria-label={`Remove ${mentionLabel(u)}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
