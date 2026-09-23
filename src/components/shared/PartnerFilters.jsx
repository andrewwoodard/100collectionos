import React, { useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUSES = ["lead", "vetting", "approved", "onboarding", "live", "paused", "inactive"];
const PARTNER_TYPES = ["property_manager", "owner", "developer", "hospitality_group", "other"];
const CONTRACT_STATUSES = ["none", "draft", "sent", "signed", "expired"];
const REGIONS = ["Southeast", "Northeast", "Mid-Atlantic", "Southwest", "Mountain West", "West", "Pacific Northwest", "Pacific", "Midwest", "International"];

export default function PartnerFilters({ onChange }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [partnerType, setPartnerType] = useState("all");
  const [region, setRegion] = useState("all");
  const [contractStatus, setContractStatus] = useState("all");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const emit = (overrides) => {
    const filters = { search, status, partnerType, region, contractStatus, ...overrides };
    onChange(filters);
  };

  const update = (key, value, setter) => {
    setter(value);
    emit({ [key]: value });
  };

  const activeCount = [status, partnerType, region, contractStatus].filter(v => v !== "all").length + (search ? 1 : 0);

  const reset = () => {
    setSearch(""); setStatus("all"); setPartnerType("all"); setRegion("all"); setContractStatus("all");
    onChange({ search: "", status: "all", partnerType: "all", region: "all", contractStatus: "all" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, company, market..."
            className="pl-9 bg-white"
            value={search}
            onChange={e => update("search", e.target.value, setSearch)}
          />
        </div>
        <Select value={status} onValueChange={v => update("status", v, setStatus)}>
          <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
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
          <Select value={partnerType} onValueChange={v => update("partnerType", v, setPartnerType)}>
            <SelectTrigger className="w-48 bg-white text-sm"><SelectValue placeholder="Partner Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PARTNER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={v => update("region", v, setRegion)}>
            <SelectTrigger className="w-48 bg-white text-sm"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractStatus} onValueChange={v => update("contractStatus", v, setContractStatus)}>
            <SelectTrigger className="w-48 bg-white text-sm"><SelectValue placeholder="Contract Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contracts</SelectItem>
              {CONTRACT_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}