import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2 } from "lucide-react";
import AuthLayout, { AUTH_INPUT, AUTH_LABEL, AUTH_LINK, AUTH_PRIMARY } from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function ChangePassword() {
  const { user, isLoadingAuth, logout, refreshUser } = useAuth();
  const returnTo = safeReturnTo();
  const next = returnTo === "/" || returnTo.startsWith("/change-password") ? "/" : returnTo;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#FAFAF8]">
        <div className="w-8 h-8 border-4 border-[#E8DDD0] border-t-[#C9A96E] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a different password than the one you just used.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { error: changeError } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (changeError) throw changeError;
      await refreshUser();
      window.location.href = next;
    } catch (err) {
      setError(err.message || "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your previous portal password worked. For security, set a new one before continuing."
      footer={
        <button type="button" onClick={() => logout()} className={AUTH_LINK}>
          Sign out
        </button>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#F8EDE6] text-[#8B3A2A] text-sm border border-[#E8DDD0]">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="current" className={AUTH_LABEL}>
            Current password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A090]" aria-hidden="true" />
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={AUTH_INPUT}
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="password" className={AUTH_LABEL}>
            New password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A090]" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={AUTH_INPUT}
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="confirm" className={AUTH_LABEL}>
            Confirm new password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A090]" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={AUTH_INPUT}
              required
            />
          </div>
        </div>
        <Button type="submit" className={AUTH_PRIMARY} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save new password"
          )}
        </Button>
        {!user.mustChangePassword && (
          <p className="text-center text-sm">
            <Link to={next} className={AUTH_LINK}>
              Not now
            </Link>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
