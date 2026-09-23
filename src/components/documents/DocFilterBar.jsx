import React, { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Calendar, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, subDays, startOfYear } from "date-fns";

const DOC_STATUSES = ["draft", "sent", "signed", "archived"];
const VISIBILITIES = ["internal", "partner_visible", "public"];

function TogglePill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
        active ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
      }`}
    >
      {label}
    </button>
  );
}

function MultiSelectPill({ label, options, selected, onToggle, onClear, nameKey = "name", idKey = "id" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = options.filter(o => (o[nameKey] || "").toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  const activeCount = selected.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
          activeCount > 0 ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
        }`}>
          {label}{activeCount > 0 ? `: ${activeCount} selected` : ""}
          {activeCount > 0 ? (
            <X className="w-3 h-3 ml-0.5" onClick={(e) => { e.stopPropagation(); onClear(); }} />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <Input
          placeholder={`Search ${label.toLowerCase()}…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="mb-2 h-7 text-xs"
        />
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.map(o => (
            <label key={o[idKey]} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selected.includes(o[idKey])}
                onChange={() => onToggle(o[idKey])}
                className="rounded border-gray-300"
              />
              {o[nameKey]}
            </label>
          ))}
          {filtered.length === 0 && <p className="text-xs text-gray-400 italic px-2 py-1">No results</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateRangePill({ dateFrom, dateTo, onChange }) {
  const [open, setOpen] = useState(false);
  const active = dateFrom || dateTo;

  const setQuick = (from, to) => onChange(from, to);

  const label = active
    ? `${dateFrom ? format(new Date(dateFrom), "MMM d") : "…"} – ${dateTo ? format(new Date(dateTo), "MMM d") : "…"}`
    : "Date range";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
          active ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
        }`}>
          <Calendar className="w-3 h-3" /> {label}
          {active && <X className="w-3 h-3 ml-0.5" onClick={(e) => { e.stopPropagation(); onChange(null, null); }} />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {[
            { label: "Today", from: format(new Date(), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
            { label: "Last 7 days", from: format(subDays(new Date(), 7), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
            { label: "Last 30 days", from: format(subDays(new Date(), 30), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
            { label: "This year", from: format(startOfYear(new Date()), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
          ].map(q => (
            <button key={q.label} onClick={() => setQuick(q.from, q.to)}
              className="px-2 py-0.5 rounded-full text-xs bg-slate-100 hover:bg-slate-200 text-gray-700 font-medium">
              {q.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">From</label>
            <input type="date" value={dateFrom || ""} onChange={e => onChange(e.target.value || null, dateTo)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">To</label>
            <input type="date" value={dateTo || ""} onChange={e => onChange(dateFrom, e.target.value || null)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function DocFilterBar({
  filters,
  onFiltersChange,
  partners,
  properties,
  allTags,
  allUploaders,
}) {
  const f = filters;

  const toggle = (key, value) => {
    const current = f[key] || [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    onFiltersChange({ ...f, [key]: next });
  };

  const multiToggle = (key, id) => {
    const current = f[key] || [];
    const next = current.includes(id) ? current.filter(v => v !== id) : [...current, id];
    onFiltersChange({ ...f, [key]: next });
  };

  const activeCount = [
    (f.statuses || []).length,
    (f.visibilities || []).length,
    (f.partnerIds || []).length,
    (f.propertyIds || []).length,
    (f.uploaders || []).length,
    (f.tags || []).length,
    f.dateFrom || f.dateTo ? 1 : 0,
    f.driveOnly ? 1 : 0,
    f.unattributed ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearAll = () => onFiltersChange({});

  const partnerOptions = partners.map(p => ({ id: p.id, name: p.partner_name }));
  const propertyOptions = properties.map(p => ({ id: p.id, name: p.property_name }));
  const uploaderOptions = allUploaders.map(u => ({ id: u, name: u.includes("@") ? u.split("@")[0] : u }));
  const tagOptions = allTags.map(t => ({ id: t, name: t }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />

        {/* Status pills */}
        {DOC_STATUSES.map(s => (
          <TogglePill
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            active={(f.statuses || []).includes(s)}
            onClick={() => toggle("statuses", s)}
          />
        ))}

        <div className="w-px h-4 bg-gray-200" />

        {/* Visibility pills */}
        {VISIBILITIES.map(v => (
          <TogglePill
            key={v}
            label={v === "partner_visible" ? "Partner" : v.charAt(0).toUpperCase() + v.slice(1)}
            active={(f.visibilities || []).includes(v)}
            onClick={() => toggle("visibilities", v)}
          />
        ))}

        <div className="w-px h-4 bg-gray-200" />

        {/* Multi-select dropdowns */}
        <MultiSelectPill
          label="Partner"
          options={partnerOptions}
          selected={f.partnerIds || []}
          onToggle={(id) => multiToggle("partnerIds", id)}
          onClear={() => onFiltersChange({ ...f, partnerIds: [] })}
        />
        <MultiSelectPill
          label="Property"
          options={propertyOptions}
          selected={f.propertyIds || []}
          onToggle={(id) => multiToggle("propertyIds", id)}
          onClear={() => onFiltersChange({ ...f, propertyIds: [] })}
        />
        <MultiSelectPill
          label="Owner"
          options={uploaderOptions}
          selected={f.uploaders || []}
          onToggle={(id) => multiToggle("uploaders", id)}
          onClear={() => onFiltersChange({ ...f, uploaders: [] })}
        />
        <MultiSelectPill
          label="Tags"
          options={tagOptions}
          selected={f.tags || []}
          onToggle={(id) => multiToggle("tags", id)}
          onClear={() => onFiltersChange({ ...f, tags: [] })}
        />

        <DateRangePill
          dateFrom={f.dateFrom}
          dateTo={f.dateTo}
          onChange={(from, to) => onFiltersChange({ ...f, dateFrom: from, dateTo: to })}
        />

        {/* Toggle pills */}
        <TogglePill
          label="Unattributed"
          active={!!f.unattributed}
          onClick={() => onFiltersChange({ ...f, unattributed: !f.unattributed })}
        />
        <TogglePill
          label="Drive-imported"
          active={!!f.driveOnly}
          onClick={() => onFiltersChange({ ...f, driveOnly: !f.driveOnly })}
        />

        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 ml-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-3 h-3" /> Clear all ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}