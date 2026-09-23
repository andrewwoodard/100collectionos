import React from "react";
import { Sparkles, UserCheck, AlertCircle } from "lucide-react";

const CONFIG = {
  high:    { label: "AI Imported",       icon: Sparkles,    cls: "bg-blue-50 text-blue-600 border-blue-200" },
  medium:  { label: "AI Imported",       icon: Sparkles,    cls: "bg-blue-50 text-blue-600 border-blue-200" },
  low:     { label: "Needs Review",      icon: AlertCircle, cls: "bg-amber-50 text-amber-600 border-amber-200" },
  verified:{ label: "Partner Verified",  icon: UserCheck,   cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  missing: { label: "Missing",           icon: AlertCircle, cls: "bg-red-50 text-red-600 border-red-200" },
};

export default function ConfidenceBadge({ level = "high" }) {
  const c = CONFIG[level] || CONFIG.high;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border ${c.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {c.label}
    </span>
  );
}