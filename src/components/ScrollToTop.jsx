import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Resets scroll to the top on every client-side navigation, with carve-outs:
// - POP (back/forward): let the browser restore scroll natively
// - hash present: scroll to the anchored element instead of the top
export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;

    const { hash } = window.location;
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search, navigationType]);

  return null;
}