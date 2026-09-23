/**
 * StatusBadge — thin wrapper around StatusPill for backward compatibility.
 * All new code should use <StatusPill value="..." /> directly.
 */
import React from "react";
import StatusPill from "./StatusPill";

export default function StatusBadge({ status }) {
  if (!status) return null;
  return <StatusPill value={status} />;
}