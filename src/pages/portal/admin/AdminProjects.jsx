import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Archive, ArchiveRestore, Check, CheckCircle2, ChevronDown, ChevronRight,
  Columns3, FolderKanban, LayoutGrid, List, Loader2, MessageSquare, Plus,
  Search, Send, Trash2, X,
} from "lucide-react";

const STATUS_GROUPS = [
  { value: "not_started", label: "Not Started", color: "#C4C4C4", soft: "bg-slate-100 text-slate-700", cell: "bg-slate-400" },
  { value: "in_progress", label: "Working on it", color: "#FDAB3D", soft: "bg-amber-50 text-amber-800", cell: "bg-amber-400" },
  { value: "blocked", label: "Stuck", color: "#E2445C", soft: "bg-red-50 text-red-700", cell: "bg-red-500" },
  { value: "complete", label: "Done", color: "#00C875", soft: "bg-emerald-50 text-emerald-800", cell: "bg-emerald-500" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low", cell: "bg-slate-300 text-slate-800" },
  { value: "medium", label: "Medium", cell: "bg-sky-400 text-white" },
  { value: "high", label: "High", cell: "bg-orange-400 text-white" },
  { value: "urgent", label: "Critical", cell: "bg-rose-500 text-white" },
];

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

function CellMenu({ open, onClose, children, align = "left" }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={`absolute z-30 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white shadow-xl py-1 ${
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

function OwnerCell({ project, staffUsers, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const label = project.owner_name || project.owner_email || "";
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-full h-9 px-2 flex items-center justify-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"
        title={label || "Assign owner"}
      >
        {label ? (
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0D1B2A] text-white text-[10px] font-semibold">
            {initials(label)}
          </span>
        ) : (
          <span className="text-xs text-slate-300">+</span>
        )}
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)}>
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
            setOpen(false);
          }}
        >
          Unassigned
        </button>
        {staffUsers.map((u) => (
          <button
            key={u.id}
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
            onClick={(e) => {
              e.stopPropagation();
              onChange(u);
              setOpen(false);
            }}
          >
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0D1B2A] text-white text-[10px] font-semibold">
              {initials(adminLabel(u))}
            </span>
            <span className="truncate">{adminLabel(u)}</span>
          </button>
        ))}
      </CellMenu>
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

  return (
    <>
      <tr className="group border-b border-slate-100 hover:bg-slate-50/40">
        <td className="w-10 px-2">
          <button
            type="button"
            onClick={() => onToggleExpand(project.id)}
            className="p-1 text-slate-300 hover:text-slate-600"
            title="Subitems"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="min-w-[220px] px-2 py-1.5">
          <button
            type="button"
            onClick={() => onOpenDetail(project.id)}
            className="text-left w-full"
          >
            <div className="text-sm font-medium text-[#0D1B2A] group-hover:text-[#8B6A2E] truncate">
              {project.name}
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
        <td className="w-[72px] p-0">
          <OwnerCell
            project={project}
            staffUsers={staffUsers}
            disabled={busy}
            onChange={(user) =>
              onPatch(project.id, user
                ? {
                    owner_user_id: user.id,
                    owner_name: adminLabel(user),
                    owner_email: user.email || null,
                  }
                : { owner_user_id: null, owner_name: null, owner_email: null })
            }
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
        <td className="w-[56px] text-center">
          <button
            type="button"
            onClick={() => onOpenDetail(project.id)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#C9A96E]"
            title="Notes"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {noteCount || ""}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70 border-b border-slate-100">
          <td colSpan={9} className="px-10 py-3">
            <SubitemsEditor
              project={project}
              subitems={subitems}
              busy={busy}
              onChange={(next) => onPatch(project.id, { subitems: next })}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function SubitemsEditor({ project, subitems, busy, onChange }) {
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
      { id: newId("sub"), title, done: false, created_at: new Date().toISOString() },
    ]);
    setDraft("");
  };

  return (
    <div className="space-y-2 max-w-2xl">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Subitems · {project.name}
      </div>
      {subitems.length === 0 && (
        <p className="text-xs text-slate-400">Break this project into checklist items.</p>
      )}
      <div className="space-y-1">
        {subitems.map((item) => (
          <div key={item.id} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg px-2.5 py-1.5">
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
            <span className={`flex-1 text-sm ${item.done ? "line-through text-slate-400" : "text-slate-700"}`}>
              {item.title}
            </span>
            <button type="button" disabled={busy} onClick={() => remove(item.id)} className="text-slate-300 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add subitem…"
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
          <table className="w-full min-w-[980px] border-t border-slate-100">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="w-10" />
                <th className="text-left px-2 py-2 font-semibold">Item</th>
                <th className="text-center px-1 py-2 font-semibold w-[140px]">Status</th>
                <th className="text-center px-1 py-2 font-semibold w-[110px]">Priority</th>
                <th className="text-center px-1 py-2 font-semibold w-[72px]">Person</th>
                <th className="text-center px-1 py-2 font-semibold w-[120px]">Start</th>
                <th className="text-center px-1 py-2 font-semibold w-[120px]">End</th>
                <th className="text-center px-1 py-2 font-semibold w-[110px]">Progress</th>
                <th className="text-center px-1 py-2 font-semibold w-[56px]">Notes</th>
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
                    <p className="text-sm font-medium text-[#0D1B2A] mb-2">{p.name}</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${priorityMeta(p.priority).cell}`}>
                        {priorityMeta(p.priority).label}
                      </span>
                      {p.owner_name && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0D1B2A] text-white text-[9px] font-semibold">
                          {initials(p.owner_name)}
                        </span>
                      )}
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
  const [name, setName] = useState(project.name || "");
  const [description, setDescription] = useState(project.description || "");

  useEffect(() => {
    setName(project.name || "");
    setDescription(project.description || "");
    setNote("");
  }, [project.id, project.name, project.description]);

  const notes = useMemo(() => {
    const list = Array.isArray(project.notes) ? project.notes : [];
    return [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [project.notes]);

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
    if (!text) return;
    const entry = {
      id: newId("note"),
      author_email: user?.email || "",
      author_name: adminLabel(user),
      content: text,
      created_at: new Date().toISOString(),
    };
    await persist({ notes: [...(Array.isArray(project.notes) ? project.notes : []), entry] }, "Note added");
    setNote("");
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

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Owner</div>
            <select
              value={project.owner_user_id || ""}
              disabled={busy}
              onChange={(e) => {
                const owner = staffUsers.find((u) => u.id === e.target.value);
                persist(owner
                  ? {
                      owner_user_id: owner.id,
                      owner_name: adminLabel(owner),
                      owner_email: owner.email || null,
                    }
                  : { owner_user_id: null, owner_name: null, owner_email: null });
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Unassigned</option>
              {staffUsers.map((u) => (
                <option key={u.id} value={u.id}>{adminLabel(u)}</option>
              ))}
            </select>
          </div>

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

          <SubitemsEditor
            project={project}
            subitems={Array.isArray(project.subitems) ? project.subitems : []}
            busy={busy}
            onChange={(subitems) => persist({ subitems })}
          />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#C9A96E]" />
              <h3 className="text-sm font-semibold text-[#0D1B2A]">Updates</h3>
            </div>
            <form onSubmit={addNote} className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Post an update…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-slate-400"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={busy || !note.trim()} className="gap-1.5">
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
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{n.content}</p>
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
    owner_user_id: "",
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
      owner_user_id: "",
      partner_id: "",
      start_date: "",
      due_date: "",
    });
  }, [open]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const owner = staffUsers.find((u) => u.id === form.owner_user_id);
    const partner = partners.find((p) => p.id === form.partner_id);
    onSave({
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      owner_user_id: owner?.id || null,
      owner_name: owner ? adminLabel(owner) : null,
      owner_email: owner?.email || null,
      partner_id: partner?.id || null,
      partner_name: partner?.partner_name || partner?.company_name || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      notes: [],
      subitems: [],
      archived: false,
      completed_at: form.status === "complete" ? new Date().toISOString() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Add an item to the board and track it through Done.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Project name" required />
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
          <select value={form.owner_user_id} onChange={(e) => set("owner_user_id", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Unassigned</option>
            {staffUsers.map((u) => <option key={u.id} value={u.id}>{adminLabel(u)}</option>)}
          </select>
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
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.owner_name?.toLowerCase().includes(q) ||
        p.partner_name?.toLowerCase().includes(q)
      );
    });
  }, [projects, search, showArchived]);

  const counts = useMemo(() => {
    const active = projects.filter((p) => !p.archived);
    return {
      open: active.filter((p) => p.status !== "complete").length,
      in_progress: active.filter((p) => p.status === "in_progress").length,
      blocked: active.filter((p) => p.status === "blocked").length,
      complete: active.filter((p) => p.status === "complete").length,
    };
  }, [projects]);

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
            Monday-style board: groups, inline status, people, dates, subitems, and updates.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", value: counts.open, color: "#C4C4C4" },
          { label: "Working on it", value: counts.in_progress, color: "#FDAB3D" },
          { label: "Stuck", value: counts.blocked, color: "#E2445C" },
          { label: "Done", value: counts.complete, color: "#00C875" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className="w-2 h-2 rounded-full mb-3" style={{ backgroundColor: s.color }} />
            <div className="text-2xl font-light text-[#0D1B2A]">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search board…"
            className="pl-9 bg-white"
          />
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
          title="Your board is empty"
          description="Create a project to start tracking work Monday-style — status groups, people, dates, and subitems."
          actionLabel="New project"
          onAction={() => setCreateOpen(true)}
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
