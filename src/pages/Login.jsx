import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout, {
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
  AUTH_OUTLINE,
  AUTH_PRIMARY,
  AuthDivider,
} from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

function magicLinkErrorMessage(code) {
  if (!code) return "";
  if (code === "INVALID_TOKEN" || code === "EXPIRED_TOKEN") {
    return "This login link is invalid or has expired. Request a new one.";
  }
  return "Could not complete sign-in. Try the magic link again, or use a password.";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() =>
    magicLinkErrorMessage(new URLSearchParams(window.location.search).get("error"))
  );
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const returnTo = safeReturnTo();
  const registerHref = "/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!password) {
      setError("Enter your password, or email yourself a login link.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) throw signInError;
      if (data?.user?.mustChangePassword) {
        window.location.href = "/change-password?returnTo=" + encodeURIComponent(returnTo);
        return;
      }
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    authClient.signIn.social({
      provider: "google",
      callbackURL: returnTo,
    });
  };

  const handleMagicLink = async () => {
    setError("");
    if (!email) {
      setError("Enter your email to receive a login link.");
      return;
    }
    setMagicLoading(true);
    try {
      const { error: magicError } = await authClient.signIn.magicLink({
        email,
        callbackURL: returnTo,
        errorCallbackURL: "/login",
      });
      if (magicError) throw magicError;
      setMagicSent(true);
    } catch (err) {
      setError(err.message || "Could not send a login link");
    } finally {
      setMagicLoading(false);
    }
  };

  const busy = loading || magicLoading;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to the partner portal — the same care we bring to every home in the Collection."
      footer={
        <>
          Don't have an account?{" "}
          <Link to={registerHref} className={AUTH_LINK}>
            Create one
          </Link>
        </>
      }
    >
      <Button variant="outline" className={`${AUTH_OUTLINE} mb-1`} onClick={handleGoogle} disabled={busy}>
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <AuthDivider />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#F8EDE6] text-[#8B3A2A] text-sm border border-[#E8DDD0]">
          {error}
        </div>
      )}

      {magicSent ? (
        <p className="text-sm text-[#0D1B2A] text-center font-light leading-relaxed">
          If an account exists for that email, you'll receive a sign-in link shortly. It expires in 15 minutes.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className={AUTH_LABEL}>
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A090]" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={AUTH_INPUT}
                required
              />
            </div>
          </div>
          <Button type="button" variant="outline" className={AUTH_OUTLINE} onClick={handleMagicLink} disabled={busy}>
            {magicLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending link...
              </>
            ) : (
              "Email me a login link"
            )}
          </Button>

          <AuthDivider label="or use a password" />

          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label htmlFor="password" className={`${AUTH_LABEL} mb-0`}>
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[10px] sm:text-[11px] uppercase tracking-[0.1em] text-[#C9A96E] hover:text-[#b8935a] shrink-0 whitespace-nowrap"
              >
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A090]" aria-hidden="true" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={AUTH_INPUT}
              />
            </div>
          </div>
          <Button type="submit" className={AUTH_PRIMARY} disabled={busy}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
