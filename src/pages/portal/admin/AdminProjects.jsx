import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/shared/EmptyState";
import MentionInput, { mentionLabel } from "@/components/admin/MentionInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Archive, ArchiveRestore, Check, CheckCircle2, ChevronDown, ChevronRight,
  Columns3, FileSpreadsheet, FileText, FolderKanban, Image as ImageIcon,
  LayoutGrid, List, ListTodo, Loader2, MessageSquare, Paperclip, Plus,
  Search, Send, Trash2, UserRound, X,
} from "lucide-react";

const STATUS_GROUPS = [
  { value: "not_started", label: "Not Started", color: "#C4C4C4", soft: "bg-slate-100 text-slate-700", cell: "bg-slate-400" },
  { value: "in_progress", label: "Working on it", color: "#FDAB3D", soft: "bg-amber-50 text-amber-800", cell: "bg-amber-400" },
  { value: "ongoing", label: "Ongoing", color: "#579BFC", soft: "bg-sky-50 text-sky-800", cell: "bg-sky-500" },
  { value: "blocked", label: "Stuck", color: "#E2445C", soft: "bg-red-50 text-red-700", cell: "bg-red-500" },
  { value: "complete", label: "Done", color: "#00C875", soft: "bg-emerald-50 text-emerald-800", cell: "bg-emerald-500" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low", cell: "bg-slate-300 text-slate-800" },
  { value: "medium", label: "Medium", cell: "bg-sky-400 text-white" },
  { value: "high", label: "High", cell: "bg-orange-400 text-white" },
  { value: "urgent", label: "Critical", cell: "bg-rose-500 text-white" },
];

const ATTACH_ACCEPT =
  "image/*,.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx";

function statusMeta(status) {
  return STATUS_GROUPS.find((s) => s.value === status) || STATUS_GROUPS[0];
}

function priorityMeta(priority) {
  return PRIORITY_OPTIONS.find((p) => p.value === priority) || PRIORITY_OPTIONS[1];
}

function fmtDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtShort(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(dateStr);
}

function newId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function adminLabel(u) {
  return u?.full_name || u?.name || u?.email || "Admin";
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function subitemProgress(project) {
  const items = Array.isArray(project?.subitems) ? project.subitems : [];
  if (!items.length) return { done: 0, total: 0, pct: 0 };
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

function projectAssignees(project) {
  if (Array.isArray(project?.assignees) && project.assignees.length) {
    return project.assignees.filter((a) => a?.user_id || a?.email);
  }
  if (project?.owner_user_id || project?.owner_email) {
    return [{
      user_id: project.owner_user_id || "",
      name: project.owner_name || "",
      email: project.owner_email || "",
    }];
  }
  return [];
}

function assigneePatch(assignees) {
  const list = Array.isArray(assignees) ? assignees : [];
  const primary = list[0] || null;
  return {
    assignees: list,
    owner_user_id: primary?.user_id || null,
    owner_name: primary?.name || null,
    owner_email: primary?.email || null,
  };
}

function isAssignedToUser(project, user) {
  if (!user) return false;
  const uid = String(user.id || "");
  const email = String(user.email || "").toLowerCase();
  const people = projectAssignees(project);
  if (people.some((a) => (a.user_id && a.user_id === uid) || (a.email && a.email.toLowerCase() === email))) {
    return true;
  }
  const subs = Array.isArray(project?.subitems) ? project.subitems : [];
  return subs.some((s) =>
    Array.isArray(s.assignees) &&
    s.assignees.some((a) => (a.user_id && a.user_id === uid) || (a.email && a.email.toLowerCase() === email))
  );
}

function fileIcon(contentType = "", name = "") {
  const t = String(contentType).toLowerCase();
  const n = String(name).toLowerCase();
  if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) return ImageIcon;
  if (t.includes("sheet") || t.includes("excel") || /\.(xlsx?|csv)$/.test(n)) return FileSpreadsheet;
  return FileText;
}

const ATTACH_EXT = /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|csv|txt|pptx?)$/i;

async function uploadProjectFile(file) {
  const name = file?.name || "attachment";
  if (!ATTACH_EXT.test(name) && !String(file?.type || "").startsWith("image/")) {
    throw new Error("Attach a photo, Word doc, spreadsheet, PDF, or text file.");
  }
  const res = await fetch("/api/blob/upload", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Filename": name,
      "X-Blob-Folder": "projects",
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return {
    id: newId("att"),
    url: data.url,
    name: file.name || "attachment",
    content_type: file.type || "application/octet-stream",
    size: file.size || 0,
    created_at: new Date().toISOString(),
  };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function noteTagNames(note, staffUsers = []) {
  const ids = Array.isArray(note?.mentioned_user_ids) ? note.mentioned_user_ids : [];
  const fromUsers = ids
    .map((id) => staffUsers.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => mentionLabel(u));
  const stored = Array.isArray(note?.mentioned_names) ? note.mentioned_names : [];
  return [...new Set([...fromUsers, ...stored])].filter(Boolean);
}

function linkifyText(text, names = []) {
  const raw = String(text || "");
  if (!raw) return null;
  const parts = [];
  const nameAlt = [...names]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const re = new RegExp(
    `(${nameAlt ? `@(?:${nameAlt})(?![A-Za-z0-9_])|` : ""}(?:https?:\\/\\/|www\\.)[^\\s<]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}|@[A-Za-z0-9._-]+)`,
    "g"
  );
  let last = 0;
  let match;
  let key = 0;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > last) {
      parts.push(<span key={`t${key++}`}>{raw.slice(last, match.index)}</span>);
    }
    const token = match[0];
    if (/^(https?:\/\/|www\.)/i.test(token)) {
      const hrefRaw = token.replace(/[),.;!?]+$/g, "");
      const trailing = token.slice(hrefRaw.length);
      const href = /^www\./i.test(hrefRaw) ? `https://${hrefRaw}` : hrefRaw;
      parts.push(
        <a
          key={`l${key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-700 underline underline-offset-2 break-all hover:text-sky-900"
          onClick={(e) => e.stopPropagation()}
        >
          {hrefRaw}
        </a>
      );
      if (trailing) parts.push(<span key={`tr${key++}`}>{trailing}</span>);
    } else if (token.startsWith("@")) {
      parts.push(
        <span key={`m${key++}`} className="font-semibold text-[#8B6A2E]">
          {token}
        </span>
      );
    } else {
      parts.push(<span key={`e${key++}`}>{token}</span>);
    }
    last = match.index + token.length;
  }
  if (last < raw.length) parts.push(<span key={`t${key++}`}>{raw.slice(last)}</span>);
  return parts;
}

function CellMenu({ open, onClose, children, align = "left" }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={`absolute z-30 mt-1 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl py-1 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </>
  );
}

function StatusCell({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const meta = statusMeta(value);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`w-full h-9 text-xs font-semibold text-white ${meta.cell} hover:brightness-95 disabled:opacity-60`}
      >
        {meta.label}
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)}>
        {STATUS_GROUPS.map((s) => (
          <button
            key={s.value}
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
            onClick={(e) => {
              e.stopPropagation();
              onChange(s.value);
              setOpen(false);
            }}
          >
            <span className={`inline-block w-3 h-3 rounded-sm ${s.cell}`} />
            {s.label}
          </button>
        ))}
      </CellMenu>
    </div>
  );
}

