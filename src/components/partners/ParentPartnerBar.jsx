import React from "react";
import { Link } from "react-router-dom";
import { CornerUpLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";

/**
 * Shows "Sub-brand of {Parent Name}" bar when the current partner has a parent.
 * Includes an "Unlink from parent" action for admins.
 */
export default function ParentPartnerBar({ parentPartner, onUnlink }) {
  if (!parentPartner) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-blue-700">
        <CornerUpLeft className="w-4 h-4 flex-shrink-0" />
        <span>Sub-brand of </span>
        <Link
          to={`/PartnerDetail?id=${parentPartner.id}`}
          className="font-semibold text-blue-800 hover:underline"
        >
          {parentPartner.partner_name}
        </Link>
        <StatusBadge status={parentPartner.status} />
      </div>
      {onUnlink && (
        <Button
          variant="ghost"
          size="sm"
          className="text-blue-600 hover:bg-blue-100 h-7 text-xs"
          onClick={onUnlink}
        >
          <X className="w-3.5 h-3.5 mr-1" /> Unlink
        </Button>
      )}
    </div>
  );
}