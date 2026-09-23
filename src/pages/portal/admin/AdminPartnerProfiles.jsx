import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { UserCircle, CheckCircle, XCircle, Eye, Search } from "lucide-react";
import { toast } from "sonner";

const STATUS_FILTERS = ["all", "submitted", "published", "draft"];

const STATUS_STYLES = {
  draft:     { cls: "bg-slate-100 text-slate-600",    label: "Draft" },
  submitted: { cls: "bg-amber-50 text-amber-700",     label: "Submitted" },
  published: { cls: "bg-emerald-50 text-emerald-700", label: "Published" },
};

export default function AdminPartnerProfiles() {
  const [filter, setFilter] = useState("submitted");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null);
  const qc = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["all-partner-profiles"],
    queryFn: () => base44.entities.PartnerProfile.list("-created_date", 200),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PartnerProfile.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries(["all-partner-profiles"]);
      toast.success("Profile updated");
    },
  });

  const filtered = profiles.filter(p => {
    const matchStatus = filter === "all" || p.profile_status === filter;
    const matchSearch = !search ||
      p.partner_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.partner_email?.toLowerCase().includes(search.toLowerCase()) ||
      p.market?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = {
    submitted: profiles.filter(p => p.profile_status === "submitted").length,
    published: profiles.filter(p => p.profile_status === "published").length,
  };

  return (
    <div>
      {/* Back button */}
      <Link to="/admin/hub" className="text-slate-400 hover:text-[#0D1B2A] mb-6 inline-flex items-center gap-2">
        <ChevronLeft className="w-4 h-4" /> Back to Hub
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Profiles", value: profiles.length, color: "text-slate-600", bg: "bg-slate-50" },
          { label: "Awaiting Review", value: counts.submitted, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Published", value: counts.published, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className={`text-2xl font-light ${s.color} mb-1`}>{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search profiles…"
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white w-52" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-all ${filter === s ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <UserCircle className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No profiles in this category</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(profile => {
              const st = STATUS_STYLES[profile.profile_status] || STATUS_STYLES.draft;
              return (
                <div key={profile.id} className="px-6 py-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    {profile.profile_photo_url ? (
                      <img src={profile.profile_photo_url} className="w-12 h-12 rounded-full object-cover flex-shrink-0" alt="" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#0D1B2A]/5 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#0D1B2A] font-semibold text-sm">{profile.display_name?.[0] || profile.partner_name?.[0] || "?"}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="font-medium text-sm text-[#0D1B2A]">{profile.display_name || profile.partner_name || "—"}</span>
                        {profile.title && <span className="text-xs text-slate-400">{profile.title}</span>}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="text-xs text-slate-500 mb-1">{profile.partner_email} {profile.company_name && `· ${profile.company_name}`}</div>
                      {profile.market && <div className="text-xs text-slate-400">📍 {profile.market}</div>}
                      {profile.about_bio && (
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">{profile.about_bio}</p>
                      )}
                      <div className="text-[10px] text-slate-300 mt-1.5">Submitted {new Date(profile.updated_date).toLocaleDateString()}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setPreview(preview?.id === profile.id ? null : profile)}
                        className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </button>
                      {profile.profile_status === "submitted" && (
                        <>
                          <button onClick={() => updateMut.mutate({ id: profile.id, data: { profile_status: "draft" } })}
                            className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                            <XCircle className="w-3.5 h-3.5" /> Request Changes
                          </button>
                          <button onClick={() => updateMut.mutate({ id: profile.id, data: { profile_status: "published" } })}
                            className="flex items-center gap-1.5 text-xs text-white bg-[#0D1B2A] px-3 py-1.5 rounded-lg hover:bg-[#1a2e45] transition-colors">
                            <CheckCircle className="w-3.5 h-3.5" /> Publish
                          </button>
                        </>
                      )}
                      {profile.profile_status === "published" && (
                        <button onClick={() => updateMut.mutate({ id: profile.id, data: { profile_status: "draft" } })}
                          className="text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                          Unpublish
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Preview Panel */}
                  {preview?.id === profile.id && (
                    <div className="mt-4 ml-16 border border-slate-100 rounded-xl bg-slate-50 p-5 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide mb-2 font-semibold">Bio</div>
                        <p className="text-slate-600 text-xs leading-relaxed">{profile.about_bio || "—"}</p>
                      </div>
                      <div className="space-y-2">
                        <ProfileField label="Restaurants" value={profile.favorite_restaurants} />
                        <ProfileField label="Breweries" value={profile.favorite_breweries} />
                        <ProfileField label="Bakery / Cafe" value={profile.favorite_bakery} />
                        <ProfileField label="Shops" value={profile.favorite_shops} />
                        <ProfileField label="Things to Do" value={profile.favorite_things_to_do} />
                        <ProfileField label="Website" value={profile.website_url} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{label}: </span>
      <span className="text-xs text-slate-600">{value}</span>
    </div>
  );
}