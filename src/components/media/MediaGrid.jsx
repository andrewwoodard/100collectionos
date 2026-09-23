import React, { useState } from "react";
import { Image, Film, FileText, File, MoreHorizontal, ExternalLink, FolderInput, Trash2, CheckCircle, Clock, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import StatusBadge from "@/components/shared/StatusBadge";

const approvalIcon = { approved: CheckCircle, pending: Clock, rejected: XCircle };
const approvalColor = { approved: "text-green-500", pending: "text-amber-500", rejected: "text-red-500" };

const typeIcon = { photo: Image, video: Film, pdf: FileText, brand_asset: FileText, other: File };

function AssetThumbnail({ asset }) {
  const [errored, setErrored] = useState(false);
  const hasThumbnail = (asset.thumbnail_url || asset.file_url) && !errored;
  const isImage = asset.asset_type === "photo" || asset.asset_type === "logo";
  const FallbackIcon = typeIcon[asset.asset_type] || File;

  if (hasThumbnail && isImage) {
    return (
      <img
        src={asset.thumbnail_url || asset.file_url}
        alt={asset.asset_name}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <FallbackIcon className="w-8 h-8 text-gray-300" />
      <span className="text-xs text-gray-400 uppercase">{asset.asset_type}</span>
    </div>
  );
}

export default function MediaGrid({ assets, folders, onDelete, onMove, onDragStart, onPreview }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {assets.map(a => {
        const Icon = approvalIcon[a.approval_status] || Clock;
        const iconColor = approvalColor[a.approval_status] || "text-gray-400";

        return (
          <div
            key={a.id}
            draggable
            onDragStart={e => { e.dataTransfer.setData("assetId", a.id); if (onDragStart) onDragStart(a.id); }}
            onClick={e => { if (!e.target.closest("[data-radix-dropdown-menu-trigger]") && !e.target.closest("[data-radix-popper-content-wrapper]")) onPreview?.(a); }}
            className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group cursor-pointer"
          >
            <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative">
              <AssetThumbnail asset={a} />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-sm hover:bg-white">
                      <MoreHorizontal className="w-4 h-4 text-gray-600" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {a.file_url && (
                      <DropdownMenuItem onClick={() => window.open(a.file_url, "_blank")}>
                        <ExternalLink className="w-4 h-4 mr-2" /> Open file
                      </DropdownMenuItem>
                    )}
                    {folders.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger><FolderInput className="w-4 h-4 mr-2" />Move to</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => onMove(a.id, null)}>No folder</DropdownMenuItem>
                          {folders.map(f => (
                            <DropdownMenuItem key={f.id} onClick={() => onMove(a.id, f.id)}>{f.name}</DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuItem onClick={() => onDelete(a.id)} className="text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="p-3">
              <p className="text-xs font-medium text-gray-900 truncate">{a.asset_name}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{a.partner_name || a.property_name || a.market || "—"}</p>
              <div className="mt-2 flex items-center gap-1">
                <Icon className={`w-3 h-3 ${iconColor}`} />
                <span className="text-xs text-gray-500 capitalize">{a.approval_status}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}