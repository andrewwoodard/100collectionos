import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const GA_MEASUREMENT_ID = "G-ZD7RJX88Q7";

export default function GoogleAnalytics() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (typeof window.gtag !== "function") return;
    const page_path = pathname + search;
    window.gtag("event", "page_view", {
      send_to: GA_MEASUREMENT_ID,
      page_title: document.title,
      page_location: window.location.origin + page_path,
      page_path,
    });
  }, [pathname, search]);

  return null;
}
