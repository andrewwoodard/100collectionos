import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export default function TechStackField({ field, value, otherValue, onChange, onOtherChange }) {
  if (field.type === "textarea") {
    return (
      <div>
        <Label className="text-sm font-medium text-slate-700">{field.label}</Label>
        <Textarea
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className="mt-1.5"
          rows={3}
        />
      </div>
    );
  }

  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? value : [];
    const toggle = (opt) => {
      if (arr.includes(opt)) {
        onChange(arr.filter(v => v !== opt));
      } else {
        onChange([...arr, opt]);
      }
    };
    return (
      <div>
        <Label className="text-sm font-medium text-slate-700">{field.label}</Label>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:text-slate-800">
              <Checkbox checked={arr.includes(opt)} onCheckedChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
        </div>
        {arr.includes("Other") && (
          <Input
            value={otherValue || ""}
            onChange={e => onOtherChange(e.target.value)}
            placeholder="Specify…"
            className="mt-2"
          />
        )}
      </div>
    );
  }

  // select
  return (
    <div>
      <Label className="text-sm font-medium text-slate-700">{field.label}</Label>
      <Select value={value || "__none"} onValueChange={v => onChange(v === "__none" ? "" : v)}>
        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">—</SelectItem>
          {field.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
        </SelectContent>
      </Select>
      {value === "Other" && (
        <Input
          value={otherValue || ""}
          onChange={e => onOtherChange(e.target.value)}
          placeholder="Specify…"
          className="mt-2"
        />
      )}
    </div>
  );
}