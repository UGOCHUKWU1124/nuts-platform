export type PortalRole = "user" | "admin" | "vendor";

export const VENDOR_PORTAL_PATHS = [
  "/vendor/analytic",
  "/vendor/discount",
  "/vendor/notifications",
  "/vendor/order",
  "/vendor/product",
  "/vendor/setting",
  "/vendor/wallet",
] as const;

function isWithinPath(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`);
}

function normalizePath(path: string): string {
  const normalized = (path.split(/[?#]/, 1)[0] ?? "").toLowerCase();
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

/**
 * Public vendor discovery and storefront pages use shopper/guest context.
 * Only the vendor portal's known routes select vendor authentication.
 */
export function getPortalRoleForPath(pathname: string): PortalRole {
  const path = normalizePath(pathname);

  if (isWithinPath(path, "/admin") || isWithinPath(path, "/auth/admin")) {
    return "admin";
  }

  if (
    isWithinPath(path, "/auth/vendor") ||
    VENDOR_PORTAL_PATHS.some((route) => isWithinPath(path, route))
  ) {
    return "vendor";
  }

  return "user";
}

function containsRoute(path: string, route: string): boolean {
  return (
    path === route ||
    path.endsWith(route) ||
    path.includes(`${route}/`)
  );
}

/**
 * Resolve API credentials from the API route first, then from the active portal.
 * Public vendor-store APIs must never trigger vendor-session refresh.
 */
export function getPortalRoleForApiUrl(
  url: string | undefined,
  pathname: string,
): PortalRole | null {
  const path = normalizePath(url ?? "");

  if (containsRoute(path, "/admin")) {
    return "admin";
  }

  if (containsRoute(path, "/vendors/store")) {
    return null;
  }

  if (
    containsRoute(path, "/vendors") ||
    containsRoute(path, "/dashboard")
  ) {
    return "vendor";
  }

  return getPortalRoleForPath(pathname);
}
