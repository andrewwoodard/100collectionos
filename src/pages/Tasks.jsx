import React, { useState } from "react";
import { sb } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import TaskFormModal from "../components/tasks/TaskFormModal";
import TaskKanban from "../components/tasks/TaskKanban";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function Tasks() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [view, setView] = useState("list");
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => { const r = await sb.list("tasks"); return r.items || []; },
  });
  const { data: partners = [] } = useQuery({
    queryKey: ["partners"],
    queryFn: async () => { const r = await sb.list("partners"); return r.items || []; },
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const res = await base44.functions.invoke("supabaseProperties", { action: "list", limit: 500 });
      return res.data.properties || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => sb.create("tasks", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => sb.update("tasks", id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const filtered = tasks.filter(t => {
    const matchSearch = !search || t.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tasks</h2>
          <p className="text-sm text-gray-500">{tasks.filter(t => t.status !== "complete").length} open tasks</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs ${view === "list" ? "bg-gray-100 font-medium" : "text-gray-500"}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setView("kanban")} className={`px-3 py-1.5 text-xs ${view === "kanban" ? "bg-gray-100 font-medium" : "text-gray-500"}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={() => setModalOpen(true)} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            <Plus className="w-4 h-4 mr-1.5" /> Add Task
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search tasks..." className="pl-9 bg-white" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-32 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === "kanban" ? (
        <TaskKanban tasks={filtered} onUpdateTask={(id, data) => updateMutation.mutate({ id, data })} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={List} title="No tasks found" actionLabel="Add Task" onAction={() => setModalOpen(true)} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="text-xs font-semibold text-gray-500">Task</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Partner</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Assigned</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Priority</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => (
                <TableRow key={t.id} className="hover:bg-gray-50/50">
                  <TableCell>
                    <p className="text-sm font-medium text-gray-900">{t.title}</p>
                    {t.property_name && <p className="text-xs text-gray-400">{t.property_name}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{t.partner_name || "—"}</TableCell>
                  <TableCell className="text-sm text-gray-600">{t.assigned_to || "—"}</TableCell>
                  <TableCell><StatusBadge status={t.priority} /></TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-xs text-gray-400">{t.due_date ? format(new Date(t.due_date), "MMM d") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TaskFormModal open={modalOpen} onOpenChange={setModalOpen} partners={partners} properties={properties} onSave={async (data) => {
        await createMutation.mutateAsync(data);
        setModalOpen(false);
      }} />
    </div>
  );
}