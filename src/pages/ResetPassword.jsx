import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2 } from "lucide-react";
import AuthLayout, { AUTH_INPUT, AUTH_LABEL, AUTH_LINK, AUTH_PRIMARY } from "@/components/AuthLayout";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  const linkError = searchParams.get("error");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!resetToken) {
      setError("This reset link is missing a token. Request a new one.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword,
        token: resetToken,
      });
      if (resetError) throw resetError;
      window.location.href = "/login";
    } catch (err) {
      const message = String(err?.message || "").toLowerCase();
      if (message.includes("invalid token") || message.includes("expired")) {
        setError("This reset link is invalid or has expired. Request a new one and try again.");
      } else {
        setError(err.message || "Failed to reset password");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    const expired = String(linkError || "").toUpperCase().includes("TOKEN");
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle={
          expired
            ? "This password reset link is invalid or has expired."
            : "This password reset link is missing or no longer valid."
        }
        footer={
          <Link to="/forgot-password" className={AUTH_LINK}>
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-[#0D1B2A] text-center font-light leading-relaxed">
          Please request a new password reset email from the portal and open the latest link.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="New password" subtitle="Choose a new password for your partner portal account.">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#F8EDE6] text-[#8B3A2A] text-sm border border-[#E8DDD0]">
          {error}
          {(error.toLowerCase().includes("invalid") || error.toLowerCase().includes("expired")) && (
            <div className="mt-2">
              <Link to="/forgot-password" className={AUTH_LINK}>
                Request a new link
              </Link>
            </div>
          )}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
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
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={AUTH_INPUT}
              required
              minLength={8}
            />
          </div>
        </div>
        <div>
          <label htmlFor="confirm" className={AUTH_LABEL}>
            Confirm password
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
              minLength={8}
            />
          </div>
        </div>
        <Button type="submit" className={AUTH_PRIMARY} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
