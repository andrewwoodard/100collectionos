import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, EyeOff, Link2 } from "lucide-react";
import TeamMembersSection from "./TeamMembersSection";

export default function PortalManagementTab({ partner, properties, partnerId }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  // Fetch all properties (including those not yet linked) for bulk-add
  const { data: allProperties = [] } = useQuery({
    queryKey: ["all-properties-bulk"],
    queryFn: () => fetchAllProperties(),
  });

  // Properties that could be linked (same partner_name or already linked)
  const unlinkedMatchingProps = allProperties.filter(p =>
    !properties.find(existing => existing.id === p.id) &&
    p.partner_name === partner.partner_name
  );

  const togglePortalVisibility = async (property, visible) => {
    setSaving(prev => new Set(prev).add(property.id));
    const portalUserId = partner.portal_user_id || partnerId;
    await base44.entities.Property.update(property.id, {
      portal_visible: visible,
      partner_id: portalUserId,
      partner_name: partner.partner_name,
    });
    queryClient.invalidateQueries({ queryKey: ["partner-properties", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["all-properties-bulk"] });
    setSaving(prev => { const next = new Set(prev); next.delete(property.id); return next; });
  };

  const setAllVisibility = async (visible) => {
    setBulkSaving(true);
    const portalUserId = partner.portal_user_id || partnerId;
    await Promise.all(properties.map(p => base44.entities.Property.update(p.id, {
      portal_visible: visible,
      partner_id: portalUserId,
      partner_name: partner.partner_name,
    })));
    queryClient.invalidateQueries({ queryKey: ["partner-properties", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["all-properties-bulk"] });
    setBulkSaving(false);
  };

  const bulkLinkUnmatched = async () => {
    if (unlinkedMatchingProps.length === 0) return;
    setBulkSaving(true);
    await Promise.all(
      unlinkedMatchingProps.map(p =>
        base44.entities.Property.update(p.id, {
          partner_id: partner.portal_user_id || partnerId,
          partner_name: partner.partner_name,
          portal_visible: true,
        })
      )
    );
    queryClient.invalidateQueries({ queryKey: ["partner-properties", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["all-properties-bulk"] });
    setBulkSaving(false);
  };

  const allVisible = properties.length > 0 && properties.every(p => p.portal_visible);
  const someVisible = properties.some(p => p.portal_visible);

  return (
    <div className="space-y-6">
      {/* Team Members */}
      <TeamMembersSection partnerId={partnerId} canManage={true} />

      {/* Property Portal Visibility */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Portal Property Visibility</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Toggle which properties appear in {partner.partner_name}'s partner portal
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unlinkedMatchingProps.length > 0 && (
              <Button
                size="sm" variant="outline"
                onClick={bulkLinkUnmatched}
                disabled={bulkSaving}
                className="text-xs border-[#C9A96E] text-[#C9A96E] hover:bg-[#C9A96E]/5"
              >
                {bulkSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                Import {unlinkedMatchingProps.length} Matching
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setAllVisibility(false)} disabled={bulkSaving || !someVisible} className="text-xs">
              <EyeOff className="w-3 h-3 mr-1" /> Hide All
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAllVisibility(true)} disabled={bulkSaving || allVisible} className="text-xs">
              <Eye className="w-3 h-3 mr-1" /> Show All
            </Button>
          </div>
        </div>

        {properties.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No properties linked to this partner yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {properties.map(p => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.property_name}</p>
                  <p className="text-xs text-gray-400">
                    {[p.market, p.property_type, p.bedrooms ? `${p.bedrooms} BD` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === "active" ? "bg-emerald-50 text-emerald-700" :
                    p.status === "paused" ? "bg-amber-50 text-amber-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>{p.status}</span>
                  {saving.has(p.id) ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{p.portal_visible ? "Visible" : "Hidden"}</span>
                      <Switch
                        checked={!!p.portal_visible}
                        onCheckedChange={v => togglePortalVisibility(p, v)}
                        className="data-[state=checked]:bg-[#C9A96E]"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}