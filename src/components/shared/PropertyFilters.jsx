import React, { useState } from "react";
import { Search, X, SlidersHorizontal, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const PROPERTY_TYPES = ["villa", "apartment", "house", "condo", "estate", "cabin", "other"];
const ONBOARDING_STATUSES = ["not_started", "in_progress", "complete"];
const PHOTO_STATUSES = ["not_started", "scheduled", "completed", "approved"];
const BEDROOM_OPTIONS = ["1", "2", "3", "4", "5", "6+"];

export default function PropertyFilters({ partners = [], onChange, showArchived = false, onShowArchivedChange, hideStatusAndArchived = false }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [partnerId, setPartnerId] = useState("all");
  const [partnerName, setPartnerName] = useState("all");
  const [propertyType, setPropertyType] = useState("all");
  const [onboardingStatus, setOnboardingStatus] = useState("all");
  const [photoStatus, setPhotoStatus] = useState("all");
  const [minBedrooms, setMinBedrooms] = useState("all");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const emit = (overrides) => {
    const filters = { search, status, partnerId, partnerName, propertyType, onboardingStatus, photoStatus, minBedrooms, ...overrides };
    onChange(filters);
  };

  const update = (key, value, setter) => {
    setter(value);
    emit({ [key]: value });
  };

  const activeCount = [status, partnerId, propertyType, onboardingStatus, photoStatus, minBedrooms].filter(v => v !== "all").length + (search ? 1 : 0);

  const reset = () => {
    setSearch(""); setStatus("all"); setPartnerId("all"); setPartnerName("all"); setPropertyType("all");
    setOnboardingStatus("all"); setPhotoStatus("all"); setMinBedrooms("all");
    onChange({ search: "", status: "all", partnerId: "all", partnerName: "all", propertyType: "all", onboardingStatus: "all", photoStatus: "all", minBedrooms: "all" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, market, address..."
            className="pl-9 bg-white"
            value={search}
            onChange={e => update("search", e.target.value, setSearch)}
          />
        </div>
        <Select value={partnerId} onValueChange={v => {
          const selected = partners.find(p => p.id === v);
          setPartnerId(v);
          setPartnerName(selected?.partner_name || "all");
          emit({ partnerId: v, partnerName: selected?.partner_name || "all" });
        }}>
          <SelectTrigger className="w-52 bg-white"><SelectValue placeholder="Filter by Partner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {[...partners].sort((a, b) => {
              const na = (a.partner_name || "").trim().toLowerCase();
              const nb = (b.partner_name || "").trim().toLowerCase();
              return na < nb ? -1 : na > nb ? 1 : 0;
            }).map(p => <SelectItem key={p.id} value={p.id}>{(p.partner_name || "").trim()}</SelectItem>)}
          </SelectContent>
        </Select>
        {!hideStatusAndArchived && (
          <Select value={status} onValueChange={v => update("status", v, setStatus)}>
            <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!hideStatusAndArchived && (
          <button
            onClick={() => onShowArchivedChange(!showArchived)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all h-10 ${showArchived ? "bg-slate-800 text-white border-slate-800" : "border-gray-200 text-gray-500 hover:border-gray-400 bg-white"}`}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 bg-white h-10"
          onClick={() => setShowAdvanced(v => !v)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeCount > 0 && <Badge className="bg-[#C9A96E] text-white text-xs px-1.5 py-0">{activeCount}</Badge>}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600 h-10" onClick={reset}>
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {showAdvanced && (
        <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <Select value={propertyType} onValueChange={v => update("propertyType", v, setPropertyType)}>
            <SelectTrigger className="w-44 bg-white text-sm"><SelectValue placeholder="Property Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={minBedrooms} onValueChange={v => update("minBedrooms", v, setMinBedrooms)}>
            <SelectTrigger className="w-44 bg-white text-sm"><SelectValue placeholder="Min Bedrooms" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Bedrooms</SelectItem>
              {BEDROOM_OPTIONS.map(b => <SelectItem key={b} value={b}>{b === "6+" ? "6+ bedrooms" : `${b}+ bedrooms`}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={onboardingStatus} onValueChange={v => update("onboardingStatus", v, setOnboardingStatus)}>
            <SelectTrigger className="w-48 bg-white text-sm"><SelectValue placeholder="Onboarding Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Onboarding</SelectItem>
              {ONBOARDING_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={photoStatus} onValueChange={v => update("photoStatus", v, setPhotoStatus)}>
            <SelectTrigger className="w-48 bg-white text-sm"><SelectValue placeholder="Photography Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Photography</SelectItem>
              {PHOTO_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}