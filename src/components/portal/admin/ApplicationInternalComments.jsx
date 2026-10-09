import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MessageSquare, Send, Trash2, Loader2 } from "lucide-react";

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
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function newCommentId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function ApplicationInternalComments({ applicationId, comments = [], onUpdated }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [error, setError] = useState(null);

  const sorted = [...(Array.isArray(comments) ? comments : [])].sort(
    (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
  );

  const saveComments = useMutation({
    mutationFn: async (nextComments) => {
      await base44.entities.PartnerApplication.update(applicationId, {
        internal_comments: nextComments,
      });
      return nextComments;
    },
    onSuccess: (nextComments) => {
      qc.invalidateQueries(["partner-applications"]);
      onUpdated?.(nextComments);
    },
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || saveComments.isPending) return;
    setError(null);
    const entry = {
      id: newCommentId(),
      author_email: user?.email || "",
      author_name: user?.full_name || user?.name || user?.email || "Admin",
      content: text,
      created_at: new Date().toISOString(),
    };
    try {
      await saveComments.mutateAsync([...sorted, entry]);
      setContent("");
    } catch (err) {
      setError(err?.message || "Could not save comment");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this comment?")) return;
    setError(null);
    try {
      await saveComments.mutateAsync(sorted.filter((c) => c.id !== id));
    } catch (err) {
      setError(err?.message || "Could not delete comment");
    }
  };

  return (
    <div className="px-6 pb-6">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-3.5 h-3.5 text-[#C9A96E]" />
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Internal comments
        </div>
        {sorted.length > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {sorted.length}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Visible only to admins. Use this to share notes about the application with the team.
      </p>

      <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
          {sorted.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No internal comments yet.
            </div>
          ) : (
            sorted.map((c) => (
              <div key={c.id} className="px-4 py-3 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#0D1B2A]">
                        {c.author_name || c.author_email || "Admin"}
                      </span>
                      <span className="text-[11px] text-slate-400">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                      {c.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    disabled={saveComments.isPending}
                    className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAdd} className="border-t border-slate-100 bg-white p-3 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Add an internal comment for the team…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-y focus:outline-none focus:border-slate-400"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saveComments.isPending || !content.trim()}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-[#0D1B2A] text-white hover:bg-[#1a2d42] disabled:opacity-50 transition-colors"
            >
              {saveComments.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Post comment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
