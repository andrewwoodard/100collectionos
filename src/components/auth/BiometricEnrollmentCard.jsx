import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import {
  enrollBiometric,
  isPlatformAuthenticatorAvailable,
  isWebAuthnSupported,
  storageKeyFor,
} from "@/lib/webauthn";
import {
  Fingerprint,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  ScanFace,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Profile card for enrolling / removing Face ID & fingerprint login.
 * Works for both admins (Settings) and portal users (Partner Profile).
 * Stores enrolled credentials on the user profile via base44.auth.updateMe.
 */
export default function BiometricEnrollmentCard() {
  const { user, refreshUser } = useAuth();
  const [supported, setSupported] = useState(null);
  const [enrolling, setEnrolling] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const credentials = Array.isArray(user?.biometric_credentials) ? user.biometric_credentials : [];

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = isWebAuthnSupported() && (await isPlatformAuthenticatorAvailable());
      if (mounted) setSupported(ok);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleEnroll = async () => {
    if (!user) return;
    setEnrolling(true);
    try {
      const label = user.full_name || user.email || "user";
      const cred = await enrollBiometric(label);

      // Store credential id on the user profile + locally for this device
      const updated = [...credentials, cred];
      await base44.auth.updateMe({ biometric_credentials: updated });
      localStorage.setItem(storageKeyFor(user.id), cred.id);

      await refreshUser();
      toast.success("Face ID / fingerprint enabled", {
        description: "You can now sign in to The 100 Collection with biometrics on this device.",
      });
    } catch (e) {
      if (e?.name === "NotAllowedError" || /cancel/i.test(e?.message || "")) {
        toast("Enrollment cancelled.");
      } else {
        toast.error("Couldn't enable biometrics", { description: e?.message });
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemove = async (credId) => {
    if (!user) return;
    setRemovingId(credId);
    try {
      const updated = credentials.filter((c) => c.id !== credId);
      await base44.auth.updateMe({ biometric_credentials: updated });

      // Clear local device binding if this was the active credential
      if (localStorage.getItem(storageKeyFor(user.id)) === credId) {
        localStorage.removeItem(storageKeyFor(user.id));
      }

      await refreshUser();
      toast.success("Device removed from biometric login.");
    } catch (e) {
      toast.error("Couldn't remove device", { description: e?.message });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
          <Fingerprint className="w-4 h-4" />
        </div>
        <h2 className="font-medium text-slate-900 font-sans text-sm">Face ID &amp; Fingerprint Login</h2>
      </div>
      <p className="text-xs text-slate-500 mb-5 leading-relaxed">
        Skip the password. Enroll this device's biometric sensor (Face ID, Touch ID, Windows Hello, or fingerprint) and you'll be prompted to verify with it the next time you open the app.
      </p>

      {supported === false && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3 mb-4">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            This device or browser doesn't support biometric login. Try a device with Face ID, Touch ID, Windows Hello, or Android fingerprint.
          </p>
        </div>
      )}

      {credentials.length > 0 && (
        <div className="space-y-2 mb-4">
          {credentials.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between bg-emerald-50/60 border border-emerald-100 rounded-lg px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{c.deviceLabel || "Enrolled device"}</p>
                  <p className="text-xs text-slate-400">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Enabled"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(c.id)}
                disabled={removingId === c.id}
                data-impersonation-exempt
                className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                title="Remove this device"
              >
                {removingId === c.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleEnroll}
        disabled={enrolling || supported === false}
        data-impersonation-exempt
        className="w-full flex items-center justify-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        {enrolling ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Enrolling…
          </>
        ) : (
          <>
            {credentials.length > 0 ? <ScanFace className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {credentials.length > 0 ? "Add another device" : "Enable Face ID / Fingerprint"}
          </>
        )}
      </button>
    </div>
  );
}