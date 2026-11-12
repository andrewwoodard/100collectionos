import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Archive, ArchiveRestore, CheckCircle2, ChevronLeft, ClipboardList, FolderKanban,
  Loader2, MessageSquare, Plus, Search, Send, Trash2,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started", variant: "neutral" },
  { value: "in_progress", label: "In progress", variant: "info" },
  { value: "blocked", label: "Blocked", variant: "warning" },
  { value: "complete", label: "Complete", variant: "success" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const PRIORITY_STYLES = {
  low: "bg-slate-50 text-slate-600 border-slate-200",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  status: "not_started",
  priority: "medium",
  owner_user_id: "",
  partner_id: "",
  start_date: "",
  due_date: "",
};

function statusMeta(status) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

function newNoteId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function adminLabel(u) {
  return u?.full_name || u?.name || u?.email || "Admin";
}

function ProjectFormDialog({ open, onClose, initial, staffUsers, partners, onSave, saving }) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initial?.name || "",
      description: initial?.description || "",
      status: initial?.status || "not_started",
      priority: initial?.priority || "medium",
      owner_user_id: initial?.owner_user_id || "",
      partner_id: initial?.partner_id || "",
      start_date: initial?.start_date || "",
      due_date: initial?.due_date || "",
    });
  }, [open, initial]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
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
      ...(form.status === "complete"
        ? { completed_at: initial?.completed_at || new Date().toISOString() }
        : { completed_at: null }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Track an internal initiative from kickoff through completion.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Name</label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Project name" required />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Scope, goals, or context…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-slate-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Start</label>
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Due</label>
              <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Owner</label>
            <select
              value={form.owner_user_id}
              onChange={(e) => set("owner_user_id", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Unassigned</option>
              {staffUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {adminLabel(u)}{u.email ? ` (${u.email})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Partner (optional)</label>
            <select
              value={form.partner_id}
              onChange={(e) => set("partner_id", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">None</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.partner_name || p.company_name || p.id}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {initial?.id ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectNotes({ project, onUpdated }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");

  const notes = useMemo(() => {
    const list = Array.isArray(project.notes) ? project.notes : [];
    return [...list].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }, [project.notes]);

  const saveNotes = useMutation({
    mutationFn: async (nextNotes) => {
      await base44.entities.Project.update(project.id, { notes: nextNotes });
      return nextNotes;
    },
    onSuccess: (nextNotes) => {
      qc.invalidateQueries({ queryKey: ["admin-projects"] });
      onUpdated?.(nextNotes);
    },
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || saveNotes.isPending) return;
    const entry = {
      id: newNoteId(),
      author_email: user?.email || "",
      author_name: adminLabel(user),
      content: text,
      created_at: new Date().toISOString(),
    };
    try {
      await saveNotes.mutateAsync([...notes, entry]);
      setContent("");
      toast({ title: "Note added" });
    } catch (err) {
      toast({ title: err?.message || "Could not save note", variant: "destructive" });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this note?")) return;
    try {
      await saveNotes.mutateAsync(notes.filter((n) => n.id !== id));
      toast({ title: "Note deleted" });
    } catch (err) {
      toast({ title: err?.message || "Could not delete note", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[#C9A96E]" />
        <h3 className="text-sm font-semibold text-[#0D1B2A]">Notes & activity</h3>
        <span className="text-xs text-slate-400">{notes.length}</span>
      </div>

      <form onSubmit={handleAdd} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Add a progress note, decision, or follow-up…"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white resize-y focus:outline-none focus:border-slate-400"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={saveNotes.isPending || !content.trim()} className="gap-1.5">
            {saveNotes.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Add note
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No notes yet. Capture updates as the project moves along.</p>
      ) : (
        <div className="space-y-3">
          {[...notes].reverse().map((note) => (
            <div key={note.id} className="bg-white border border-slate-100 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div>
                  <p className="text-sm font-medium text-[#0D1B2A]">{note.author_name || note.author_email || "Admin"}</p>
                  <p className="text-[11px] text-slate-400">{timeAgo(note.created_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(note.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                  title="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ project, staffUsers, partners, onBack, onChanged }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localNotes, setLocalNotes] = useState(() =>
    Array.isArray(project.notes) ? project.notes : []
  );

  useEffect(() => {
    setLocalNotes(Array.isArray(project.notes) ? project.notes : []);
  }, [project.id, project.notes]);

  const meta = statusMeta(project.status);
  const overdue =
    project.due_date &&
    project.status !== "complete" &&
    new Date(project.due_date) < new Date(new Date().toDateString());

  const persist = async (patch, successMsg) => {
    setBusy(true);
    try {
      await base44.entities.Project.update(project.id, patch);
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
      onChanged?.();
      if (successMsg) toast({ title: successMsg });
    } catch (err) {
      toast({ title: err?.message || "Update failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (data) => {
    setBusy(true);
    try {
      await base44.entities.Project.update(project.id, data);
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
      setEditOpen(false);
      onChanged?.();
      toast({ title: "Project updated" });
    } catch (err) {
      toast({ title: err?.message || "Update failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status) => {
    await persist(
      {
        status,
        completed_at: status === "complete" ? new Date().toISOString() : null,
      },
      status === "complete" ? "Marked complete" : `Status → ${statusMeta(status).label}`
    );
  };

  const handleArchive = async () => {
    await persist(
      { archived: !project.archived },
      project.archived ? "Project restored" : "Project archived"
    );
  };

  const handleDelete = async () => {
    if (!confirm(`Delete project “${project.name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await base44.entities.Project.delete(project.id);
      await qc.invalidateQueries({ queryKey: ["admin-projects"] });
      toast({ title: "Project deleted" });
      onBack();
    } catch (err) {
      toast({ title: err?.message || "Delete failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#0D1B2A] mb-5 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to projects
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-5">
        <div className="px-6 py-5 border-b border-slate-50 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold text-[#0D1B2A]">{project.name}</h2>
              <StatusPill value={project.status} label={meta.label} variant={meta.variant} />
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[project.priority] || PRIORITY_STYLES.medium}`}>
                {(project.priority || "medium").replace(/_/g, " ")}
              </span>
              {project.archived && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Archived
                </span>
              )}
              {overdue && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                  Overdue
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-slate-600 whitespace-pre-wrap max-w-3xl">{project.description}</p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
              <span>Owner: {project.owner_name || project.owner_email || "Unassigned"}</span>
              {project.partner_name && <span>Partner: {project.partner_name}</span>}
              <span>Start: {fmtDate(project.start_date)}</span>
              <span>Due: {fmtDate(project.due_date)}</span>
              {project.completed_at && <span>Completed: {fmtDate(project.completed_at)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={busy}>
              Edit
            </Button>
            {project.status !== "complete" && (
              <Button size="sm" onClick={() => handleStatus("complete")} disabled={busy} className="gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark complete
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleArchive} disabled={busy} className="gap-1.5">
              {project.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              {project.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={busy} className="text-red-600 border-red-200 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-50">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
            Move status
          </label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={busy || project.status === s.value}
                onClick={() => handleStatus(s.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  project.status === s.value
                    ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                } disabled:opacity-60`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          <ProjectNotes
            project={{ ...project, notes: localNotes }}
            onUpdated={(next) => {
              setLocalNotes(next);
              onChanged?.();
            }}
          />
        </div>
      </div>

      <ProjectFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={project}
        staffUsers={staffUsers}
        partners={partners}
        onSave={handleSaveEdit}
        saving={busy}
      />
    </div>
  );
}

export default function AdminProjects({ embedded = false }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [selectedId, setSelectedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
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
        .filter((u) => ["admin", "operations", "onboarding", "super_admin"].includes(u.role))
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

  const counts = useMemo(() => {
    const active = projects.filter((p) => !p.archived);
    return {
      open: active.filter((p) => p.status !== "complete").length,
      in_progress: active.filter((p) => p.status === "in_progress").length,
      blocked: active.filter((p) => p.status === "blocked").length,
      complete: active.filter((p) => p.status === "complete").length,
      archived: projects.filter((p) => p.archived).length,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter === "archived") {
        if (!p.archived) return false;
      } else if (statusFilter === "open") {
        if (p.archived || p.status === "complete") return false;
      } else if (statusFilter !== "all") {
        if (p.archived || p.status !== statusFilter) return false;
      } else if (p.archived) {
        return false;
      }
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.owner_name?.toLowerCase().includes(q) ||
        p.partner_name?.toLowerCase().includes(q)
      );
    });
  }, [projects, search, statusFilter]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  const handleCreate = async (data) => {
    setSaving(true);
    try {
      const created = await base44.entities.Project.create({
        ...data,
        notes: [],
        archived: false,
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

  if (selected) {
    return (
      <ProjectDetail
        project={selected}
        staffUsers={admins}
        partners={sortedPartners}
        onBack={() => setSelectedId(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["admin-projects"] })}
      />
    );
  }

  return (
    <div className={embedded ? "space-y-5" : "p-6 space-y-5"}>
      {!embedded && (
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Project Management</h1>
          <p className="text-slate-400 text-sm mt-1">Create projects, track status, and take notes through completion.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", value: counts.open, icon: ClipboardList },
          { label: "In progress", value: counts.in_progress, icon: FolderKanban },
          { label: "Blocked", value: counts.blocked, icon: MessageSquare },
          { label: "Complete", value: counts.complete, icon: CheckCircle2 },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center mb-2">
              <s.icon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-light text-[#0D1B2A]">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="pl-9 bg-white"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="open">Open projects</option>
            <option value="all">All active</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="complete">Complete</option>
            <option value="archived">Archived</option>
          </select>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> New project
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading projects…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to track work through completion with notes along the way."
          actionLabel="New project"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Project</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Owner</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Due</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((p) => {
                const meta = statusMeta(p.status);
                const noteCount = Array.isArray(p.notes) ? p.notes.length : 0;
                const overdue =
                  p.due_date &&
                  p.status !== "complete" &&
                  new Date(p.due_date) < new Date(new Date().toDateString());
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-[#0D1B2A]">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                        {p.partner_name || p.description || "—"}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusPill value={p.status} label={meta.label} variant={meta.variant} />
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[p.priority] || PRIORITY_STYLES.medium}`}>
                          {p.priority || "medium"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">{p.owner_name || p.owner_email || "Unassigned"}</td>
                    <td className={`px-5 py-4 text-xs ${overdue ? "text-red-600 font-medium" : "text-slate-500"}`}>
                      {fmtDate(p.due_date)}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">{noteCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProjectFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initial={null}
        staffUsers={admins}
        partners={sortedPartners}
        onSave={handleCreate}
        saving={saving}
      />
    </div>
  );
}
