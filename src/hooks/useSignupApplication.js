import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

// When a visitor signs up via /signup?redirect=vrm|homeowner, Register sets a
// sessionStorage flag ("signupSegment") before redirecting to the apply form.
// On the apply page mount, if the flag is present and the visitor is now
// authenticated, create a tagged PartnerApplication stub via the backend
// function so admins see the lead immediately. The flag is cleared on first
// read so the stub is created exactly once.
export function useSignupApplication() {
  useEffect(() => {
    let alive = true;
    const segment = sessionStorage.getItem("signupSegment");
    if (!segment) return;
    sessionStorage.removeItem("signupSegment");

    base44.auth
      .isAuthenticated()
      .then(async (authed) => {
        if (!authed || !alive) return;
        try {
          await base44.functions.invoke("createSignupApplication", { segment });
        } catch (e) {
          console.warn("[signup] createSignupApplication failed", e);
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);
}