import { useEffect } from "react";
import { captureTouch } from "@/lib/attribution";

const FIRST_TOUCH_KEY = "100c_first_touch";
const LAST_TOUCH_KEY = "100c_last_touch";
const SESSION_TOUCH_KEY = "100c_session_touch";

// Runs once per page load. Stamps first-touch (never overwrites), last-touch
// (always overwrites), and session-touch (per tab session) so signup flows can
// later read a clean multi-touch picture via getAttributionSnapshot().
export default function useAttributionCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const touch = captureTouch();
    try {
      if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
        localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
      }
    } catch (_) {}
    try {
      localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
    } catch (_) {}
    try {
      sessionStorage.setItem(SESSION_TOUCH_KEY, JSON.stringify(touch));
    } catch (_) {}
  }, []);
}