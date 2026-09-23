import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Link2, PenLine, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";

// Platform detection config
const PLATFORMS = [
  {
    id: "airbnb",
    name: "Airbnb",
    pattern: /airbnb\.com\/rooms\/\d+/i,
    warningPattern: /airbnb\.com(?!\/rooms)/i,
    icon: "🏠",
    color: "text-rose-600",
  },
  {
    id: "vrbo",
    name: "VRBO",
    pattern: /vrbo\.com\/\d+/i,
    warningPattern: /vrbo\.com(?!\/\d)/i,
    icon: "🏡",
    color: "text-blue-600",
  },
  {
    id: "homeaway",
    name: "HomeAway",
    pattern: /homeaway\.com\/.+\/p\d+/i,
    warningPattern: /homeaway\.com/i,
    icon: "🏘️",
    color: "text-green-700",
  },
  {
    id: "booking",
    name: "Booking.com",
    pattern: /booking\.com\/hotel\//i,
    warningPattern: /booking\.com/i,
    icon: "🔵",
    color: "text-blue-700",
  },
  {
    id: "tripadvisor",
    name: "TripAdvisor",
    pattern: /tripadvisor\.com\/VacationRentalReview/i,
    warningPattern: /tripadvisor\.com/i,
    icon: "🦉",
    color: "text-green-600",
  },
];

function detectPlatform(url) {
  if (!url) return null;
  for (const p of PLATFORMS) {
    if (p.pattern.test(url)) return { ...p, confidence: "listing" };
    if (p.warningPattern.test(url)) return { ...p, confidence: "uncertain" };
  }
  // Generic URL check
  try {
    new URL(url);
    return { id: "other", name: "Direct booking site", icon: "🌐", color: "text-slate-600", confidence: "listing" };
  } catch {
    return null;
  }
}

function validateUrl(val) {
  if (!val.trim()) return "empty";
  try {
    const u = new URL(val.trim());
    if (!["http:", "https:"].includes(u.protocol)) return "invalid";
    return "valid";
  } catch {
    return "invalid";
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url.trim().toLowerCase());
    u.search = "";
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "");
    return u.hostname + path;
  } catch {
    return url.trim().toLowerCase();
  }
}

