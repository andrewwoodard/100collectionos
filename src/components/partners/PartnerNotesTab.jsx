import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import StatusBadge from "../shared/StatusBadge";
import EmptyState from "../shared/EmptyState";
import { format } from "date-fns";
import { MessageSquare, Loader2, Trash2 } from "lucide-react";

export default function PartnerNotesTab({ notes, partnerId, partnerName }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createNote = useMutation({
    mutationFn: (data) => sb.create("notes", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partner-notes", partnerId] }),
  });

  const deleteNote = useMutation({
    mutationFn: (id) => sb.delete("notes", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partner-notes", partnerId] }),
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await createNote.mutateAsync({
        partner_id: partnerId,
        partner_name: partnerName,
        title: title.trim() || "Internal note",
        body: body.trim(),
        note_type: "internal",
      });
      setTitle("");
      setBody("");
      toast({ title: "Note saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save note", description: err?.message });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteNote.mutateAsync(id);
      toast({ title: "Note deleted" });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not delete note", description: err?.message });
    }
  };

  const submitting = createNote.isPending;

  return (
    <div className="space-y-4">
      {/* Composer */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#C9A96E]" />
          <h3 className="text-sm font-semibold text-gray-900">Add an internal note</h3>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write an internal note for the team..."
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={submitting || !body.trim()} className="gap-1.5">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save note
          </Button>
        </div>
      </form>

      {/* List */}
      {(!Array.isArray(notes) || notes.length === 0) ? (
        <EmptyState icon={MessageSquare} title="No notes yet" description="Internal notes you add will appear here." />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900">{n.title}</h4>
                <div className="flex items-center gap-2">
                  <StatusBadge status={n.note_type} />
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={deleteNote.isPending}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-gray-400 mt-2">
                {n.created_date ? format(new Date(n.created_date), "MMM d, yyyy · h:mm a") : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}