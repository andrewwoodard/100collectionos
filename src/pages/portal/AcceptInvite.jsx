import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle, AlertCircle, Loader2, Mail, ArrowRight } from "lucide-react";

export default function AcceptInvite() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided.");
      setLoading(false);
      return;
    }
    base44.functions.invoke("acceptPartnerInvitation", { action: "lookup", token })
      .then((res) => {
        if (res.data?.error) {
          setError(res.data.error);
        } else {
          setInvite(res.data);
        }
      })
      .catch((e) => setError(e.message || "Failed to load invitation"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError("");
    try {
      const res = await base44.functions.invoke("acceptPartnerInvitation", { action: "accept", token });
      if (res.data?.error) {
        if (res.data.error === "auth_required") {
          // Redirect to login, then back here
          base44.auth.redirectToLogin(window.location.href);
          return;
        }
        if (res.data.error === "platform_gate_hit") {
          setError("PLATFORM_GATE");
        } else if (res.data.error === "email_mismatch") {
          setError(`This invitation was sent to ${res.data.expected || invite?.email}. Please sign out and accept it with that account.`);
        } else if (res.data.error === "already_linked") {
          setError(`This email is already linked to another partner${res.data.partner_name ? ` (${res.data.partner_name})` : ""}. Contact support to transfer.`);
        } else if (res.data.error === "already_accepted") {
          setError("This invitation has already been accepted.");
        } else if (res.data.error === "expired") {
          setError("This invitation has expired. Please request a new one.");
        } else if (res.data.error === "revoked") {
          setError("This invitation has been revoked.");
        } else {
          setError(res.data.error);
        }
      } else if (res.data?.redirect) {
        setAccepted(true);
        setTimeout(() => { window.location.href = res.data.redirect; }, 1500);
      }
    } catch (e) {
      const status = e.response?.status;
      if (status === 401) {
        base44.auth.redirectToLogin(window.location.href);
        return;
      }
      setError(e.response?.data?.error || e.message || "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  const isPlatformGate = error === "PLATFORM_GATE";
  const isErrorState = (error && !isPlatformGate) || (invite && ["expired", "revoked", "accepted"].includes(invite.status));

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-6">
          <img src="https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png" alt="The 100 Collection" className="w-10 h-10 rounded-sm mx-auto mb-3" />
          <div className="text-[#C9A96E] text-xs font-semibold uppercase tracking-widest">The 100 Collection</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
          {loading ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="w-8 h-8 text-slate-300 animate-spin mb-3" />
              <p className="text-sm text-slate-400">Loading invitation…</p>
            </div>
          ) : accepted ? (
            <div className="flex flex-col items-center text-center py-4">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
              <h2 className="text-xl font-serif text-[#0D1B2A] mb-2">Welcome to the team!</h2>
              <p className="text-sm text-slate-500">Redirecting you to your dashboard…</p>
              <Loader2 className="w-5 h-5 text-slate-300 animate-spin mt-4" />
            </div>
          ) : isPlatformGate ? (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-14 h-14 bg-[#C9A96E]/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-[#C9A96E]" />
              </div>
              <h2 className="text-xl font-serif text-[#0D1B2A] mb-3">Almost there</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-2">
                Your portal is waiting, but we need a quick permission approval on our end. We've been notified and will approve it within a business day.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                In the meantime, you can safely close this window — we'll email you as soon as your portal is ready.
              </p>
            </div>
          ) : isErrorState ? (
            <div className="flex flex-col items-center text-center py-4">
              <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
              <h2 className="text-lg font-serif text-[#0D1B2A] mb-2">Invitation unavailable</h2>
              <p className="text-sm text-slate-500 mb-5">{error || "This invitation is no longer valid."}</p>
              <p className="text-xs text-slate-400">Please request a new invitation from your team admin or contact support.</p>
            </div>
          ) : invite ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-[#C9A96E]/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-[#C9A96E]" />
              </div>
              {invite.invitation_type === "primary_activation" ? (
                <>
                  <h2 className="text-xl font-serif text-[#0D1B2A] mb-2">Activate your portal</h2>
                  <p className="text-sm text-slate-500 mb-1">Your account for</p>
                  <p className="text-base font-medium text-[#0D1B2A] mb-4">{invite.partner_name} is ready</p>
                  <p className="text-xs text-slate-400 mb-6">
                    Activate your portal to manage properties, view billing, post jobs, and more on the 100 Collection Partner Portal.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-serif text-[#0D1B2A] mb-2">You've been invited</h2>
                  <p className="text-sm text-slate-500 mb-1">
                    {invite.invited_by_name ? `${invite.invited_by_name} has invited you` : "You've been invited"} to join
                  </p>
                  <p className="text-base font-medium text-[#0D1B2A] mb-4">{invite.partner_name}'s portal</p>
                  <p className="text-xs text-slate-400 mb-6">
                    Accepting will give you access to {invite.partner_name}'s properties, billing, and more on the 100 Collection Partner Portal.
                  </p>
                </>
              )}
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full flex items-center justify-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-5 py-3 rounded-xl hover:bg-[#1a2f47] transition-colors disabled:opacity-60"
              >
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {accepting ? "Activating…" : invite.invitation_type === "primary_activation" ? "Activate my portal" : "Accept invitation"}
              </button>
              <p className="text-[10px] text-slate-400 mt-3">
                Invitation sent to {invite.email} · Expires {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : ""}
              </p>
            </div>
          ) : (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-slate-300 mb-4 mx-auto" />
              <p className="text-sm text-slate-500">{error || "Invitation not found."}</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          The 100 Collection · Curated Luxury Vacation Rentals
        </p>
      </div>
    </div>
  );
}