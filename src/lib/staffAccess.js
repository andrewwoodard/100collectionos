/**
 * Internal Collection OS staff roles and page access.
 * Partners use partner_role separately; this gates the admin shell only.
 */

export const STAFF_ROLES = [
  "admin",
  "operations",
  "onboarding",
  "finance",
  "marketing",
  "media",
];

/** Pages each non-admin staff role may open. Admin always has full access. */
export const STAFF_PAGE_ACCESS = {
  media: ["MediaLibrary"],
};

/** Tabs media role may use inside Media Library (brand asset library excluded). */
export const MEDIA_ROLE_TABS = ["property-images", "sanity-images", "blog-posts"];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(String(role || ""));
}

export function isAdminRole(role) {
  const r = String(role || "");
  return r === "admin" || r === "super_admin";
}

/** Whether a user role may open a Collection OS page (e.g. "MediaLibrary"). */
export function canAccessStaffPage(role, pageName) {
  if (isAdminRole(role)) return true;
  const allowed = STAFF_PAGE_ACCESS[String(role || "")];
  if (!allowed) return false;
  return allowed.includes(pageName);
}

/** Roles allowed to render a given page route (includes admin). */
export function rolesForStaffPage(pageName) {
  const roles = new Set(["admin"]);
  for (const [role, pages] of Object.entries(STAFF_PAGE_ACCESS)) {
    if (pages.includes(pageName)) roles.add(role);
  }
  return [...roles];
}

export function defaultHomeForRole(role) {
  if (isAdminRole(role)) return "/admin/hub";
  if (role === "media") return "/MediaLibrary?tab=property-images";
  if (isStaffRole(role)) {
    const first = STAFF_PAGE_ACCESS[role]?.[0];
    return first ? `/${first}` : "/MediaLibrary";
  }
  return "/portal/dashboard";
}

/** Media staff: property images + Sanity images/posts — not the brand asset library. */
export function isMediaRestrictedRole(role) {
  return String(role || "") === "media";
}

/** @deprecated use isMediaRestrictedRole */
export function isMediaPropertyImagesOnly(role) {
  return isMediaRestrictedRole(role);
}

export function canUseMediaLibraryTab(role, tab) {
  if (isAdminRole(role)) return true;
  if (!isMediaRestrictedRole(role)) return true;
  return MEDIA_ROLE_TABS.includes(tab);
}
