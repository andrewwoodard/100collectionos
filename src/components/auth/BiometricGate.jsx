import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { isWebAuthnSupported, verifyBiometric, storageKeyFor } from "@/lib/webauthn";
import { Fingerprint, Lock, ShieldAlert, Loader2, ScanFace } from "lucide-react";

const SESSION_KEY = "biometric_verified_session";
const IMPERSONATE_KEY = "impersonate_user_id";

/**
 * Gates the app behind a Face ID / fingerprint prompt for users who have
 * enrolled a biometric on this device. Renders children once verified.
 */
export default function BiometricGate({ children }) {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState("checking"); // checking | gating | verified | unsupported | error

  const prompt = useCallback(
    async (credId) => {
      try {
        const ok = await verifyBiometric(credId);
        if (ok) {
          sessionStorage.setItem(SESSION_KEY, user.id);
          setStatus("verified");
        } else {
          setStatus("error");
        }
      } catch (e) {
        // Cancelled or failed — let the user retry or fall back to password
        setStatus("error");
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) {
      setStatus("verified");
      return;
    }

    // Don't gate during view-only admin impersonation
    if (sessionStorage.getItem(IMPERSONATE_KEY)) {
      setStatus("verified");
      return;
    }

    const enrolledId = localStorage.getItem(storageKeyFor(user.id));
    if (!enrolledId) {
      setStatus("verified");
      return;
    }

    if (!isWebAuthnSupported()) {
      setStatus("unsupported");
      return;
    }

    if (sessionStorage.getItem(SESSION_KEY) === user.id) {
      setStatus("verified");
      return;
    }

    setStatus("gating");
    prompt(enrolledId);
  }, [user, prompt]);

  const retry = () => {
    const enrolledId = user && localStorage.getItem(storageKeyFor(user.id));
    if (!enrolledId) {
      setStatus("verified");
      return;
    }
    setStatus("gating");
    prompt(enrolledId);
  };

  const handleUsePassword = () => {
    sessionStorage.removeItem(SESSION_KEY);
    logout();
  };

  if (status === "verified" || status === "checking") {
    // While checking, children render normally (brief). Verified = show app.
    return <>{children}</>;
  }

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 blur-xl scale-105 opacity-30">
        {children}
      </div>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0D1B2A]/95 backdrop-blur-sm">
        <div className="max-w-sm w-full mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
          {status === "gating" && (
            <div className="px-8 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-[#0F172A]/5 flex items-center justify-center mx-auto mb-5">
                <ScanFace className="w-8 h-8 text-[#0F172A]" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Use Face ID to continue</h2>
              <p className="text-sm text-gray-500 mb-6">
                Confirm it's you to unlock The 100 Collection.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for biometric…
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="px-8 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
                <ShieldAlert className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Biometric verification needed</h2>
              <p className="text-sm text-gray-500 mb-6">
                We couldn't verify your Face ID or fingerprint. Try again, or sign in with your password.
              </p>
              <div className="space-y-2">
                <button
                  onClick={retry}
                  data-impersonation-exempt
                  className="w-full flex items-center justify-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <Fingerprint className="w-4 h-4" /> Try again
                </button>
                <button
                  onClick={handleUsePassword}
                  data-impersonation-exempt
                  className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <Lock className="w-4 h-4" /> Sign in with password
                </button>
              </div>
            </div>
          )}

          {status === "unsupported" && (
            <div className="px-8 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
                <ShieldAlert className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Biometric not available</h2>
              <p className="text-sm text-gray-500 mb-6">
                You've enabled Face ID login, but this browser or device doesn't support it. Sign in with your password to continue, then re-enroll from this device's profile if needed.
              </p>
              <button
                onClick={handleUsePassword}
                data-impersonation-exempt
                className="w-full flex items-center justify-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <Lock className="w-4 h-4" /> Sign in with password
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}