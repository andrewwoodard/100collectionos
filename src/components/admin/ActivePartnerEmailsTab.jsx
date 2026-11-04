import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { sb } from "@/lib/supabase";
import { fetchAdminUsers } from "@/lib/adminUsersApi";
import { Download, Mail, Search, Users } from "lucide-react";

const ACTIVE_STATUSES = new Set(["live", "live_non_renewed", "active"]);

function asEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "";
  return email;
}

function addEmail(bucket, email, role) {
  const key = asEmail(email);
  if (!key) return;
  if (!bucket.has(key)) bucket.set(key, new Set());
  bucket.get(key).add(role);
}

function exportPartnerEmailsCsv(rows) {
  if (!rows.length) return;
  const headers = [
    "partner_name",
    "company_name",
    "status",
    "market",
    "partner_type",
    "primary_contact_name",
    "email",
    "email_roles",
    "partner_id",
  ];
  const escape = (v) => JSON.stringify(v == null ? "" : String(v));
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `active-partner-emails-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseIds(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [raw];
    }
  }
  return [];
}

export default function ActivePartnerEmailsTab() {
  const [search, setSearch] = useState("");

  const { data: partners = [], isLoading: loadingPartners } = useQuery({
    queryKey: ["partner-entities-admin"],
    queryFn: () => base44.entities.Partner.list("-created_date", 1000),
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["all-users-partners"],
    queryFn: () => base44.entities.User.list("-created_date", 1000),
  });

  const { data: adminUsersData, isLoading: loadingAdminUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchAdminUsers,
  });
  const adminUsers = adminUsersData?.users || [];

  const { data: invitations = [], isLoading: loadingInvites } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: () => base44.entities.PartnerInvitation.list("-created_date", 1000),
  });

  const { data: sbPartners = [], isLoading: loadingSb } = useQuery({
    queryKey: ["partners-supabase-emails"],
    queryFn: async () => {
      const r = await sb.list("partners", null, null, 2000);
      return r.items || r.data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-partner-profiles"],
    queryFn: () => base44.entities.PartnerProfile.list("-created_date", 1000),
  });

  const userById = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      if (u?.id) map.set(String(u.id), u);
    }
    // Better Auth + portal dual ids from admin users API
    for (const u of adminUsers) {
      if (u?.authId) {
        map.set(String(u.authId), {
          id: u.authId,
          email: u.email,
          partner_role: u.partner_role,
          full_name: u.name,
        });
      }
      if (u?.portalId) {
        map.set(String(u.portalId), {
          id: u.portalId,
          email: u.email,
          partner_role: u.partner_role,
          full_name: u.name,
        });
      }
    }
    return map;
  }, [users, adminUsers]);

  const rows = useMemo(() => {
    const active = partners.filter((p) =>
      ACTIVE_STATUSES.has(String(p.status || "").trim().toLowerCase())
    );

    const sbByBase44Id = new Map();
    const sbByName = new Map();
    for (const sp of sbPartners) {
      const id = String(sp.base44_partner_id || sp.id || "");
      const name = String(sp.partner_name || "").trim().toLowerCase();
      if (id) sbByBase44Id.set(id, sp);
      if (name) sbByName.set(name, sp);
    }

    const invitesByPartner = new Map();
    for (const inv of invitations) {
      if (!inv?.partner_id) continue;
      const list = invitesByPartner.get(String(inv.partner_id)) || [];
      list.push(inv);
      invitesByPartner.set(String(inv.partner_id), list);
    }

    const profilesByPartner = new Map();
    for (const profile of profiles) {
      const pid = profile.partner_id ? String(profile.partner_id) : "";
      const name = String(profile.partner_name || "").trim().toLowerCase();
      if (pid) {
        const list = profilesByPartner.get(pid) || [];
        list.push(profile);
        profilesByPartner.set(pid, list);
      }
      if (name) {
        const list = profilesByPartner.get(`name:${name}`) || [];
        list.push(profile);
        profilesByPartner.set(`name:${name}`, list);
      }
    }

    return active
      .map((partner) => {
        const emails = new Map(); // email -> Set(roles)
        addEmail(emails, partner.primary_contact_email, "Primary contact");
        addEmail(emails, partner.stripe_billing_email, "Stripe billing");
        addEmail(emails, partner.billing_email, "Billing");
        addEmail(emails, partner.email, "Partner email");

        const membershipIds = [
          partner.portal_user_id,
          ...parseIds(partner.portal_user_ids),
        ]
          .map(String)
          .filter(Boolean);

        for (const id of membershipIds) {
          const user = userById.get(id);
          if (user?.email) {
            const role = user.partner_role
              ? `Portal user (${user.partner_role})`
              : "Portal user";
            addEmail(emails, user.email, role);
          }
        }

        for (const inv of invitesByPartner.get(String(partner.id)) || []) {
          addEmail(
            emails,
            inv.email,
            inv.invitation_type === "primary_activation"
              ? "Activation invite"
              : "Team invite"
          );
        }

        const sb =
          sbByBase44Id.get(String(partner.id)) ||
          sbByName.get(String(partner.partner_name || "").trim().toLowerCase());
        if (sb) {
          addEmail(emails, sb.primary_contact_email, "Supabase contact");
          addEmail(emails, sb.stripe_billing_email, "Supabase billing");
          addEmail(emails, sb.email, "Supabase email");
        }

        const linkedProfiles = [
          ...(profilesByPartner.get(String(partner.id)) || []),
          ...(profilesByPartner.get(
            `name:${String(partner.partner_name || "").trim().toLowerCase()}`
          ) || []),
        ];
        for (const profile of linkedProfiles) {
          addEmail(emails, profile.partner_email, "Partner profile");
          addEmail(emails, profile.reservation_email, "Reservations");
        }

        const emailList = [...emails.entries()]
          .map(([email, roles]) => ({
            email,
            roles: [...roles].sort(),
          }))
          .sort((a, b) => a.email.localeCompare(b.email));

        return {
          id: partner.id,
          partner_name: partner.partner_name || partner.company_name || "—",
          company_name: partner.company_name || "",
          status: partner.status || "",
          market: partner.market || "",
          partner_type: partner.partner_type || "",
          primary_contact_name: partner.primary_contact_name || "",
          primary_contact_phone: partner.primary_contact_phone || "",
          emails: emailList,
        };
      })
      .filter((row) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          row.partner_name.toLowerCase().includes(q) ||
          row.company_name.toLowerCase().includes(q) ||
          row.market.toLowerCase().includes(q) ||
          row.primary_contact_name.toLowerCase().includes(q) ||
          row.emails.some((e) => e.email.includes(q))
        );
      })
      .sort((a, b) => a.partner_name.localeCompare(b.partner_name));
  }, [partners, users, invitations, sbPartners, profiles, userById, search]);

  const csvRows = useMemo(() => {
    const out = [];
    for (const row of rows) {
      if (!row.emails.length) {
        out.push({
          partner_name: row.partner_name,
          company_name: row.company_name,
          status: row.status,
          market: row.market,
          partner_type: row.partner_type,
          primary_contact_name: row.primary_contact_name,
          email: "",
          email_roles: "",
          partner_id: row.id,
        });
        continue;
      }
      for (const entry of row.emails) {
        out.push({
          partner_name: row.partner_name,
          company_name: row.company_name,
          status: row.status,
          market: row.market,
          partner_type: row.partner_type,
          primary_contact_name: row.primary_contact_name,
          email: entry.email,
          email_roles: entry.roles.join("; "),
          partner_id: row.id,
        });
      }
    }
    return out;
  }, [rows]);

  const uniqueEmailCount = useMemo(() => {
    const set = new Set();
    for (const row of rows) for (const e of row.emails) set.add(e.email);
    return set.size;
  }, [rows]);

  const isLoading = loadingPartners || loadingUsers || loadingAdminUsers || loadingInvites || loadingSb;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-slate-500">
          <span className="font-medium text-[#0D1B2A]">{rows.length}</span> active partners
          {" · "}
          <span className="font-medium text-[#0D1B2A]">{uniqueEmailCount}</span> unique emails
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search partner or email…"
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white w-56"
            />
          </div>
          <button
            type="button"
            onClick={() => exportPartnerEmailsCsv(csvRows)}
            disabled={!csvRows.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0D1B2A] text-white text-sm font-medium hover:bg-[#1a2e45] disabled:opacity-40 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="border-b border-slate-100">
              {[
                "Partner",
                "Status",
                "Market",
                "Type",
                "Contact",
                "Emails",
                "Sources",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                  Loading partner emails…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No active partners found</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 align-top">
                  <td className="px-5 py-4">
                    <div className="font-medium text-sm text-[#0D1B2A]">{row.partner_name}</div>
                    {row.company_name && row.company_name !== row.partner_name && (
                      <div className="text-xs text-slate-400 mt-0.5">{row.company_name}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full capitalize">
                      {row.status || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{row.market || "—"}</td>
                  <td className="px-5 py-4 text-xs text-slate-500 capitalize">
                    {(row.partner_type || "—").replace(/_/g, " ")}
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm text-[#0D1B2A]">{row.primary_contact_name || "—"}</div>
                    {row.primary_contact_phone && (
                      <div className="text-xs text-slate-400 mt-0.5">{row.primary_contact_phone}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {row.emails.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">No emails found</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {row.emails.map((entry) => (
                          <a
                            key={entry.email}
                            href={`mailto:${entry.email}`}
                            className="inline-flex items-center gap-1.5 text-sm text-[#0D1B2A] hover:text-[#C9A96E]"
                          >
                            <Mail className="w-3 h-3 text-slate-400" />
                            {entry.email}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {row.emails.length === 0 ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {row.emails.map((entry) => (
                          <div key={entry.email} className="flex flex-wrap gap-1">
                            {entry.roles.map((role) => (
                              <span
                                key={role}
                                className="text-[10px] font-medium text-slate-600 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded"
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
