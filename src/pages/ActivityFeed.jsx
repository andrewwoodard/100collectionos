import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import {
  Activity, Users, Building2, CreditCard, Briefcase, Bell, CheckCircle2, XCircle, FileEdit
} from "lucide-react";
import EmptyState from "../components/shared/EmptyState";
import { fetchActivityFeed } from "@/lib/activityFeed";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "applications", label: "Applications" },
  { key: "properties", label: "Properties" },
  { key: "billing", label: "Billing" },
  { key: "careers", label: "Careers" },
  { key: "updates", label: "Updates" },
];

const typeMeta = {
  submitted: { icon: Building2, tone: "bg-sky-50 text-sky-700" },
  approved: { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  licensed: { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  rejected: { icon: XCircle, tone: "bg-rose-50 text-rose-700" },
  needs_revision: { icon: FileEdit, tone: "bg-amber-50 text-amber-700" },
  under_review: { icon: FileEdit, tone: "bg-amber-50 text-amber-700" },
  billed: { icon: CreditCard, tone: "bg-emerald-50 text-emerald-700" },
  job_posting: { icon: Briefcase, tone: "bg-violet-50 text-violet-700" },
  general: { icon: Bell, tone: "bg-[#F8F1E3] text-[#8C7340]" },
  audit: { icon: Activity, tone: "bg-slate-100 text-slate-600" },
};

const categoryIcon = {
  applications: Users,
  properties: Building2,
  billing: CreditCard,
  careers: Briefcase,
  updates: Bell,
};

function dayLabel(date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

export default function ActivityFeed() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: fetchActivityFeed,
  });

  const items = data?.items || [];
  const visible = filter === "all" ? items : items.filter((item) => item.category === filter);
  const availableFilters = FILTERS.filter((option) => option.key === "all" || items.some((item) => item.category === option.key));

  const groups = useMemo(() => {
    const buckets = [];
    for (const item of visible) {
      const date = item.at ? new Date(item.at) : null;
      const label = date && !Number.isNaN(date.getTime()) ? dayLabel(date) : "Earlier";
      const last = buckets[buckets.length - 1];
      if (!last || last.label !== label) buckets.push({ label, items: [item] });
      else last.items.push(item);
    }
    return buckets;
  }, [visible]);

  return (
    <div className="max-w-3xl space-y-5 animate-fade-up">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Activity</h2>
        <p className="text-sm text-gray-500 mt-1">
          {data?.scope === "admin"
            ? "Applications, properties, and other updates across The 100 Collection."
            : "Updates about your properties and your partnership with The 100 Collection."}
        </p>
      </div>

      {availableFilters.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {availableFilters.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === option.key
                  ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="animate-shimmer h-14 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState icon={Activity} title="Activity couldn't load" description={error?.message || "Try again in a moment."} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={items.length === 0 ? "No activity yet" : "Nothing in this view"}
          description={
            items.length === 0
              ? data?.scope === "admin"
                ? "New applications and property updates will show up here."
                : "When something changes for your properties, it will show up here."
              : "Try another filter."
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">{group.label}</h3>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {group.items.map((item) => {
                  const meta = typeMeta[item.type] || { icon: categoryIcon[item.category] || Bell, tone: "bg-gray-100 text-gray-600" };
                  const Icon = meta.icon;
                  const when = item.at ? new Date(item.at) : null;
                  const validWhen = when && !Number.isNaN(when.getTime());
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.href}
                      onClick={() => item.href && navigate(item.href)}
                      className={`w-full text-left px-4 py-4 flex items-start gap-3 transition-colors ${
                        item.href ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-gray-900">
                            {item.unread && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#C9A96E] mr-2 align-middle" />}
                            {item.title}
                          </p>
                          {validWhen && (
                            <time className="text-[11px] text-gray-400 whitespace-nowrap pt-0.5" dateTime={when.toISOString()} title={format(when, "MMM d, yyyy · h:mm a")}>
                              {formatDistanceToNow(when, { addSuffix: true })}
                            </time>
                          )}
                        </div>
                        {item.message && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{item.message}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
