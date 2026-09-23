import React from "react";

// Spam defense Layer 1: honeypot field. Invisible to humans (positioned far
// off-screen, removed from tab order, hidden from assistive tech), but bots
// that auto-fill every input populate it — which triggers a silent reject
// on the server. Intentionally UNCONTROLLED so bots that set .value directly
// are still detected: the submit handler reads the DOM value at submit time.
export default function HoneypotField() {
  return (
    <input
      type="text"
      name="website_url_confirm"
      tabIndex="-1"
      autoComplete="off"
      aria-hidden="true"
      defaultValue=""
      style={{
        position: "absolute",
        left: "-9999px",
        width: "1px",
        height: "1px",
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
}