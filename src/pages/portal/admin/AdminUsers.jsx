import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminUserAction, fetchAdminUsers } from "@/lib/adminUsersApi";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  Search,
  Shield,
  UserCog,
} from "lucide-react";

const ROLES = ["admin", "operations", "onboarding", "finance", "marketing", "partner", "user"];
const PARTNER_ROLES = ["owner", "marketing", "finance", "operations"];

const ROLE_STYLES = {
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  operations: "bg-slate-100 text-slate-700 border-slate-200",
  onboarding: "bg-sky-50 text-sky-700 border-sky-200",
  finance: "bg-emerald-50 text-emerald-700 border-emerald-200",
  marketing: "bg-amber-50 text-amber-700 border-amber-200",
  partner: "bg-blue-50 text-blue-700 border-blue-200",
  user: "bg-slate-50 text-slate-600 border-slate-200",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsers({ embedded = false }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loginFilter, setLoginFilter] = useState("all");
  const [busyKey, setBusyKey] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", name: "", role: "partner", partner_role: "owner", password: "" });
  const [resetResult, setResetResult] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchAdminUsers,
  });
  const users = data?.users || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (loginFilter === "password" && !u.hasPassword) return false;
      if (loginFilter === "google" && !u.providers?.includes("google")) return false;
      if (loginFilter === "none" && u.canLogin) return false;
      if (!q) return true;
      return (
        u.email?.toLowerCase().includes(q) ||
        u.name?.toLowerCase().includes(q) ||
        u.partner?.name?.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, loginFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    noLogin: users.filter((u) => !u.canLogin).length,
  }), [users]);

  const run = async (key, fn, success) => {
    setBusyKey(key);
    try {
      const result = await fn();
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      if (success) toast({ title: typeof success === "function" ? success(result) : success });
      return result;
    } catch (error) {
      toast({ title: error.message || "Something went wrong", variant: "destructive" });
      return null;
    } finally {
      setBusyKey(null);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    const result = await run(
      passwordUser.email,
      () => adminUserAction("set_password", { email: passwordUser.email, password }),
      `Password set for ${passwordUser.email}`
    );
    if (result) {
      setPasswordUser(null);
      setPassword("");
      setConfirmPassword("");
    }
  };

  const handleSendReset = async (user) => {
    const result = await run(
      `reset:${user.email}`,
      () => adminUserAction("send_reset", { email: user.email })
    );
    if (!result) return;
    setResetResult({ email: user.email, ...result });
    toast({
      title: result.resetUrl && !result.sent
        ? `Reset link created for ${user.email}`
        : `Password reset email sent to ${user.email}`,
    });
  };

  const handleRole = (user, role) => {
    if (role === user.role) return;
    run(
      `role:${user.email}`,
      () => adminUserAction("update_role", { email: user.email, role, partner_role: user.partner_role }),
      `Updated ${user.email} to ${role}`
    );
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const result = await run(
      "create",
      () => adminUserAction("create_user", createForm),
      `Created ${createForm.email}`
    );
    if (result) {
      setCreating(false);
      setCreateForm({ email: "", name: "", role: "partner", partner_role: "owner", password: "" });
    }
  };

  const inner = (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-lg font-light text-[#0D1B2A]">Users</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {counts.total} accounts · {counts.admins} admins · {counts.noLogin} without login
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0D1B2A] text-white text-sm hover:bg-[#1a2f47] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add user
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {[
            { id: "all", label: "All" },
            { id: "admin", label: "Admins" },
            { id: "partner", label: "Partners" },
            { id: "user", label: "Users" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setRoleFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === f.id
                  ? "bg-[#0D1B2A] text-white border-[#0D1B2A]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
          {[
            { id: "none", label: "No login" },
            { id: "password", label: "Has password" },
            { id: "google", label: "Google" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setLoginFilter(loginFilter === f.id ? "all" : f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                loginFilter === f.id
                  ? "bg-[#C9A96E] text-white border-[#C9A96E]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, partner…"
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 bg-white w-64"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
          <UserCog className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">
            {search || roleFilter !== "all" || loginFilter !== "all"
              ? "No users match your filters."
              : "No users found."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-slate-100">
                {["User", "Role", "Partner", "Login", "Last sign-in", "Created", "Actions"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((user) => {
                const busy = busyKey && String(busyKey).includes(user.email);
                return (
                  <tr key={user.email} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0D1B2A]/5 flex items-center justify-center text-[#0D1B2A] font-semibold text-xs">
                          {(user.name || user.email)?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="font-medium text-sm text-[#0D1B2A]">{user.name || "—"}</div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={user.role || "user"}
                        disabled={busy}
                        onChange={(e) => handleRole(user, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border bg-white ${ROLE_STYLES[user.role] || ROLE_STYLES.user}`}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{user.partner?.name || "—"}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.hasPassword && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Password</span>
                        )}
                        {user.providers?.includes("google") && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">Google</span>
                        )}
                        {!user.canLogin && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">No login</span>
                        )}
                        {user.disabled && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Disabled</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">{formatDate(user.lastSignIn)}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setPasswordUser(user);
                            setPassword("");
                            setConfirmPassword("");
                          }}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-[#C9A96E] hover:text-[#C9A96E] transition-colors disabled:opacity-50"
                        >
                          {busyKey === user.email ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                          Set password
                        </button>
                        <button
                          onClick={() => handleSendReset(user)}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                        >
                          {busyKey === `reset:${user.email}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                          Send reset
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!passwordUser} onOpenChange={(open) => !open && setPasswordUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <p className="text-sm text-slate-500">
              Set a password for <span className="font-medium text-[#0D1B2A]">{passwordUser?.email}</span>. They can then sign in with email.
            </p>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="New password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
              required
              minLength={8}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
              required
              minLength={8}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordUser(null)}>Cancel</Button>
              <Button type="submit" disabled={busyKey === passwordUser?.email}>
                {busyKey === passwordUser?.email && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
              required
            />
            <input
              type="text"
              placeholder="Full name"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
              >
                {ROLES.filter((r) => r !== "user").map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select
                value={createForm.partner_role}
                onChange={(e) => setCreateForm((f) => ({ ...f, partner_role: e.target.value }))}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
              >
                {PARTNER_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Password (optional)"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30"
            />
            <p className="text-xs text-slate-400">Leave the password blank to create the account and send a reset email later.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={busyKey === "create"}>
                {busyKey === "create" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetResult} onOpenChange={(open) => !open && setResetResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            {resetResult?.sent
              ? `A reset email was sent to ${resetResult.email}.`
              : `The reset email could not be sent automatically. Copy this link and share it with ${resetResult?.email}.`}
          </p>
          {resetResult?.resetUrl && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={resetResult.resetUrl}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(resetResult.resetUrl);
                  toast({ title: "Reset link copied" });
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) return inner;
  return (
    <div>
      <div className="mb-6">
        <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Admin</div>
        <h1 className="text-2xl font-light text-[#0D1B2A] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#C9A96E]" />
          User Management
        </h1>
      </div>
      {inner}
    </div>
  );
}
