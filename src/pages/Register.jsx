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
import { signupDestination, signupSegment } from "@/lib/authReturnTo";

function withSignupParam(path) {
  try {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("signup", "1");
    return url.pathname + url.search;
  } catch {
    return path;
  }
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const dest = signupDestination();
  const segment = signupSegment();
  const destWithSignup = segment ? withSignupParam(dest) : dest;
  const busy = loading || magicLoading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name: email.split("@")[0],
      });
      if (signUpError) throw signUpError;
      if (segment) sessionStorage.setItem("signupSegment", segment);
      window.location.href = destWithSignup;
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    if (segment) sessionStorage.setItem("signupSegment", segment);
    authClient.signIn.social({
      provider: "google",
      callbackURL: destWithSignup,
    });
  };

  const handleMagicLink = async () => {
    setError("");
    if (!email) {
      setError("Enter your email to receive a sign-in link.");
      return;
    }
    setMagicLoading(true);
    try {
      if (segment) sessionStorage.setItem("signupSegment", segment);
      const { error: magicError } = await authClient.signIn.magicLink({
        email,
        name: email.split("@")[0],
        callbackURL: destWithSignup,
        errorCallbackURL: "/register",
      });
      if (magicError) throw magicError;
      setMagicSent(true);
    } catch (err) {
      setError(err.message || "Could not send a sign-in link");
    } finally {
      setMagicLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Join the Collection"
      subtitle="Create your partner account to share homes worthy of the journey."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (destWithSignup !== "/" ? "?returnTo=" + encodeURIComponent(destWithSignup) : "")}
            className={AUTH_LINK}
          >
            Sign in
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
          Check your email for a sign-in link. It expires in 15 minutes.
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
              "Email me a sign-in link"
            )}
          </Button>

          <AuthDivider label="or use a password" />

          <div>
            <label htmlFor="password" className={AUTH_LABEL}>
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0A090]" aria-hidden="true" />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={AUTH_INPUT}
                required
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
              />
            </div>
          </div>
          <Button type="submit" className={AUTH_PRIMARY} disabled={busy}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
