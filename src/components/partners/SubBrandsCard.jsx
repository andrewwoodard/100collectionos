import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { ChevronRight, Plus, Building2 } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

/**
 * Shows a card listing sub-brand Partners for a top-level partner.
 * Includes an "Add sub-brand" picker that promotes an existing top-level
 * partner (with no children of its own) to a sub-brand.
 */
export default function SubBrandsCard({ partnerId, partnerName, isTopLevel }) {
  const [showPicker, setShowPicker] = useState(false);
  const qc = useQueryClient();

  // Fetch all partners to find children + eligible parents
  const { data: allPartners = [] } = useQuery({
    queryKey: ["all-partners-subbrands", partnerId],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
    enabled: !!partnerId,
  });

  // Children of this partner
  const children = useMemo(
    () => allPartners.filter(p => p.parent_partner_id === partnerId),
    [allPartners, partnerId]
  );

  // Fetch all properties for property counts
  const { data: allProperties = [] } = useQuery({
    queryKey: ["all-properties-subbrands"],
    queryFn: () => fetchAllProperties(),
    enabled: !!partnerId,
  });

  const propCountByPartnerName = useMemo(() => {
    const map = {};
    for (const prop of allProperties) {
      if (prop.partner_name && prop.status === "active") {
        map[prop.partner_name] = (map[prop.partner_name] || 0) + 1;
      }
    }
    return map;
  }, [allProperties]);

  // Eligible parents for "Add sub-brand" picker:
  // top-level partners (no parent) with no children, excluding the current partner
  const eligibleSubBrands = useMemo(() => {
    const parentIds = new Set(allPartners.filter(p => p.parent_partner_id).map(p => p.parent_partner_id));
    return allPartners.filter(p =>
      !p.parent_partner_id &&
      !parentIds.has(p.id) &&
      p.id !== partnerId &&
      p.partner_name !== partnerName
    );
  }, [allPartners, partnerId, partnerName]);

  const linkMutation = useMutation({
    mutationFn: async ({ childId }) => {
      await base44.entities.Partner.update(childId, { parent_partner_id: partnerId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-partners-subbrands", partnerId] });
      qc.invalidateQueries({ queryKey: ["base44-partners"] });
      setShowPicker(false);
    },
  });

  const handleUnlink = async (childId) => {
    await base44.entities.Partner.update(childId, { parent_partner_id: null });
    qc.invalidateQueries({ queryKey: ["all-partners-subbrands", partnerId] });
    qc.invalidateQueries({ queryKey: ["base44-partners"] });
  };

  if (!isTopLevel) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Sub-brands</h3>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
            {children.length}
          </span>
        </div>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowPicker(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add sub-brand
        </Button>
      </div>
      {children.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">No sub-brands yet. Add one to roll their properties up into {partnerName}'s portal.</p>
        </div>
      ) : (
      <div className="divide-y divide-gray-50">
        {children.map(child => (
          <div key={child.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors group">
            <Link to={`/PartnerDetail?id=${child.id}`} className="flex-1 flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{child.partner_name}</p>
                <p className="text-xs text-gray-400 truncate">{child.market || "No market"}</p>
              </div>
            </Link>
            <span className="text-xs text-gray-500">
              {propCountByPartnerName[child.partner_name] || 0} props
            </span>
            <StatusBadge status={child.status} />
            <button
              onClick={() => handleUnlink(child.id)}
              className="text-xs text-gray-300 hover:text-gray-600 px-1.5 py-0.5 rounded transition-colors"
              title="Unlink from parent"
            >
              Unlink
            </button>
            <Link to={`/PartnerDetail?id=${child.id}`}>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" />
            </Link>
          </div>
        ))}
      </div>
      )}

      {/* Add sub-brand picker */}
      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add sub-brand to {partnerName}</DialogTitle>
          </DialogHeader>
          {eligibleSubBrands.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No eligible top-level partners available. Only top-level partners without children can be promoted to sub-brands.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {eligibleSubBrands.map(p => (
                <button
                  key={p.id}
                  onClick={() => linkMutation.mutate({ childId: p.id })}
                  disabled={linkMutation.isPending}
                  className="w-full px-3 py-3 flex items-center gap-3 hover:bg-gray-50 text-left transition-colors disabled:opacity-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.partner_name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.market || "No market"}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPicker(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}