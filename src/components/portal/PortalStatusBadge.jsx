/**
 * PortalStatusBadge — backward-compat wrapper around StatusPill.
 * New code should use <StatusPill value="..." /> directly.
 */
import React from "react";
import StatusPill from "@/components/shared/StatusPill";

export default function PortalStatusBadge({ status, size = "sm" }) {
  if (!status) return null;
  return <StatusPill value={status} size={size} />;
}