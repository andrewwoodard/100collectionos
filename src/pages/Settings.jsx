import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Settings as SettingsIcon, Users, Shield, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "../components/shared/StatusBadge";
import MenuVisibilityCard from "../components/settings/MenuVisibilityCard";
import EmailConfigCard from "../components/settings/EmailConfigCard";
import EmailTestHarnessCard from "../components/settings/EmailTestHarnessCard";
import DigestConfigCard from "../components/settings/DigestConfigCard";
import GhlConfigCard from "../components/settings/GhlConfigCard";
import BiometricEnrollmentCard from "@/components/auth/BiometricEnrollmentCard";
import { useAuth } from "@/lib/AuthContext";

export default function Settings() {
  const { user } = useAuth();

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list("-created_date", 100),
  });

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-gray-400" /> Your Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Name</p>
              <p className="text-sm font-medium text-gray-900">{user?.full_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm font-medium text-gray-900">{user?.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Role</p>
              <p className="text-sm font-medium text-gray-900">{user?.role || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" /> Team Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No team members found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600">{u.email}</TableCell>
                    <TableCell><StatusBadge status={u.role || "user"} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Biometric Login enrollment */}
      <BiometricEnrollmentCard />

      {/* Menu Visibility (admin only) */}
      {user?.role === "admin" && (
        <MenuVisibilityCard />
      )}

      {/* Email QA Test Harness (admin only) */}
      {user?.role === "admin" && (
        <EmailTestHarnessCard />
      )}

      {/* Email / Resend Configuration (admin only) */}
      {user?.role === "admin" && (
        <EmailConfigCard />
      )}

      {/* GHL Integration (admin only) */}
      {user?.role === "admin" && (
        <GhlConfigCard />
      )}

      {/* Scheduled Digests (admin only) */}
      {user?.role === "admin" && (
        <DigestConfigCard />
      )}

      {/* Roles Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-400" /> Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { role: "Admin", desc: "Full access to all features and settings" },
              { role: "Operations", desc: "Manage partners, properties, onboarding, and tasks" },
              { role: "Onboarding", desc: "Manage onboarding pipeline and related documents" },
              { role: "Finance", desc: "Manage billing, invoices, and financial reports" },
              { role: "Marketing", desc: "Manage media library and brand assets" },
            ].map(r => (
              <div key={r.role} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.role}</p>
                  <p className="text-xs text-gray-500">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}