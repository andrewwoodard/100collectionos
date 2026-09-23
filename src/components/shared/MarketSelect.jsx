import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Returns a sorted list of distinct market names that already exist across
 * Partner and Property records. Used to constrain market selection to known
 * values only.
 */
export function useExistingMarkets() {
  const { data: partners = [] } = useQuery({
    queryKey: ["markets-source-partners"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
    staleTime: 5 * 60 * 1000,
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["markets-source-properties"],
    queryFn: () => base44.entities.Property.list("-created_date", 500),
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const set = new Set();
    [...partners, ...properties].forEach(p => {
      const m = (p.market || "").trim();
      if (m) set.add(m);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [partners, properties]);
}

/**
 * A market dropdown that only allows choosing from markets that already exist.
 * Renders a native <select> styled via `className` so it can match any form.
 * If the current value isn't in the existing-markets list (legacy data), it is
 * still shown as an option so the field never appears blank.
 */
export default function MarketSelect({ value, onChange, className = "", placeholder = "Select market" }) {
  const markets = useExistingMarkets();
  const options = useMemo(() => {
    const arr = [...markets];
    if (value && !arr.includes(value)) arr.unshift(value);
    return arr;
  }, [markets, value]);

  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">{placeholder}</option>
      {options.map(m => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
  );
}