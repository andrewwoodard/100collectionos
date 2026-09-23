import React from "react";
import StatusBadge from "../shared/StatusBadge";
import { format } from "date-fns";

const columns = [
  { key: "not_started", label: "Not Started", color: "border-gray-300" },
  { key: "in_progress", label: "In Progress", color: "border-blue-400" },
  { key: "blocked", label: "Blocked", color: "border-red-400" },
  { key: "complete", label: "Complete", color: "border-emerald-400" },
];

export default function TaskKanban({ tasks, onUpdateTask }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {columns.map(col => {
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div key={col.key} className={`bg-white rounded-xl border-t-2 ${col.color} border border-gray-100 p-3 min-h-[300px]`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{col.label}</h4>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{colTasks.length}</span>
            </div>
            <div className="space-y-2">
              {colTasks.map(task => (
                <div key={task.id} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors cursor-pointer">
                  <p className="text-sm font-medium text-gray-900 mb-1">{task.title}</p>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={task.priority} />
                    {task.due_date && (
                      <span className="text-xs text-gray-400">{format(new Date(task.due_date), "MMM d")}</span>
                    )}
                  </div>
                  {task.assigned_to && <p className="text-xs text-gray-400 mt-1">{task.assigned_to}</p>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}