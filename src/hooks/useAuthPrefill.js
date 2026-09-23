import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Prefills the application form with the authenticated user's email (and full
// name when available) so a visitor who just signed up via /signup?redirect=...
// doesn't have to re-enter them on the apply form. On the public (logged-out)
// flow nothing changes — the form stays editable as before.
// Returns the set of fields that were prefilled from the account.
export function useAuthPrefill(setForm) {
  const [prefilled, setPrefilled] = useState({ email: false, full_name: false });

  useEffect(() => {
    let alive = true;
    base44.auth
      .isAuthenticated()
      .then(async (authed) => {
        if (!authed) return;
        try {
          const user = await base44.auth.me();
          if (!alive || !user?.email) return;
          setForm((f) => ({
            ...f,
            email: user.email,
            full_name: f.full_name || user.full_name || "",
          }));
          setPrefilled({ email: true, full_name: Boolean(user.full_name) });
        } catch {
          /* not logged in — leave the form editable */
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [setForm]);

  return prefilled;
}