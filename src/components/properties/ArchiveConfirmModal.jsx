import React from "react";
import { Archive, RotateCcw } from "lucide-react";

export default function ArchiveConfirmModal({ properties, isRestore, onClose, onConfirm }) {
  if (!properties || properties.length === 0) return null;
  const count = properties.length;
  const isBulk = count > 1;
  const name = properties[0]?.property_name || "this property";

  const title = isRestore
    ? `Restore ${isBulk ? `${count} properties` : "property"}?`
    : `Archive ${isBulk ? `${count} properties` : "property"}?`;

  const body = isRestore
    ? `This will restore ${isBulk ? `these ${count} properties` : `"${name}"`} to active status and make ${isBulk ? "them" : "it"} visible again in the partner portal.`
    : `This will hide ${isBulk ? `these ${count} properties` : `"${name}"`} from the partner's portal and mark ${isBulk ? "them" : "it"} as inactive. You can restore ${isBulk ? "them" : "it"} anytime from the archived filter.`;

  const actionLabel = isRestore
    ? `Restore ${isBulk ? `${count} properties` : "property"}`
    : `Archive ${isBulk ? `${count} properties` : "property"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isRestore ? "bg-emerald-50" : "bg-red-50"}`}>
            {isRestore ? <RotateCcw className="w-5 h-5 text-emerald-600" /> : <Archive className="w-5 h-5 text-red-500" />}
          </div>
          <h3 className="text-base font-semibold text-gray-900 pt-1.5">{title}</h3>
        </div>
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">{body}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-sm font-medium text-white transition-colors ${isRestore ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}