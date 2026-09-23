import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import PortalStatusBadge from "../../components/portal/PortalStatusBadge";
import WelcomeWizard from "../../components/portal/WelcomeWizard";
import { Home, Clock, CheckCircle, AlertCircle, PlusCircle, ArrowRight, Building2, TrendingUp, Calendar, User, UserPlus } from "lucide-react";
import { getEffectiveRole, ROLE_LABELS } from "@/lib/partnerRoles";
import { usePortalPartnerRollup } from "@/hooks/usePortalPartnerRollup";
import { useCurrentUser } from "@/lib/useCurrentUser";
import PropertyThumbnail from "@/components/properties/PropertyThumbnail";
import { getImageUrl } from "@/lib/imageUrl";

const FUNNEL_CHIP = {
  approved:   "bg-slate-100 text-slate-600",
  contracted: "bg-blue-50 text-blue-700",
  content:    "bg-purple-50 text-purple-700",
  build:      "bg-amber-50 text-amber-700",
  listed:     "bg-emerald-50 text-emerald-700",
};

export default function PortalDashboard() {
  const { user } = useCurrentUser();
  const [showWizard, setShowWizard] = useState(false);

  const { data: submissions = [], isLoading: loadingSubmissions } = useQuery({
    queryKey: ["my-submissions", user?.email],
    queryFn: () => base44.entities.PropertySubmission.filter({ partner_email: user.email }),
    enabled: !!user?.email,
  });

  const { data: notifications = [], isLoading: loadingNotifications } = useQuery({
    queryKey: ["my-notifications", user?.email],
    queryFn: () => base44.entities.PortalNotification.filter({ recipient_email: user.email, is_read: false }),
    enabled: !!user?.email,
  });

  const { data: partnerRecords = [] } = useQuery({
    queryKey: ["my-partner-record-dashboard", user?.id],
    queryFn: () => base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } }),
    enabled: !!user?.id,
    staleTime: 0,
  });
  const partner = partnerRecords[0];

  // Rollup: find parent + sub-brand partner names for license/property queries
  const { visiblePartnerNames } = usePortalPartnerRollup(user);

  // First-login onboarding: show the popup when the partner has never
  // completed onboarding (onboarding_shown_at is null). The flag is persisted
  // server-side on the Partner record so it only fires once across all
  // devices and browsers — not tied to partner creation date.
  useEffect(() => {
    if (!user || !partner) return;
    const flagKey = `wizard_dismissed_${user.email}`;
    if (localStorage.getItem(flagKey)) return; // session guard
    if (partner.onboarding_shown_at) return;    // already onboarded
    setShowWizard(true);
  }, [user, partner]);

  const dismissWizard = async () => {
    if (user?.email) localStorage.setItem(`wizard_dismissed_${user.email}`, "1");
    setShowWizard(false);
    // Persist server-side so the wizard never reappears on other devices
    if (partner?.id && !partner.onboarding_shown_at) {
      try {
        await base44.entities.Partner.update(partner.id, {
          onboarding_shown_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("Could not persist onboarding_shown_at:", e.message);
      }
    }
  };

  const { data: activeLicenses = [] } = useQuery({
    queryKey: ["my-active-licenses-dashboard", visiblePartnerNames.join(",")],
    queryFn: async () => {
      if (visiblePartnerNames.length === 0) return [];
      const all = await base44.entities.LicenseRecord.list();
      const nameSet = new Set(visiblePartnerNames);
      return all.filter(l => nameSet.has(l.partner_name) && l.license_status === "active");
    },
    enabled: visiblePartnerNames.length > 0,
  });

  // Fetch linked Properties (active portfolio properties) — these were submitted and approved
  const { data: linkedProperties = [] } = useQuery({
    queryKey: ["my-linked-properties-dashboard", visiblePartnerNames.join(",")],
    queryFn: async () => {
      if (visiblePartnerNames.length === 0) return [];
      const all = await base44.entities.Property.filter({ partner_name: { $in: visiblePartnerNames } });
      return all.filter(p => !p.archived_at);
    },
    enabled: visiblePartnerNames.length > 0,
  });
  const activePropertyCount = linkedProperties.filter(p => p.status === "active").length;

  const effectiveRole = getEffectiveRole(user);
  const showRecentActivity = effectiveRole === "owner" || effectiveRole === "operations";

  const { data: teamActivity = [] } = useQuery({
    queryKey: ["team-activity", partner?.id],
    queryFn: () => base44.entities.PartnerInvitation.filter({ partner_id: partner?.id, status: "accepted" }),
    enabled: !!partner?.id && showRecentActivity,
  });

  const recentTeamJoins = [...teamActivity]
    .sort((a, b) => new Date(b.accepted_at || b.updated_date) - new Date(a.accepted_at || a.updated_date))
    .slice(0, 5);

  const stats = {
    total: submissions.length + activePropertyCount,
    under_review: submissions.filter(s => ["submitted", "under_review"].includes(s.status)).length,
    approved: submissions.filter(s => ["approved", "licensed", "active"].includes(s.status)).length + activePropertyCount,
    needs_revision: submissions.filter(s => s.status === "needs_revision").length,
  };

  const recent = [...submissions].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5);

  // Fallback: when no submissions exist, show active portfolio properties
  const recentActiveProperties = [...linkedProperties]
    .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))
    .slice(0, 5);

  // Partner since formatting — only show when member_since is set
  const partnerSince = (() => {
    const d = partner?.member_since;
    if (!d) return null;
    const date = new Date(d);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    // More than 2 years ago → just the year; otherwise Month Year
    if (date < twoYearsAgo) {
      return String(date.getFullYear());
    }
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  })();

  // Contact
  const contact = partner?.assigned_internal_owner;
  const isEmail = contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);

  return (
    <PortalLayout>
      {showWizard && <WelcomeWizard user={user} onDismiss={dismissWizard} />}
      {/* Header */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Welcome back</div>
        <h1 className="text-2xl font-light text-[#0D1B2A] tracking-tight">
          {user?.full_name || "Partner"} <span className="text-slate-400">— Partner Dashboard</span>
        </h1>
      </div>

      {/* Relationship Card */}
      {partner && (
        <div className="bg-[#0D1B2A] rounded-2xl border border-[#C9A96E]/20 shadow-md p-5 mb-6">
          <div className="text-[10px] font-semibold text-[#C9A96E]/70 uppercase tracking-widest mb-4">Your Relationship</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Active Licenses</div>
              <div className="text-2xl font-light text-white">{activeLicenses.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Funnel Stage</div>
              {partner.funnel_stage ? (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${FUNNEL_CHIP[partner.funnel_stage] || "bg-slate-100 text-slate-600"}`}>
                  {partner.funnel_stage.charAt(0).toUpperCase() + partner.funnel_stage.slice(1)}
                </span>
              ) : (
                <span className="text-slate-500 text-sm">—</span>
              )}
            </div>
            {partnerSince && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Partner Since</div>
                <div className="text-sm text-white font-light">Since {partnerSince}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Your Contact</div>
              {contact ? (
                isEmail ? (
                  <a href={`mailto:${contact}`} className="text-[#C9A96E] text-xs hover:underline">{contact}</a>
                ) : (
                  <span className="text-sm text-white font-light">{contact}</span>
                )
              ) : (
                <a href="mailto:support@100collection.com" className="text-[#C9A96E] text-xs hover:underline">Reach out to support</a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Submitted", value: stats.total, icon: Home, color: "text-slate-600", bg: "bg-slate-50" },
          { label: "Under Review", value: stats.under_review, icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Approved", value: stats.approved, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Needs Revision", value: stats.needs_revision, icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div className="text-2xl font-light text-[#0D1B2A] mb-0.5">{stat.value}</div>
            <div className="text-xs text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Onboarding progress — hidden once partner is listed */}
      {partner && partner.funnel_stage && partner.funnel_stage !== 'listed' && (
        <div className="mb-6 bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
          <h2 className="font-medium text-[#0D1B2A] text-sm mb-4">Your Onboarding Progress</h2>
          <div className="flex items-center gap-1">
            {['approved','contracted','content','build','listed'].map((stage, i) => {
              const stages = ['approved','contracted','content','build','listed'];
              const currentIdx = stages.indexOf(partner.funnel_stage);
              const isFilled = i < currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <React.Fragment key={stage}>
                  {i > 0 && <div className={`flex-1 h-0.5 ${i <= currentIdx ? 'bg-[#C9A96E]' : 'bg-slate-100'}`} />}
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                    isCurrent ? 'bg-[#C9A96E] text-white' :
                    isFilled  ? 'bg-[#C9A96E]/20 text-[#C9A96E]' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {stage.charAt(0).toUpperCase() + stage.slice(1)}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">Complete all tasks in the current stage to advance to Listed.</p>
        </div>
      )}

      {/* Recent Activity */}
      {showRecentActivity && recentTeamJoins.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
          <h2 className="font-medium text-[#0D1B2A] text-sm mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentTeamJoins.map(inv => (
              <div key={inv.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#C9A96E]/10 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-4 h-4 text-[#C9A96E]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#0D1B2A]">
                    <span className="font-medium">{inv.email}</span> joined your team as {ROLE_LABELS[inv.partner_role] || inv.partner_role}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {inv.accepted_at ? new Date(inv.accepted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Properties */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
            <h2 className="font-medium text-[#0D1B2A] text-sm">Recent Properties</h2>
            <Link to="/portal/properties" className="text-xs text-[#C9A96E] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingSubmissions ? (
            <div className="divide-y divide-slate-50">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                  <div className="w-12 h-10 rounded-lg bg-slate-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-slate-100 rounded w-2/5" />
                    <div className="h-3 bg-slate-50 rounded w-1/4" />
                  </div>
                  <div className="w-16 h-5 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 && recentActiveProperties.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {recentActiveProperties.map(prop => (
                <Link key={prop.id} to={`/portal/properties/${prop.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors">
                  <PropertyThumbnail
                    listingUrl={prop.listing_url}
                    fallbackUrl={prop.photo_urls?.[0]}
                    icon={Building2}
                    className="w-12 h-10 rounded-lg flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-[#0D1B2A] truncate">{prop.property_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{prop.address || prop.market}</div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${prop.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {prop.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Home className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm mb-4">No properties submitted yet</p>
              <Link to="/portal/add-property" className="inline-flex items-center gap-2 bg-[#0D1B2A] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#1a2e45] transition-colors">
                <PlusCircle className="w-4 h-4" /> Add your first property
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recent.map(sub => (
                <Link key={sub.id} to={`/portal/properties/${sub.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors">
                  {sub.photo_urls?.[0] ? (
                    <img src={getImageUrl(sub.photo_urls[0], "thumb")} className="w-12 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
                  ) : (
                    <div className="w-12 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Home className="w-4 h-4 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-[#0D1B2A] truncate">{sub.property_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{sub.location_full || sub.location_city}</div>
                  </div>
                  <PortalStatusBadge status={sub.status} size="sm" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
            <h2 className="font-medium text-[#0D1B2A] text-sm">Notifications</h2>
            {notifications.length > 0 && (
              <span className="bg-[#C9A96E] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{notifications.length}</span>
            )}
          </div>
          {loadingNotifications ? (
            <div className="divide-y divide-slate-50">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-6 py-4 animate-pulse space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-50 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-slate-400 text-sm">All caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto">
              {notifications.map(n => (
                <div key={n.id} className="px-6 py-4">
                  <div className="text-xs font-medium text-[#0D1B2A] mb-1">{n.title}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{n.message}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5">{new Date(n.created_date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick action */}
      <div className="mt-6 bg-[#0D1B2A] rounded-2xl p-6 flex items-center justify-between">
        <div>
          <div className="text-[#C9A96E] text-xs font-semibold uppercase tracking-widest mb-1">Ready to expand your portfolio?</div>
          <div className="text-white font-light text-lg">Submit a new property to The 100 Collection</div>
        </div>
        <Link to="/portal/add-property" className="flex-shrink-0 flex items-center gap-2 bg-[#C9A96E] text-[#0D1B2A] font-medium text-sm px-5 py-2.5 rounded-xl hover:bg-[#b8935a] transition-colors">
          <PlusCircle className="w-4 h-4" /> Add Property
        </Link>
      </div>
    </PortalLayout>
  );
}