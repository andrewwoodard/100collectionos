import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import AdminReviewModal from "@/components/admin/AdminReviewModal";

const SEGMENT_LABELS = {
  all: "All",
  property_manager: "Manager",
  homeowner: "Owner",
  existing_partner: "Existing",
};

export default function AdminReviews({ embedded = false }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["partner-reviews-admin"],
    queryFn: () => base44.entities.PartnerReview.list("display_order", 200),
  });

  const sorted = [...reviews].sort(
    (a, b) => (a.display_order || 0) - (b.display_order || 0)
  );

  const toggleFeatured = async (r) => {
    await base44.entities.PartnerReview.update(r.id, { is_featured: !r.is_featured });
    qc.invalidateQueries(["partner-reviews-admin"]);
  };

  const handleDelete = async (r) => {
    if (!confirm("Delete this review?")) return;
    await base44.entities.PartnerReview.delete(r.id);
    qc.invalidateQueries(["partner-reviews-admin"]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Content</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Partner Reviews</h1>
          <p className="text-slate-400 text-sm mt-1">
            Featured reviews appear on /join, filtered by segment.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-sm bg-[#0D1B2A] text-white px-4 py-2 rounded-lg hover:bg-[#1a2e45]"
        >
          <Plus className="w-4 h-4" /> Add review
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-sm">
            No reviews yet. Add one to see it on /join.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_0.7fr_0.7fr_auto] gap-4 px-6 py-3 bg-slate-50/70 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              <span>Quote</span>
              <span>Name</span>
              <span>Company</span>
              <span>Segment</span>
              <span>Featured</span>
              <span />
            </div>
            {sorted.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_0.7fr_0.7fr_auto] gap-4 px-6 py-4 items-center"
              >
                <div className="text-sm text-[#0D1B2A] font-serif italic truncate" title={r.quote}>
                  {r.quote}
                </div>
                <div className="text-sm text-slate-600">{r.attribution_name}</div>
                <div className="text-xs text-slate-500 truncate">{r.attribution_company || "—"}</div>
                <div className="text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {SEGMENT_LABELS[r.segment] || r.segment}
                  </span>
                </div>
                <div>
                  <button
                    onClick={() => toggleFeatured(r)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                      r.is_featured
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-white text-slate-400 border-slate-200"
                    }`}
                  >
                    <Star
                      className={`w-3 h-3 ${r.is_featured ? "fill-amber-400 text-amber-500" : ""}`}
                    />
                    {r.is_featured ? "Yes" : "No"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(r);
                      setModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#C9A96E] hover:border-[#C9A96E]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(r)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminReviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => qc.invalidateQueries(["partner-reviews-admin"])}
        review={editing}
      />
    </div>
  );
}