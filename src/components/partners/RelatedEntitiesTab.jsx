import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "../shared/StatusBadge";
import EmptyState from "../shared/EmptyState";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { Building2, FileText, Image, CreditCard, CheckSquare, MessageSquare, ClipboardCheck, ExternalLink } from "lucide-react";

export default function RelatedEntitiesTab({ type, items, partnerId }) {
  if (!Array.isArray(items) || items.length === 0) {
    const icons = { properties: Building2, documents: FileText, media: Image, billing: CreditCard, tasks: CheckSquare, notes: MessageSquare, onboarding: ClipboardCheck };
    return <EmptyState icon={icons[type]} title={`No ${type} yet`} description={`${type} linked to this partner will appear here`} />;
  }

  if (type === "properties") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(p => (
          <Link key={p.id} to={createPageUrl("PropertyDetail") + `?id=${p.id}`} className="bg-white rounded-lg border border-gray-100 p-4 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-1">
              <h4 className="text-sm font-semibold text-gray-900">{p.property_name}</h4>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-xs text-gray-500">{p.address || p.market || "—"}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              {p.bedrooms && <span>{p.bedrooms} BD</span>}
              {p.bathrooms && <span>{p.bathrooms} BA</span>}
              {p.sleeps && <span>Sleeps {p.sleeps}</span>}
            </div>
          </Link>
        ))}
      </div>
    );
  }

  if (type === "onboarding") {
    return (
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="text-xs">Checklist Item</TableHead>
              <TableHead className="text-xs">Stage</TableHead>
              <TableHead className="text-xs">Owner</TableHead>
              <TableHead className="text-xs">Due Date</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(i => (
              <TableRow key={i.id}>
                <TableCell className="text-sm">{i.checklist_item}</TableCell>
                <TableCell><StatusBadge status={i.stage} /></TableCell>
                <TableCell className="text-sm text-gray-600">{i.owner || "—"}</TableCell>
                <TableCell className="text-xs text-gray-400">{i.due_date ? format(new Date(i.due_date), "MMM d") : "—"}</TableCell>
                <TableCell>{i.completed ? <StatusBadge status="complete" /> : <StatusBadge status={i.blocker_status || "not_started"} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (type === "documents") {
    return (
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
            {items.map(d => (
              <TableRow key={d.id}>
                <TableCell className="text-sm font-medium">{d.title}</TableCell>
                <TableCell className="text-xs text-gray-500">{d.doc_type?.replace(/_/g, " ")}</TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
                <TableCell className="text-xs text-gray-400">{d.created_date ? format(new Date(d.created_date), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell>{d.file_url && <a href={d.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-[#C9A96E]" /></a>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (type === "billing") {
    return (
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="text-xs">Invoice #</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(b => (
              <TableRow key={b.id}>
                <TableCell className="text-sm font-medium">{b.invoice_number || "—"}</TableCell>
                <TableCell className="text-xs text-gray-500">{b.billing_type?.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-sm font-semibold">${(b.amount || 0).toLocaleString()}</TableCell>
                <TableCell><StatusBadge status={b.status} /></TableCell>
                <TableCell className="text-xs text-gray-400">{b.due_date ? format(new Date(b.due_date), "MMM d") : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (type === "tasks") {
    return (
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="text-xs">Task</TableHead>
              <TableHead className="text-xs">Priority</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Assigned</TableHead>
              <TableHead className="text-xs">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(t => (
              <TableRow key={t.id}>
                <TableCell className="text-sm font-medium">{t.title}</TableCell>
                <TableCell><StatusBadge status={t.priority} /></TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className="text-sm text-gray-600">{t.assigned_to || "—"}</TableCell>
                <TableCell className="text-xs text-gray-400">{t.due_date ? format(new Date(t.due_date), "MMM d") : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (type === "notes") {
    return (
      <div className="space-y-3">
        {items.map(n => (
          <div key={n.id} className="bg-white rounded-lg border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">{n.title}</h4>
              <StatusBadge status={n.note_type} />
            </div>
            <p className="text-sm text-gray-600">{n.body}</p>
            <p className="text-xs text-gray-400 mt-2">{n.created_date ? format(new Date(n.created_date), "MMM d, yyyy · h:mm a") : ""}</p>
          </div>
        ))}
      </div>
    );
  }

  if (type === "media") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(a => (
          <div key={a.id} className="bg-white rounded-lg border border-gray-100 overflow-hidden">
            <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
              {a.file_url && (a.asset_type === "photo" || a.asset_type === "logo") ? (
                <img src={a.thumbnail_url || a.file_url} alt={a.asset_name} className="w-full h-full object-cover" />
              ) : (
                <Image className="w-8 h-8 text-gray-300" />
              )}
            </div>
            <div className="p-2">
              <p className="text-xs font-medium text-gray-900 truncate">{a.asset_name}</p>
              <StatusBadge status={a.approval_status} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}