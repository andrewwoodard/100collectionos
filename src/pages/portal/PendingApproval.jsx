import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut } from "lucide-react";

export default function PendingApproval() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me()
      .then(u => {
        setUser(u);
        if (u?.id) {
          base44.functions.invoke("notifyPendingUser", {}).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FAFAF8] to-[#F5F0E8] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png"
            alt="The 100 Collection"
            className="w-12 h-12 rounded-lg mx-auto"
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 lg:p-10">
          <h1
            className="text-3xl font-medium text-[#0D1B2A] mb-2 text-center"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
          >
            Welcome to The 100 Collection
          </h1>
          <p className="text-center text-slate-600 text-sm mb-6">
            Your account has been created.
          </p>

          <div className="border-t border-slate-100 pt-6">
            <p className="text-sm text-slate-500 leading-relaxed text-center">
              A team member has been notified and will grant you access to your
              partner portal shortly. You'll receive a confirmation email once
              it's ready. In the meantime, feel free to close this window — we'll
              email you at{" "}
              <span className="text-[#0D1B2A] font-medium">
                {user?.email || "your email"}
              </span>{" "}
              when your access is live.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
            <a
              href="mailto:support@theonehundredcollection.com"
              className="text-xs text-slate-400 hover:text-[#C9A96E] transition-colors"
            >
              Need help? Contact support@theonehundredcollection.com
            </a>
            <button
              onClick={() => base44.auth.logout()}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#0D1B2A] hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}