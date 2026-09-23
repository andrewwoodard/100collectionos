import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import StatusBadge from "../shared/StatusBadge";
import EmptyState from "../shared/EmptyState";
import AddDocumentModal from "./AddDocumentModal";
import { format } from "date-fns";
import { FileText, Plus, ExternalLink } from "lucide-react";

export default function PartnerDocumentsTab({ items, partnerId, partnerName }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["partner-docs", partnerId] });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add document
        </Button>
      </div>

      {(!Array.isArray(items) || items.length === 0) ? (
        <EmptyState icon={FileText} title="No documents yet" description="Attach contracts, agreements, and reference files to this partner." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="text-xs">Title</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Uploaded</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm font-medium">{d.title}</TableCell>
                  <TableCell className="text-xs text-gray-500 capitalize">{d.doc_type?.replace(/_/g, " ")}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-xs text-gray-400">{d.created_date ? format(new Date(d.created_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>{d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-[#C9A96E]" /></a>
                  )}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddDocumentModal
        open={adding}
        onOpenChange={setAdding}
        partnerId={partnerId}
        partnerName={partnerName}
        onAdded={refresh}
      />
    </div>
  );
}