import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { useAuth } from "@/lib/AuthContext";
import { getAttributionSnapshot } from "@/lib/attribution";

// Decodes a JWT payload (client-side) to extract the email claim. The token
// payload is base64url, not encrypted, so this is safe. Returns null if the
// token is not a JWT or has no email claim.
function decodeEmailFromToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email || payload.preferred_email || payload.user_email || payload.sub || null;
  } catch (_) {
    return null;
  }
}

// Renders a brief loading spinner while it fires the handleColdSignup
// backend function, then redirects the user to /apply with a from=signup
// banner. The redirect always fires (success or failure) so the user is
// never stuck on a blank screen.
export default function ColdSignupHandler() {
  const navigate = useNavigate();
  const { authError } = useAuth();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const tokenEmail = decodeEmailFromToken(appParams.token);
    const errorEmail = authError?.extraData?.email || authError?.extraData?.user_email || null;
    const email = (errorEmail || tokenEmail || "").toString().trim().toLowerCase();

    const redirect = () => {
      const params = new URLSearchParams({ from: "signup" });
      if (email) params.set("email", email);
      navigate(`/apply?${params.toString()}`, { replace: true });
    };

    if (!email) {
      redirect();
      return;
    }

    // Best-effort: create the access request + send the routing email.
    // If the platform blocks function invocation for unregistered users,
    // the redirect still fires and the user lands on /apply.
    const attribution = getAttributionSnapshot();
    base44.functions
      .invoke("handleColdSignup", { email, attribution })
      .catch(() => {})
      .finally(redirect);
  }, [navigate, authError]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#FAFBFC]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#C9A96E] rounded-full animate-spin"></div>
        <p className="text-sm text-slate-500">Getting you started...</p>
      </div>
    </div>
  );
}