function PriorityCell({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const meta = priorityMeta(value);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`w-full h-9 text-xs font-semibold ${meta.cell} hover:brightness-95 disabled:opacity-60`}
      >
        {meta.label}
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)}>
        {PRIORITY_OPTIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
            onClick={(e) => {
              e.stopPropagation();
              onChange(p.value);
              setOpen(false);
            }}
          >
            <span className={`inline-block w-3 h-3 rounded-sm ${p.cell.split(" ")[0]}`} />
            {p.label}
          </button>
        ))}
      </CellMenu>
    </div>
  );
}

function AssigneesAvatars({ assignees, max = 3 }) {
  const list = Array.isArray(assignees) ? assignees : [];
  if (!list.length) return <span className="text-xs text-slate-300">+</span>;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((a) => (
        <span
          key={a.user_id || a.email}
          title={a.name || a.email}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0D1B2A] text-white text-[10px] font-semibold ring-2 ring-white"
        >
          {initials(a.name || a.email)}
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-[10px] font-semibold ring-2 ring-white">
          +{extra}
        </span>
      )}
    </div>
  );
}

function AssigneesCell({ assignees, staffUsers, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(assignees) ? assignees : [];
  const selectedIds = new Set(selected.map((a) => a.user_id).filter(Boolean));

  const toggle = (user) => {
    const exists = selectedIds.has(user.id);
    const next = exists
      ? selected.filter((a) => a.user_id !== user.id)
      : [
          ...selected,
          { user_id: user.id, name: adminLabel(user), email: user.email || "" },
        ];
    onChange(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-full h-9 px-2 flex items-center justify-center hover:bg-slate-50 disabled:opacity-60"
        title={selected.map((a) => a.name || a.email).join(", ") || "Tag people"}
      >
        <AssigneesAvatars assignees={selected} />
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)}>
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Tag people
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          >
            Clear all
          </button>
        )}
        {staffUsers.map((u) => {
          const on = selectedIds.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
              onClick={(e) => {
                e.stopPropagation();
                toggle(u);
              }}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                on ? "bg-[#0D1B2A] border-[#0D1B2A] text-white" : "border-slate-300"
              }`}>
                {on && <Check className="w-3 h-3" />}
              </span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0D1B2A] text-white text-[10px] font-semibold">
                {initials(adminLabel(u))}
              </span>
              <span className="truncate">{adminLabel(u)}</span>
            </button>
          );
        })}
      </CellMenu>
    </div>
  );
}

function AssigneesDropdown({ assignees, staffUsers, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(assignees) ? assignees : [];
  const selectedIds = new Set(selected.map((a) => a.user_id).filter(Boolean));

  const toggle = (user) => {
    onChange(
      selectedIds.has(user.id)
        ? selected.filter((a) => a.user_id !== user.id)
        : [...selected, { user_id: user.id, name: adminLabel(user), email: user.email || "" }]
    );
  };

  const summary = selected.length
    ? selected.map((a) => a.name || a.email).filter(Boolean).join(", ")
    : "Tag people";

  return (
    <div className="relative inline-block max-w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 max-w-[260px] h-7 px-2.5 rounded-md border text-[11px] bg-white hover:border-slate-300 disabled:opacity-60 ${
          selected.length ? "border-slate-200 text-[#0D1B2A]" : "border-dashed border-slate-300 text-slate-500"
        }`}
        title={summary}
      >
        <UserRound className="w-3 h-3 shrink-0 text-slate-400" />
        <span className="truncate">{summary}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-slate-400" />
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)}>
        {selected.length > 0 && (
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
        )}
        {staffUsers.map((u) => {
          const on = selectedIds.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
              onClick={() => toggle(u)}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  on ? "bg-[#0D1B2A] border-[#0D1B2A] text-white" : "border-slate-300"
                }`}
              >
                {on && <Check className="w-3 h-3" />}
              </span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0D1B2A] text-white text-[10px] font-semibold shrink-0">
                {initials(adminLabel(u))}
              </span>
              <span className="truncate">{adminLabel(u)}</span>
            </button>
          );
        })}
        {!staffUsers.length && <p className="px-3 py-2 text-xs text-slate-400">No users to tag</p>}
      </CellMenu>
    </div>
  );
}

function AssigneesChecklist({ assignees, staffUsers, onChange, disabled, label = "Tag people" }) {
  const selected = Array.isArray(assignees) ? assignees : [];
  const selectedIds = new Set(selected.map((a) => a.user_id).filter(Boolean));

  const toggle = (user) => {
    if (disabled) return;
    const exists = selectedIds.has(user.id);
    onChange(
      exists
        ? selected.filter((a) => a.user_id !== user.id)
        : [...selected, { user_id: user.id, name: adminLabel(user), email: user.email || "" }]
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-[10px] text-slate-400">Select one or more</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {staffUsers.map((u) => {
          const on = selectedIds.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(u)}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                on
                  ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold ${
                on ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
              }`}>
                {initials(adminLabel(u))}
              </span>
              {adminLabel(u)}
            </button>
          );
        })}
        {!staffUsers.length && (
          <p className="text-xs text-slate-400">No admin or projects users to tag.</p>
        )}
      </div>
    </div>
  );
}

