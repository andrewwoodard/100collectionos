import React, { useState, useEffect, useRef } from "react";
import { X, Send, CheckCheck, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import MentionInput from "@/components/admin/MentionInput";

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderContent(content, mentionedUserIds, users) {
  if (!content) return null;
  if (!mentionedUserIds || mentionedUserIds.length === 0) return content;

  const mentionNames = mentionedUserIds
    .map(uid => users.find(u => u.id === uid))
    .filter(Boolean)
    .map(u => ({ name: u.full_name || u.email, id: u.id }));

  if (mentionNames.length === 0) return content;

  let parts = [content];
  for (const m of mentionNames) {
    const target = `@${m.name}`;
    const newParts = [];
    for (const part of parts) {
      if (typeof part !== "string") { newParts.push(part); continue; }
      let remaining = part;
      let idx = remaining.indexOf(target);
      while (idx !== -1) {
        newParts.push(remaining.slice(0, idx));
        newParts.push(
          <span key={`${m.id}-${newParts.length}`} className="inline-flex items-center text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-200 font-medium">
            @{m.name}
          </span>
        );
        remaining = remaining.slice(idx + target.length);
        idx = remaining.indexOf(target);
      }
      newParts.push(remaining);
    }
    parts = newParts;
  }

  return <>{parts.map((p, i) => <React.Fragment key={i}>{p}</React.Fragment>)}</>;
}

export default function FunnelCommentsModal({ partnerId, partnerName, legacyNotes, onboardingId, onClose }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState([]);
  const [migrated, setMigrated] = useState(!legacyNotes);
  const listEndRef = useRef(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["funnel-comments", partnerId],
    queryFn: () => base44.entities.FunnelComment.filter({ partner_id: partnerId }, "-created_date", 50),
    enabled: !!partnerId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["mentionable-users"],
    queryFn: async () => {
      const all = await base44.entities.User.list("-created_date", 100);
      return all.filter(u => ["admin", "operations", "onboarding", "finance", "marketing"].includes(u.role));
    },
  });

  const sortedComments = [...comments].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  const isResolved = comments.length > 0 && comments.every(c => c.is_resolved);

  // Migration: seed legacy internal_notes as first comment on first open
  useEffect(() => {
    if (migrated || isLoading || !legacyNotes) return;
    if (comments.length > 0) { setMigrated(true); return; }

    base44.entities.FunnelComment.create({
      partner_id: partnerId,
      partner_name: partnerName,
      author_email: "system@theonehundredcollection.com",
      author_name: "Legacy note (imported)",
      content: legacyNotes,
      mentioned_user_ids: [],
    }).then(() => {
      if (onboardingId) {
        base44.entities.PartnerOnboarding.update(onboardingId, { internal_notes: "" }).catch(() => {});
      }
      qc.invalidateQueries(["funnel-comments", partnerId]);
      qc.invalidateQueries(["partnerOnboarding"]);
      qc.invalidateQueries(["funnel-comment-counts"]);
      setMigrated(true);
    }).catch(() => setMigrated(true));
  }, [migrated, isLoading, comments.length, legacyNotes, partnerId, partnerName, onboardingId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const postMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      const newComment = await base44.entities.FunnelComment.create({
        partner_id: partnerId,
        partner_name: partnerName,
        author_email: user.email,
        author_name: user.full_name || user.email,
        content,
        mentioned_user_ids: mentionedUserIds,
      });

      // Fire notification hook directly (bypass entity automation for reliability)
      if (mentionedUserIds.length > 0) {
        try {
          await base44.functions.invoke("onFunnelCommentCreate", {
            data: {
              id: newComment.id,
              partner_id: partnerId,
              partner_name: partnerName,
              author_email: user.email,
              author_name: user.full_name || user.email,
              content,
              mentioned_user_ids: mentionedUserIds,
            },
          });
        } catch (e) {
          console.error("Failed to fire funnel comment notification:", e);
        }
      }

      return newComment;
    },
    onSuccess: () => {
      setContent("");
      setMentionedUserIds([]);
      qc.invalidateQueries(["funnel-comments", partnerId]);
      qc.invalidateQueries(["funnel-comment-counts"]);
      toast({ title: "Note posted." });
    },
    onError: (error) => {
      console.error("Funnel comment post failed:", error);
      toast({
        title: "Failed to post note",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (resolve) => {
      const updates = comments.map(c => ({ id: c.id, is_resolved: resolve }));
      return base44.entities.FunnelComment.bulkUpdate(updates);
    },
    onSuccess: () => {
      qc.invalidateQueries(["funnel-comments", partnerId]);
      qc.invalidateQueries(["funnel-comment-counts"]);
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            Team notes — {partnerName}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {isLoading ? (
            <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
          ) : sortedComments.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">
              No notes yet. Add the first team update — tag someone with @ to notify them.
            </div>
          ) : (
            sortedComments.map(c => (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[#0D1B2A] text-[#C9A96E] text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                  {(c.author_name || c.author_email || "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-[#0D1B2A]">{c.author_name || c.author_email}</span>
                    <span className="text-[10px] text-gray-400">{timeAgo(c.created_date)}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                    {renderContent(c.content, c.mentioned_user_ids, users)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={listEndRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-gray-100 p-4 space-y-3">
          <MentionInput
            value={content}
            onChange={setContent}
            mentionedUserIds={mentionedUserIds}
            onMentionsChange={setMentionedUserIds}
            placeholder="Add a team note… type @ to tag someone"
          />
          <div className="flex items-center justify-between">
            {comments.length > 0 && (
              <button
                onClick={() => resolveMutation.mutate(!isResolved)}
                disabled={resolveMutation.isPending}
                className="text-[11px] text-slate-500 hover:text-[#C9A96E] flex items-center gap-1 transition-colors"
              >
                {isResolved
                  ? <><RotateCcw className="w-3 h-3" /> Reopen thread</>
                  : <><CheckCheck className="w-3 h-3" /> Resolve thread</>}
              </button>
            )}
            <button
              onClick={() => postMutation.mutate()}
              disabled={!content.trim() || postMutation.isPending}
              className="ml-auto flex items-center gap-1.5 bg-[#0D1B2A] text-white text-xs px-4 py-2 rounded-lg disabled:opacity-40 font-medium"
            >
              <Send className="w-3 h-3" /> {postMutation.isPending ? "Posting…" : "Post"}
            </button>
          </div>
          {postMutation.isError && (
            <div className="flex items-center justify-between text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
              <span className="truncate">{postMutation.error?.message || "Failed to post note."}</span>
              <button
                onClick={() => postMutation.mutate()}
                disabled={!content.trim() || postMutation.isPending}
                className="text-red-700 font-semibold hover:underline ml-2 flex-shrink-0"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}