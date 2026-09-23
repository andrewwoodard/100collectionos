export const PARTNER_ROLES = ["owner", "marketing", "finance", "operations"];

export const ROLE_LABELS = {
  owner: "Owner",
  marketing: "Marketing",
  finance: "Finance",
  operations: "Operations",
};

export const ROLE_STYLES = {
  owner: "bg-[#0D1B2A] text-white",
  marketing: "bg-[#C9A96E]/15 text-[#C9A96E]",
  finance: "bg-emerald-50 text-emerald-700",
  operations: "bg-slate-100 text-slate-600",
};

export const ROLE_PAGE_PREVIEW = {
  owner: "All pages: Overview, Properties, Billing, Careers, Tech Stack, Team",
  marketing: "Overview, Properties, Add Property, Careers, Team",
  finance: "Overview, Billing, Team",
  operations: "Overview, Properties, Add Property, Careers, Tech Stack, Team",
};

// Sidebar nav items with role-based visibility
export const PARTNER_NAV_GROUPS = [
  { caption: null, items: [
    { label: "Overview", path: "/portal/dashboard", roles: ["owner", "marketing", "finance", "operations"] },
    { label: "My Properties", path: "/portal/properties", roles: ["owner", "marketing", "operations"] },
    { label: "Add Property", path: "/portal/add-property", roles: ["owner", "marketing", "operations"] },
  ]},
  { caption: "Manage", items: [
    { label: "Billing & Licensing", path: "/portal/billing", roles: ["owner", "finance"] },
    { label: "Careers", path: "/portal/careers", roles: ["owner", "marketing", "operations"] },
  ]},
  { caption: "Settings", items: [
    { label: "My Profile", path: "/portal/profile", roles: ["owner", "marketing", "finance", "operations"] },
    { label: "Tech Stack", path: "/portal/tech-stack", roles: ["owner", "operations"] },
    { label: "Team", path: "/portal/team", roles: ["owner", "marketing", "finance", "operations"] },
  ]},
];

// Route-level role access (for RequirePortalRole)
export const ROUTE_ROLE_ACCESS = {
  "/portal/dashboard": ["owner", "marketing", "finance", "operations"],
  "/portal/properties": ["owner", "marketing", "operations"],
  "/portal/add-property": ["owner", "marketing", "operations"],
  "/portal/billing": ["owner", "finance"],
  "/portal/careers": ["owner", "marketing", "operations"],
  "/portal/profile": ["owner", "marketing", "finance", "operations"],
  "/portal/tech-stack": ["owner", "operations"],
  "/portal/team": ["owner", "marketing", "finance", "operations"],
  "/portal/notifications": ["owner", "marketing", "finance", "operations"],
};

/**
 * Filter notifications by the user's partner_role.
 * Notifications with empty/undefined target_partner_roles are shown to all (backward compatible).
 */
export function filterNotificationsByRole(notifications, role) {
  if (!role) return notifications;
  return (notifications || []).filter(n =>
    !n.target_partner_roles ||
    !Array.isArray(n.target_partner_roles) ||
    n.target_partner_roles.length === 0 ||
    n.target_partner_roles.includes(role)
  );
}

/**
 * Get the effective partner role for the current user.
 * Returns null for admins (no filtering).
 */
export function getEffectiveRole(user) {
  if (!user) return "owner";
  if (user.role === "admin") return null;
  return user.partner_role || "owner";
}