export default function Step1PasteUrl({ onContinue, onManualEntry }) {
  const [url, setUrl] = useState("");
  const [duplicateCheck, setDuplicateCheck] = useState(null); // null | "checking" | { type, record } | "none"
  const duplicateTimer = useRef(null);

  const urlStatus = validateUrl(url);
  const platform = url ? detectPlatform(url) : null;

  // Run duplicate check when URL becomes valid
  useEffect(() => {
    if (urlStatus !== "valid") {
      setDuplicateCheck(null);
      return;
    }
    clearTimeout(duplicateTimer.current);
    setDuplicateCheck("checking");
    duplicateTimer.current = setTimeout(async () => {
      try {
        const normalized = normalizeUrl(url);
        const [submissions, properties] = await Promise.all([
          base44.entities.PropertySubmission.list("-created_date", 200),
          base44.entities.Property.list("-created_date", 200),
        ]);
        const submissionMatch = submissions.find(s => {
          if (!s.listing_url) return false;
          return normalizeUrl(s.listing_url) === normalized && s.status !== "rejected";
        });
        if (submissionMatch) {
          setDuplicateCheck({ type: "submission", record: submissionMatch });
          return;
        }
        const propertyMatch = properties.find(p => {
          if (!p.listing_url) return false;
          return normalizeUrl(p.listing_url) === normalized;
        });
        if (propertyMatch) {
          setDuplicateCheck({ type: "property", record: propertyMatch });
          return;
        }
        setDuplicateCheck("none");
      } catch {
        setDuplicateCheck("none");
      }
    }, 600);
    return () => clearTimeout(duplicateTimer.current);
  }, [url, urlStatus]);

  const canContinue = urlStatus === "valid" && duplicateCheck !== "checking";

  return (
    <div>
      <div className="mb-8">
        <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">New Submission</div>
        <h1 className="text-2xl font-light text-[#0D1B2A] tracking-tight">Submit a Property</h1>
        <p className="text-slate-500 text-sm mt-2">Paste your listing URL — our AI will extract and refine all the details.</p>
      </div>

      {/* URL Input Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 mb-4">
        <div className="mb-5">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide block mb-2">Listing URL</label>
          <div className="relative">
            <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="url"
              placeholder="Paste Airbnb, VRBO, or direct booking URL…"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && canContinue && onContinue(url)}
              autoFocus
              className={`w-full pl-10 pr-10 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all placeholder-slate-300 bg-slate-50 ${
                urlStatus === "invalid"
                  ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                  : urlStatus === "valid"
                    ? "border-emerald-300 focus:ring-emerald-100 focus:border-emerald-400"
                    : "border-slate-200 focus:ring-[#C9A96E]/30 focus:border-[#C9A96E]"
              }`}
            />
            {/* Status icon */}
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {urlStatus === "invalid" && url && <XCircle className="w-4 h-4 text-red-400" />}
              {urlStatus === "valid" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </div>
          </div>

          {/* Platform detection */}
          {platform && urlStatus === "valid" && (
            <div className={`flex items-center gap-2 mt-2 text-xs ${platform.confidence === "listing" ? "text-slate-600" : "text-amber-600"}`}>
              <span>{platform.icon}</span>
              <span className={platform.color}>{platform.name}</span>
              {platform.confidence === "uncertain" && (
                <>
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-amber-600">This might be a profile or search page — a specific listing URL works best.</span>
                </>
              )}
              {platform.confidence === "listing" && (
                <span className="text-slate-400">listing detected</span>
              )}
            </div>
          )}
          {urlStatus === "invalid" && url && (
            <p className="text-xs text-red-500 mt-1.5">That doesn't look like a valid URL. Please paste a full listing link.</p>
          )}
        </div>

        {/* Duplicate warning */}
        {duplicateCheck === "checking" && (
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-4 bg-slate-50 rounded-xl px-4 py-2.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Checking for existing submissions…
          </div>
        )}
        {duplicateCheck && duplicateCheck !== "checking" && duplicateCheck !== "none" && duplicateCheck.type === "submission" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-800">
            <div className="font-medium mb-1">⚠ We already have a submission for this property</div>
            <div className="mb-2 text-amber-700">{duplicateCheck.record.property_name || "Untitled property"} — status: <span className="font-medium capitalize">{duplicateCheck.record.status}</span></div>
            <div className="flex gap-3">
              <a href="/portal/properties" className="underline text-amber-800 hover:text-amber-900">View existing submissions</a>
              <span className="text-amber-400">or</span>
              <button onClick={() => onContinue(url)} className="underline text-amber-800 hover:text-amber-900">Continue with new submission anyway</button>
            </div>
          </div>
        )}
        {duplicateCheck && duplicateCheck !== "checking" && duplicateCheck !== "none" && duplicateCheck.type === "property" && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-xs text-blue-800">
            <div className="font-medium mb-1">This appears to match an existing property</div>
            <div className="mb-2 text-blue-700">{duplicateCheck.record.property_name || "Untitled property"}</div>
            <div className="flex gap-3">
              <a href="/portal/properties" className="underline text-blue-800 hover:text-blue-900">Edit it instead</a>
              <span className="text-blue-400">or</span>
              <button onClick={() => onContinue(url)} className="underline text-blue-800 hover:text-blue-900">Continue with new submission anyway</button>
            </div>
          </div>
        )}

        <button
          onClick={() => onContinue(url)}
          disabled={!canContinue}
          className="w-full flex items-center justify-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium py-3 rounded-xl hover:bg-[#1a2e45] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Continue — Import Property
        </button>

        <p className="text-[11px] text-slate-400 mt-3 text-center">
          Supported: Airbnb, VRBO, HomeAway, Booking.com, and direct booking sites
        </p>
      </div>

      {/* Manual Option */}
      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-xl border border-slate-200 flex items-center justify-center">
            <PenLine className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-[#0D1B2A]">Enter Manually</div>
            <div className="text-xs text-slate-400">Skip import and fill out the form directly</div>
          </div>
        </div>
        <button
          onClick={onManualEntry}
          className="text-sm text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-white transition-colors"
        >
          Skip to form
        </button>
      </div>
    </div>
  );
}