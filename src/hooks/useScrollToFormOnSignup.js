import { useEffect } from "react";

// Brings the user straight to the application form when they land on an /apply
// page immediately after signing up. The /signup flow appends ?signup=1 to the
// redirect destination; this hook detects it, scrolls the form into view, and
// strips the param so a later refresh doesn't re-scroll.
export function useScrollToFormOnSignup(selector = "#apply-form") {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") !== "1") return;

    let cancelled = false;
    // Small delay so lazy-loaded sections above the form have a chance to
    // mount before we measure the form's position.
    const t = setTimeout(() => {
      if (cancelled) return;
      const el = document.querySelector(selector);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Clean the URL so a refresh doesn't re-trigger the scroll.
      params.delete("signup");
      const remaining = params.toString();
      const cleanUrl =
        window.location.pathname + (remaining ? `?${remaining}` : "") + window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [selector]);
}