import React, { useMemo, useState } from "react";
import { ExternalLink, Image as ImageIcon, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmptyState from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * Flatten Property.photo_urls (+ aligned photo_alt_texts) into gallery items
 * used on property pages across the portal.
 */
export function buildPartnerPropertyImageItems(properties = []) {
  const items = [];
  for (const prop of properties) {
    const urls = Array.isArray(prop?.photo_urls) ? prop.photo_urls.filter(Boolean) : [];
    if (!urls.length) continue;
    const alts = Array.isArray(prop?.photo_alt_texts) ? prop.photo_alt_texts : [];
    const propertyName = (prop.property_name || prop.name || "Untitled property").trim();
    const partnerName = (prop.partner_name || "").trim();
    urls.forEach((url, index) => {
      const alt = String(alts[index] ?? "").trim();
      items.push({
        id: `${prop.id || "prop"}-${index}`,
        url,
        alt,
        index,
        propertyId: prop.id,
        propertyName,
        partnerId: prop.partner_id || null,
        partnerName,
        market: prop.market || "",
        hasAlt: Boolean(alt),
      });
    });
  }
  return items;
}

function matchesQuery(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  // Prefer alt text; also allow property / partner / market so operators can narrow the set.
  if (item.alt.toLowerCase().includes(q)) return true;
  if (item.propertyName.toLowerCase().includes(q)) return true;
  if (item.partnerName.toLowerCase().includes(q)) return true;
  if ((item.market || "").toLowerCase().includes(q)) return true;
  return false;
}

function PropertyImageCard({ item }) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative block"
        title={item.alt || item.propertyName}
      >
        {!errored ? (
          <img
            src={item.url}
            alt={item.alt || `${item.propertyName} — photo ${item.index + 1}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">Unavailable</span>
          </div>
        )}
        <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm">
          <ExternalLink className="w-3.5 h-3.5 text-gray-600" />
        </span>
      </a>
      <div className="p-3 space-y-1.5">
        <p
          className={`text-xs leading-snug line-clamp-3 ${
            item.hasAlt ? "text-gray-800" : "text-gray-400 italic"
          }`}
          title={item.alt || "No alt text"}
        >
          {item.hasAlt ? item.alt : "No alt text"}
        </p>
        <div className="pt-1 border-t border-gray-50 space-y-0.5">
          {item.propertyId ? (
            <Link
              to={createPageUrl("PropertyDetail") + `?id=${item.propertyId}`}
              className="text-xs font-medium text-gray-900 hover:text-[#C9A96E] truncate block"
            >
              {item.propertyName}
            </Link>
          ) : (
            <p className="text-xs font-medium text-gray-900 truncate">{item.propertyName}</p>
          )}
          <p className="text-xs text-gray-400 truncate">
            {[item.partnerName, item.market].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PartnerPropertyImagesTab({ properties = [], isLoading = false }) {
  const [search, setSearch] = useState("");
  const [altFilter, setAltFilter] = useState("all"); // all | with_alt | missing_alt
  const [partnerFilter, setPartnerFilter] = useState("all");

  const allItems = useMemo(() => buildPartnerPropertyImageItems(properties), [properties]);

  const partnerOptions = useMemo(() => {
    const map = new Map();
    for (const item of allItems) {
      const key = item.partnerId || item.partnerName || "";
      if (!key) continue;
      if (!map.has(key)) map.set(key, item.partnerName || "Unknown partner");
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (altFilter === "with_alt" && !item.hasAlt) return false;
      if (altFilter === "missing_alt" && item.hasAlt) return false;
      if (partnerFilter !== "all") {
        const key = item.partnerId || item.partnerName || "";
        if (key !== partnerFilter) return false;
      }
      return matchesQuery(item, search.trim());
    });
  }, [allItems, altFilter, partnerFilter, search]);

  const withAltCount = useMemo(() => allItems.filter((i) => i.hasAlt).length, [allItems]);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">Loading property images…</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Partner property images</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length.toLocaleString()} of {allItems.length.toLocaleString()} photos
            {allItems.length > 0 && (
              <> · {withAltCount.toLocaleString()} with alt text</>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by alt text, property, or partner…"
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={altFilter} onValueChange={setAltFilter}>
          <SelectTrigger className="w-full lg:w-44 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All alt status</SelectItem>
            <SelectItem value="with_alt">Has alt text</SelectItem>
            <SelectItem value="missing_alt">Missing alt text</SelectItem>
          </SelectContent>
        </Select>
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-full lg:w-56 bg-white">
            <SelectValue placeholder="Partner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All partners</SelectItem>
            {partnerOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {search.trim() && (
        <p className="text-xs text-gray-400">
          Matching primarily on alt text when available; property and partner names are also searched.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={allItems.length === 0 ? "No property images yet" : "No matches"}
          description={
            allItems.length === 0
              ? "Property gallery photos from partner listings will appear here"
              : "Try a different alt-text search or clear filters"
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((item) => (
            <PropertyImageCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