function DateCell({ value, onChange, overdue, disabled }) {
  return (
    <div
      className={`h-9 flex items-center justify-center ${overdue ? "bg-red-50" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="date"
        disabled={disabled}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`w-full h-full text-xs text-center bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-[#C9A96E]/40 px-1 ${
          overdue ? "text-red-600 font-medium" : value ? "text-slate-700" : "text-slate-300"
        }`}
      />
    </div>
  );
}

function ProgressCell({ project }) {
  const { done, total, pct } = subitemProgress(project);
  if (!total) {
    return <div className="h-9 flex items-center justify-center text-[11px] text-slate-300">—</div>;
  }
  return (
    <div className="h-9 px-2 flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500 tabular-nums w-10 text-right">{done}/{total}</span>
    </div>
  );
}

function AttachmentsBlock({
  attachments,
  onChange,
  disabled,
  title = "Attachments",
  compact = false,
  buttonOnly = false,
}) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const list = Array.isArray(attachments) ? attachments : [];

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(await uploadProjectFile(file));
      }
      onChange([...list, ...uploaded]);
    } catch (err) {
      toast({ title: err?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const remove = (id) => onChange(list.filter((a) => a.id !== id));

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {!compact && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-left hover:border-[#C9A96E] hover:bg-white disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm text-[#0D1B2A]">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4 text-[#C9A96E]" />}
              Attach photos, Word docs, or spreadsheets
            </span>
            <span className="block text-[11px] text-slate-400 mt-1">PNG, JPG, PDF, DOC, DOCX, XLS, XLSX, CSV</span>
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ATTACH_ACCEPT}
        multiple
        className="hidden"
        onChange={onPick}
      />
      {compact && (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-[#0D1B2A] disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
          {buttonOnly ? "Attach" : "Photo, doc, or spreadsheet"}
        </button>
      )}
      {!buttonOnly && list.length > 0 && (
        <div className="space-y-1">
          {list.map((att) => {
            const Icon = fileIcon(att.content_type, att.name);
            const isImage = String(att.content_type || "").startsWith("image/");
            return (
              <div
                key={att.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1.5"
              >
                {isImage ? (
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img src={att.url} alt="" className="w-8 h-8 rounded object-cover" />
                  </a>
                ) : (
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-xs text-sky-700 hover:underline truncate"
                >
                  {att.name || "Attachment"}
                </a>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(att.id)}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickAddRow({ status, onAdd, busy }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    await onAdd(trimmed, status);
    setName("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-4 py-2.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50/80 flex items-center gap-2 border-t border-slate-100"
      >
        <Plus className="w-3.5 h-3.5" /> Add project
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50/50">
      <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="flex-1 text-sm bg-transparent border-0 focus:outline-none"
        disabled={busy}
      />
      <Button type="submit" size="sm" disabled={busy || !name.trim()} className="h-7 text-xs">
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
      </Button>
      <button type="button" onClick={() => { setOpen(false); setName(""); }} className="text-slate-400 hover:text-slate-600">
        <X className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}

function ProjectBoardRow({
  project,
  staffUsers,
  busyId,
  expanded,
  onToggleExpand,
  onOpenDetail,
  onPatch,
}) {
  const busy = busyId === project.id;
  const overdue =
    project.due_date &&
    project.status !== "complete" &&
    new Date(project.due_date) < new Date(new Date().toDateString());
  const noteCount = Array.isArray(project.notes) ? project.notes.length : 0;
  const subitems = Array.isArray(project.subitems) ? project.subitems : [];
  const assignees = projectAssignees(project);
  const attachCount = Array.isArray(project.attachments) ? project.attachments.length : 0;

  return (
    <>
      <tr className="group border-b border-slate-100 hover:bg-slate-50/40">
        <td className="w-10 px-2">
          <button
            type="button"
            onClick={() => onToggleExpand(project.id)}
            className="p-1 text-slate-300 hover:text-slate-600 relative"
            title={`${subitems.length} subtask${subitems.length === 1 ? "" : "s"}`}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="min-w-[220px] px-2 py-1.5">
          <button type="button" onClick={() => onOpenDetail(project.id)} className="text-left w-full">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm font-medium text-[#0D1B2A] group-hover:text-[#8B6A2E] truncate">
                {project.name}
              </div>
              <span
                className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  subitems.length > 0 ? "text-slate-600 bg-slate-100" : "text-slate-300 bg-transparent"
                }`}
                title={`${subitemProgress(project).done} of ${subitems.length} subtask${subitems.length === 1 ? "" : "s"} done`}
              >
                <ListTodo className="w-3 h-3" />
                {subitemProgress(project).done}/{subitems.length}
              </span>
              {attachCount > 0 && (
                <span className="inline-flex items-center gap-0.5 shrink-0 text-[10px] text-slate-400">
                  <Paperclip className="w-3 h-3" />
                  {attachCount}
                </span>
              )}
            </div>
            {project.partner_name && (
              <div className="text-[11px] text-slate-400 truncate">{project.partner_name}</div>
            )}
          </button>
        </td>
        <td className="w-[140px] p-0">
          <StatusCell
            value={project.status}
            disabled={busy}
            onChange={(status) =>
              onPatch(project.id, {
                status,
                completed_at: status === "complete" ? new Date().toISOString() : null,
              })
            }
          />
        </td>
        <td className="w-[110px] p-0">
          <PriorityCell
            value={project.priority || "medium"}
            disabled={busy}
            onChange={(priority) => onPatch(project.id, { priority })}
          />
        </td>
        <td className="w-[96px] p-0">
          <AssigneesCell
            assignees={assignees}
            staffUsers={staffUsers}
            disabled={busy}
            onChange={(next) => onPatch(project.id, assigneePatch(next))}
          />
        </td>
        <td className="w-[120px] p-0">
          <DateCell
            value={project.start_date}
            disabled={busy}
            onChange={(start_date) => onPatch(project.id, { start_date })}
          />
        </td>
        <td className="w-[120px] p-0">
          <DateCell
            value={project.due_date}
            overdue={overdue}
            disabled={busy}
            onChange={(due_date) => onPatch(project.id, { due_date })}
          />
        </td>
        <td className="w-[110px] p-0">
          <ProgressCell project={project} />
        </td>
        <td className="w-[88px] text-center">
          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
            <AttachmentsBlock
              compact
              buttonOnly
              attachments={Array.isArray(project.attachments) ? project.attachments : []}
              disabled={busy}
              onChange={(attachments) => onPatch(project.id, { attachments })}
            />
            <button
              type="button"
              onClick={() => onOpenDetail(project.id)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#C9A96E]"
              title="Notes"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {noteCount || ""}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70 border-b border-slate-100">
          <td colSpan={9} className="px-10 py-3">
            <SubitemsEditor
              project={project}
              subitems={subitems}
              staffUsers={staffUsers}
              busy={busy}
              onChange={(next) => onPatch(project.id, { subitems: next })}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function NoteEntry({ note: n, staffUsers, onDelete, compact = false }) {
  const tagNames = noteTagNames(n, staffUsers);
  return (
    <div className={`rounded-lg border border-slate-100 ${compact ? "p-2.5 bg-slate-50/60" : "p-3"}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className={`${compact ? "text-xs" : "text-sm"} font-medium text-[#0D1B2A]`}>
            {n.author_name || n.author_email}
          </p>
          <p className="text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
        </div>
        {onDelete && (
          <button type="button" onClick={() => onDelete(n.id)} className="text-slate-300 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {n.content && (
        <p className={`${compact ? "text-xs" : "text-sm"} text-slate-600 whitespace-pre-wrap break-words`}>
          {linkifyText(n.content, tagNames)}
        </p>
      )}
      {tagNames.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tagged</span>
          {tagNames.map((name) => (
            <span
              key={name}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[#C9A96E]/15 text-[#0D1B2A] border border-[#C9A96E]/30"
            >
              @{name}
            </span>
          ))}
        </div>
      )}
      {Array.isArray(n.attachments) && n.attachments.length > 0 && (
        <div className="mt-2 space-y-1">
          {n.attachments.map((att) => {
            const Icon = fileIcon(att.content_type, att.name);
            const isImage = String(att.content_type || "").startsWith("image/");
            return (
              <a
                key={att.id}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-sky-700 hover:underline"
              >
                {isImage ? (
                  <img src={att.url} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                {att.name || "Attachment"}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubtaskNotes({ item, staffUsers, busy, onChange }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mentionIds, setMentionIds] = useState([]);
  const [files, setFiles] = useState([]);

  const notes = useMemo(() => {
    const list = Array.isArray(item.notes) ? item.notes : [];
    return [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [item.notes]);

  const post = (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content && !files.length) return;
    const tagged = staffUsers.filter((u) => mentionIds.includes(u.id) && content.includes(`@${mentionLabel(u)}`));
    const entry = {
      id: newId("note"),
      author_email: user?.email || "",
      author_name: adminLabel(user),
      content,
      created_at: new Date().toISOString(),
      mentioned_user_ids: tagged.map((u) => u.id),
      mentioned_names: tagged.map((u) => mentionLabel(u)),
      mentioned_emails: tagged.map((u) => u.email || ""),
      attachments: files,
    };
    onChange({ notes: [...(Array.isArray(item.notes) ? item.notes : []), entry] });
    setText("");
    setMentionIds([]);
    setFiles([]);
  };

  const remove = (id) => {
    if (!confirm("Delete this note?")) return;
    onChange({ notes: (Array.isArray(item.notes) ? item.notes : []).filter((n) => n.id !== id) });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-[#0D1B2A]"
      >
        <MessageSquare className="w-3.5 h-3.5 text-[#C9A96E]" />
        Notes &amp; updates{notes.length ? ` (${notes.length})` : ""}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="space-y-2">
          <form onSubmit={post} className="space-y-2">
            <MentionInput
              value={text}
              onChange={setText}
              mentionedUserIds={mentionIds}
              onMentionsChange={setMentionIds}
              users={staffUsers}
              rows={2}
              placeholder="Add a note, update, or link… type @ to tag someone"
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-slate-400 focus:ring-0 bg-white"
            />
            <AttachmentsBlock compact attachments={files} disabled={busy} onChange={setFiles} />
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={busy || (!text.trim() && !files.length)}
                className="h-7 gap-1.5 text-xs"
              >
                <Send className="w-3 h-3" />
                Post
              </Button>
            </div>
          </form>
          <div className="space-y-2">
            {notes.map((n) => (
              <NoteEntry key={n.id} note={n} staffUsers={staffUsers} onDelete={remove} compact />
            ))}
            {!notes.length && <p className="text-[11px] text-slate-400">No notes on this subtask yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function SubtaskTitleInput({ title, done, disabled, onCommit }) {
  const [value, setValue] = useState(title || "");

  useEffect(() => {
    setValue(title || "");
  }, [title]);

  const save = () => {
    const next = value.trim();
    if (!next || next === title) {
      setValue(title || "");
      return;
    }
    onCommit(next);
  };

  return (
    <input
      value={value}
      disabled={disabled}
      aria-label="Subtask title"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setValue(title || "");
          e.currentTarget.blur();
        }
      }}
      className={`flex-1 min-w-0 text-sm bg-transparent border border-transparent rounded px-2 py-1 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none ${
        done ? "line-through text-slate-400" : "text-slate-700"
      }`}
    />
  );
}

function SubitemsEditor({ project, subitems, staffUsers, busy, onChange }) {
  const [draft, setDraft] = useState("");

  const toggle = (id) => {
    onChange(subitems.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  };

  const remove = (id) => {
    onChange(subitems.filter((s) => s.id !== id));
  };

  const add = (e) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    onChange([
      ...subitems,
      {
        id: newId("sub"),
        title,
        done: false,
        created_at: new Date().toISOString(),
        assignees: [],
        attachments: [],
        notes: [],
      },
    ]);
    setDraft("");
  };

  const patchItem = (id, patch) => {
    onChange(subitems.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="space-y-2 max-w-3xl">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Subtasks · {project.name}
      </div>
      {subitems.length === 0 && (
        <p className="text-xs text-slate-400">Break this project into checklist items.</p>
      )}
      <div className="space-y-2">
        {subitems.map((item) => (
          <div key={item.id} className="bg-white border border-slate-100 rounded-lg px-2.5 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(item.id)}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  item.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                }`}
              >
                {item.done && <Check className="w-3 h-3" />}
              </button>
              <SubtaskTitleInput
                title={item.title}
                done={item.done}
                disabled={busy}
                onCommit={(title) => patchItem(item.id, { title })}
              />
              {Array.isArray(item.assignees) && item.assignees.length > 0 && (
                <AssigneesAvatars assignees={item.assignees} max={2} />
              )}
              <button type="button" disabled={busy} onClick={() => remove(item.id)} className="text-slate-300 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="pl-6 space-y-2">
              <div className="flex items-center gap-2">
                <AssigneesDropdown
                  assignees={item.assignees || []}
                  staffUsers={staffUsers}
                  disabled={busy}
                  onChange={(assignees) => patchItem(item.id, { assignees })}
                />
              </div>
              <AttachmentsBlock
                compact
                attachments={item.attachments || []}
                disabled={busy}
                onChange={(attachments) => patchItem(item.id, { attachments })}
              />
              <SubtaskNotes
                item={item}
                staffUsers={staffUsers}
                busy={busy}
                onChange={(patch) => patchItem(item.id, patch)}
              />
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add subtask…"
          className="h-8 text-sm bg-white"
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy || !draft.trim()} className="h-8">
          Add
        </Button>
      </form>
    </div>
  );
}

function BoardGroup({
  group,
  projects,
  collapsed,
  onToggle,
  staffUsers,
  busyId,
  expandedIds,
  onToggleExpand,
  onOpenDetail,
  onPatch,
  onQuickAdd,
  adding,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/50"
      >
        {collapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        <span className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
        <span className="text-sm font-semibold text-[#0D1B2A]">{group.label}</span>
        <span className="text-xs text-slate-400 tabular-nums">{projects.length}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-t border-slate-100">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="w-10" />
                <th className="text-left px-2 py-2 font-semibold">Item</th>
                <th className="text-center px-1 py-2 font-semibold w-[140px]">Status</th>
                <th className="text-center px-1 py-2 font-semibold w-[110px]">Priority</th>
                <th className="text-center px-1 py-2 font-semibold w-[96px]">People</th>
                <th className="text-center px-1 py-2 font-semibold w-[120px]">Start</th>
                <th className="text-center px-1 py-2 font-semibold w-[120px]">End</th>
                <th className="text-center px-1 py-2 font-semibold w-[110px]">Progress</th>
                <th className="text-center px-1 py-2 font-semibold w-[88px]">Files</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <ProjectBoardRow
                  key={p.id}
                  project={p}
                  staffUsers={staffUsers}
                  busyId={busyId}
                  expanded={expandedIds.has(p.id)}
                  onToggleExpand={onToggleExpand}
                  onOpenDetail={onOpenDetail}
                  onPatch={onPatch}
                />
              ))}
              {!projects.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-slate-400">
                    No projects in this group
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <QuickAddRow status={group.value} onAdd={onQuickAdd} busy={adding} />
        </div>
      )}
    </div>
  );
}

function KanbanView({ projects, onOpenDetail, onPatch, busyId }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {STATUS_GROUPS.map((group) => {
        const items = projects.filter((p) => (p.status || "not_started") === group.value);
        return (
          <div key={group.value} className="bg-white rounded-xl border border-slate-100 shadow-sm min-h-[280px]">
            <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-50">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
              <span className="text-xs font-semibold text-[#0D1B2A] uppercase tracking-wide">{group.label}</span>
              <span className="text-[10px] text-slate-400 ml-auto">{items.length}</span>
            </div>
            <div className="p-2 space-y-2">
              {items.map((p) => {
                const progress = subitemProgress(p);
                const assignees = projectAssignees(p);
                const overdue =
                  p.due_date &&
                  p.status !== "complete" &&
                  new Date(p.due_date) < new Date(new Date().toDateString());
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 hover:border-slate-200 cursor-pointer"
                    onClick={() => onOpenDetail(p.id)}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <p className="text-sm font-medium text-[#0D1B2A] flex-1">{p.name}</p>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                          progress.total > 0
                            ? "text-slate-600 bg-white border-slate-100"
                            : "text-slate-300 bg-transparent border-transparent"
                        }`}
                        title={`${progress.done} of ${progress.total} subtask${progress.total === 1 ? "" : "s"} done`}
                      >
                        <ListTodo className="w-3 h-3" />
                        {progress.done}/{progress.total}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${priorityMeta(p.priority).cell}`}>
                        {priorityMeta(p.priority).label}
                      </span>
                      <AssigneesAvatars assignees={assignees} max={3} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className={overdue ? "text-red-600 font-medium" : ""}>
                        {p.due_date ? fmtShort(p.due_date) : "No end date"}
                      </span>
                      {progress.total > 0 && <span>{progress.pct}%</span>}
                    </div>
                    {p.status !== "complete" && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPatch(p.id, { status: "complete", completed_at: new Date().toISOString() });
                        }}
                        className="mt-2 text-[11px] font-medium text-emerald-700 inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Mark done
                      </button>
                    )}
                  </div>
                );
              })}
              {!items.length && (
                <p className="text-xs text-slate-300 text-center py-8">Empty</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectDetailPanel({ project, staffUsers, partners, onClose, onChanged }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [mentionIds, setMentionIds] = useState([]);
  const [noteAttachments, setNoteAttachments] = useState([]);
  const [name, setName] = useState(project.name || "");
  const [description, setDescription] = useState(project.description || "");

  useEffect(() => {
    setName(project.name || "");
    setDescription(project.description || "");
    setNote("");
    setMentionIds([]);
    setNoteAttachments([]);
  }, [project.id, project.name, project.description]);

  const notes = useMemo(() => {
    const list = Array.isArray(project.notes) ? project.notes : [];
    return [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [project.notes]);

  const assignees = projectAssignees(project);

  const persist = async (patch, msg) => {
    setBusy(true);
    try {
      await base44.entities.Project.update(project.id, patch);
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
      onChanged?.();
      if (msg) toast({ title: msg });
    } catch (err) {
      toast({ title: err?.message || "Update failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveBasics = async () => {
    if (!name.trim()) return;
    await persist({ name: name.trim(), description: description.trim() }, "Project updated");
  };

  const addNote = async (e) => {
    e.preventDefault();
    const text = note.trim();
    if (!text && !noteAttachments.length) return;
    // Only keep tags whose @name is still in the text.
    const tagged = staffUsers.filter((u) => mentionIds.includes(u.id) && text.includes(`@${mentionLabel(u)}`));
    const entry = {
      id: newId("note"),
      author_email: user?.email || "",
      author_name: adminLabel(user),
      content: text,
      created_at: new Date().toISOString(),
      mentioned_user_ids: tagged.map((u) => u.id),
      mentioned_names: tagged.map((u) => mentionLabel(u)),
      mentioned_emails: tagged.map((u) => u.email || ""),
      attachments: noteAttachments,
    };
    await persist({ notes: [...(Array.isArray(project.notes) ? project.notes : []), entry] }, "Update posted");
    setNote("");
    setMentionIds([]);
    setNoteAttachments([]);
  };

  const deleteNote = async (id) => {
    if (!confirm("Delete this note?")) return;
    await persist({
      notes: (Array.isArray(project.notes) ? project.notes : []).filter((n) => n.id !== id),
    });
  };

  const handleDelete = async () => {
    if (!confirm(`Delete project “${project.name}”?`)) return;
    setBusy(true);
    try {
      await base44.entities.Project.delete(project.id);
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
      toast({ title: "Project deleted" });
      onClose();
    } catch (err) {
      toast({ title: err?.message || "Delete failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A96E] mb-1">Project</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveBasics}
              className="w-full text-lg font-semibold text-[#0D1B2A] border-0 focus:outline-none focus:ring-0 p-0"
            />
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Status</div>
              <StatusCell
                value={project.status}
                disabled={busy}
                onChange={(status) =>
                  persist({
                    status,
                    completed_at: status === "complete" ? new Date().toISOString() : null,
                  })
                }
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Priority</div>
              <PriorityCell
                value={project.priority || "medium"}
                disabled={busy}
                onChange={(priority) => persist({ priority })}
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Description</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveBasics}
              rows={3}
              placeholder="Scope and context…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Start date</div>
              <Input
                type="date"
                value={project.start_date || ""}
                disabled={busy}
                onChange={(e) => persist({ start_date: e.target.value || null })}
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Expected end</div>
              <Input
                type="date"
                value={project.due_date || ""}
                disabled={busy}
                onChange={(e) => persist({ due_date: e.target.value || null })}
              />
            </div>
          </div>

          <AssigneesChecklist
            label="Tag people"
            assignees={assignees}
            staffUsers={staffUsers}
            disabled={busy}
            onChange={(next) => persist(assigneePatch(next))}
          />

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Partner</div>
            <select
              value={project.partner_id || ""}
              disabled={busy}
              onChange={(e) => {
                const partner = partners.find((p) => p.id === e.target.value);
                persist(partner
                  ? {
                      partner_id: partner.id,
                      partner_name: partner.partner_name || partner.company_name || null,
                    }
                  : { partner_id: null, partner_name: null });
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">None</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.partner_name || p.company_name || p.id}</option>
              ))}
            </select>
          </div>

          <AttachmentsBlock
            title="Task files"
            attachments={Array.isArray(project.attachments) ? project.attachments : []}
            disabled={busy}
            onChange={(attachments) => persist({ attachments })}
          />

          <SubitemsEditor
            project={project}
            subitems={Array.isArray(project.subitems) ? project.subitems : []}
            staffUsers={staffUsers}
            busy={busy}
            onChange={(subitems) => persist({ subitems })}
          />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#C9A96E]" />
              <h3 className="text-sm font-semibold text-[#0D1B2A]">Updates</h3>
            </div>
            <form onSubmit={addNote} className="space-y-2">
              <MentionInput
                value={note}
                onChange={setNote}
                mentionedUserIds={mentionIds}
                onMentionsChange={setMentionIds}
                users={staffUsers}
                rows={3}
                placeholder="Post an update… type @ to tag someone"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-slate-400 focus:ring-0"
              />
              <AttachmentsBlock
                compact
                attachments={noteAttachments}
                disabled={busy}
                onChange={setNoteAttachments}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || (!note.trim() && !noteAttachments.length)}
                  className="gap-1.5"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Post
                </Button>
              </div>
            </form>
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-sm font-medium text-[#0D1B2A]">{n.author_name || n.author_email}</p>
                      <p className="text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                    </div>
                    <button type="button" onClick={() => deleteNote(n.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {n.content && (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {linkifyText(n.content, noteTagNames(n, staffUsers))}
                    </p>
                  )}
                  {noteTagNames(n, staffUsers).length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tagged</span>
                      {noteTagNames(n, staffUsers).map((name) => (
                        <span
                          key={name}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[#C9A96E]/15 text-[#0D1B2A] border border-[#C9A96E]/30"
                        >
                          @{name}
                        </span>
                      ))}
                    </div>
                  )}
                  {Array.isArray(n.attachments) && n.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {n.attachments.map((att) => {
                        const Icon = fileIcon(att.content_type, att.name);
                        const isImage = String(att.content_type || "").startsWith("image/");
                        return (
                          <a
                            key={att.id}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-sky-700 hover:underline"
                          >
                            {isImage ? (
                              <img src={att.url} alt="" className="w-8 h-8 rounded object-cover" />
                            ) : (
                              <Icon className="w-3.5 h-3.5" />
                            )}
                            {att.name || "Attachment"}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {!notes.length && <p className="text-xs text-slate-400 text-center py-4">No updates yet</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => persist({ archived: !project.archived }, project.archived ? "Restored" : "Archived")}
              className="gap-1.5"
            >
              {project.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              {project.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={handleDelete}
              className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewProjectDialog({ open, onClose, staffUsers, partners, onSave, saving }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "not_started",
    priority: "medium",
    assignee_ids: [],
    partner_id: "",
    start_date: "",
    due_date: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: "",
      description: "",
      status: "not_started",
      priority: "medium",
      assignee_ids: [],
      partner_id: "",
      start_date: "",
      due_date: "",
    });
  }, [open]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const assignees = staffUsers
      .filter((u) => form.assignee_ids.includes(u.id))
      .map((u) => ({ user_id: u.id, name: adminLabel(u), email: u.email || "" }));
    const partner = partners.find((p) => p.id === form.partner_id);
    onSave({
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      ...assigneePatch(assignees),
      partner_id: partner?.id || null,
      partner_name: partner?.partner_name || partner?.company_name || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      notes: [],
      subitems: [],
      attachments: [],
      archived: false,
      completed_at: form.status === "complete" ? new Date().toISOString() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Add an item to the board and track it through Done.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Project name" required />
          <AssigneesChecklist
            label="Tag people"
            assignees={staffUsers
              .filter((u) => form.assignee_ids.includes(u.id))
              .map((u) => ({ user_id: u.id, name: adminLabel(u), email: u.email || "" }))}
            staffUsers={staffUsers}
            onChange={(next) => set("assignee_ids", next.map((a) => a.user_id))}
          />
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Description (optional)"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-slate-400"
          />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {STATUS_GROUPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <select value={form.partner_id} onChange={(e) => set("partner_id", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">No partner</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.partner_name || p.company_name || p.id}</option>)}
          </select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminProjects({ embedded = false }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState("board");
  const [search, setSearch] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: () => base44.entities.Project.list("-updated_date", 500),
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ["admin-users-light"],
    queryFn: () => base44.entities.User.list("-created_date", 500),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partner-entities-admin"],
    queryFn: () => base44.entities.Partner.list("partner_name", 500),
  });

  const admins = useMemo(
    () =>
      staffUsers
        .filter((u) => ["admin", "super_admin", "projects"].includes(u.role))
        .sort((a, b) => adminLabel(a).localeCompare(adminLabel(b))),
    [staffUsers]
  );

  const sortedPartners = useMemo(
    () =>
      [...partners].sort((a, b) =>
        String(a.partner_name || a.company_name || "").localeCompare(
          String(b.partner_name || b.company_name || "")
        )
      ),
    [partners]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (showArchived ? !p.archived : p.archived) return false;
      if (assignedToMe && !isAssignedToUser(p, user)) return false;
      if (!q) return true;
      const assigneeText = projectAssignees(p).map((a) => `${a.name || ""} ${a.email || ""}`).join(" ");
      return (
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.owner_name?.toLowerCase().includes(q) ||
        p.partner_name?.toLowerCase().includes(q) ||
        assigneeText.toLowerCase().includes(q)
      );
    });
  }, [projects, search, showArchived, assignedToMe, user]);

  const counts = useMemo(() => {
    const active = projects.filter((p) => !p.archived);
    return {
      open: active.filter((p) => p.status !== "complete").length,
      in_progress: active.filter((p) => p.status === "in_progress").length,
      ongoing: active.filter((p) => p.status === "ongoing").length,
      blocked: active.filter((p) => p.status === "blocked").length,
      complete: active.filter((p) => p.status === "complete").length,
      mine: active.filter((p) => isAssignedToUser(p, user)).length,
    };
  }, [projects, user]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  const patchProject = async (id, patch) => {
    setBusyId(id);
    try {
      await base44.entities.Project.update(id, patch);
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
    } catch (err) {
      toast({ title: err?.message || "Update failed", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const createProject = async (data) => {
    setSaving(true);
    try {
      const created = await base44.entities.Project.create({
        ...data,
        created_by: user?.email || null,
        created_by_id: user?.id || null,
      });
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
      setCreateOpen(false);
      toast({ title: "Project created" });
      if (created?.id) setSelectedId(created.id);
    } catch (err) {
      toast({ title: err?.message || "Could not create project", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const quickAdd = async (name, status) => {
    setAdding(true);
    try {
      await base44.entities.Project.create({
        name,
        status,
        priority: "medium",
        notes: [],
        subitems: [],
        attachments: [],
        assignees: [],
        archived: false,
        created_by: user?.email || null,
        created_by_id: user?.id || null,
      });
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
    } catch (err) {
      toast({ title: err?.message || "Could not add project", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const toggleGroup = (value) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={embedded ? "space-y-5" : "p-6 space-y-5"}>
      {!embedded && (
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Project Management</h1>
          <p className="text-slate-400 text-sm mt-1">
            Monday-style board: groups, people, dates, subtasks, files, and updates.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Open", value: counts.open, color: "#C4C4C4" },
          { label: "Working on it", value: counts.in_progress, color: "#FDAB3D" },
          { label: "Ongoing", value: counts.ongoing, color: "#579BFC" },
          { label: "Stuck", value: counts.blocked, color: "#E2445C" },
          { label: "Done", value: counts.complete, color: "#00C875" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className="w-2 h-2 rounded-full mb-3" style={{ backgroundColor: s.color }} />
            <div className="text-2xl font-light text-[#0D1B2A]">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAssignedToMe((v) => !v)}
          className={`rounded-2xl border p-4 shadow-sm text-left transition-colors ${
            assignedToMe
              ? "bg-[#0D1B2A] border-[#0D1B2A] text-white"
              : "bg-white border-slate-100 hover:border-slate-300"
          }`}
        >
          <div className={`w-2 h-2 rounded-full mb-3 ${assignedToMe ? "bg-[#C9A96E]" : "bg-[#0D1B2A]"}`} />
          <div className={`text-2xl font-light ${assignedToMe ? "text-white" : "text-[#0D1B2A]"}`}>{counts.mine}</div>
          <div className={`text-xs ${assignedToMe ? "text-white/70" : "text-slate-400"}`}>Assigned to me</div>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 shrink-0">Filter</div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search board…"
            className="pl-9 bg-slate-50"
          />
        </div>
        <button
          type="button"
          onClick={() => setAssignedToMe((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border whitespace-nowrap ${
            assignedToMe
              ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
        >
          <UserRound className="w-3.5 h-3.5" />
          Only assigned to me
          <span className="tabular-nums opacity-80">({counts.mine})</span>
        </button>
        {assignedToMe && (
          <button
            type="button"
            onClick={() => setAssignedToMe(false)}
            className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="text-xs text-slate-400">
          {assignedToMe
            ? "Showing projects and subtasks tagged to you."
            : "Showing every project on the board."}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {[
              { id: "board", icon: Columns3, label: "Board" },
              { id: "kanban", icon: LayoutGrid, label: "Kanban" },
              { id: "list", icon: List, label: "List" },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === v.id ? "bg-[#0D1B2A] text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <v.icon className="w-3.5 h-3.5" />
                {v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${
              showArchived
                ? "bg-slate-100 border-slate-300 text-slate-700"
                : "bg-white border-slate-200 text-slate-500"
            }`}
          >
            {showArchived ? "Viewing archived" : "Show archived"}
          </button>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> New project
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading board…
        </div>
      ) : !visible.length && !showArchived ? (
        <EmptyState
          icon={FolderKanban}
          title={assignedToMe ? "Nothing assigned to you" : "Your board is empty"}
          description={
            assignedToMe
              ? "Clear the Assigned to me filter or tag yourself on a project."
              : "Create a project to start tracking work Monday-style — status groups, people, dates, and subtasks."
          }
          actionLabel={assignedToMe ? undefined : "New project"}
          onAction={assignedToMe ? undefined : () => setCreateOpen(true)}
        />
      ) : view === "kanban" ? (
        <KanbanView
          projects={visible}
          onOpenDetail={setSelectedId}
          onPatch={patchProject}
          busyId={busyId}
        />
      ) : (
        <div className="space-y-4">
          {STATUS_GROUPS.map((group) => {
            const groupProjects = visible
              .filter((p) => (p.status || "not_started") === group.value)
              .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
            if (view === "list" && !groupProjects.length) return null;
            return (
              <BoardGroup
                key={group.value}
                group={group}
                projects={groupProjects}
                collapsed={collapsed.has(group.value)}
                onToggle={() => toggleGroup(group.value)}
                staffUsers={admins}
                busyId={busyId}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onOpenDetail={setSelectedId}
                onPatch={patchProject}
                onQuickAdd={quickAdd}
                adding={adding}
              />
            );
          })}
        </div>
      )}

      {selected && (
        <ProjectDetailPanel
          project={selected}
          staffUsers={admins}
          partners={sortedPartners}
          onClose={() => setSelectedId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["admin-projects"] })}
        />
      )}

      <NewProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        staffUsers={admins}
        partners={sortedPartners}
        onSave={createProject}
        saving={saving}
      />
    </div>
  );
}
