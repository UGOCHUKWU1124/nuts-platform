export type PortalRole = "user" | "admin" | "vendor";
export type ApiAuthRole = PortalRole | null;

export const VENDOR_PORTAL_PATHS = [
  "/vendor/analytic",
  "/vendor/discount",
  "/vendor/notifications",
  "/vendor/order",
  "/vendor/product",
  "/vendor/setting",
  "/vendor/wallet",
] as const;

const USER_API_ROUTES = [
  "/account",
  "/auth/me",
  "/auth/logout",
  "/cart",
  "/orders",
  "/payment",
  "/payments",
  "/users",
  "/wishlist",
] as const;

const PUBLIC_AUTH_ACTIONS = [
  "login",
  "register",
  "setup",
  "refresh",
  "otp",
  "forgot-password",
  "reset-password",
  "password-reset",
] as const;

function isWithinPath(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`);
}

function normalizePath(input: string): string {
  let pathname = input;
  try {
    pathname = new URL(input, "http://portal.local").pathname;
  } catch {
    pathname = input.split(/[?#]/, 1)[0] ?? "";
  }

  const normalized = pathname.toLowerCase();
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function stripApiPrefix(path: string): string {
  const apiPrefix = "/api/v1";
  const prefixIndex = path.lastIndexOf(apiPrefix);
  if (prefixIndex < 0) return path;

  const afterPrefix = path.slice(prefixIndex + apiPrefix.length);
  return afterPrefix === "" || afterPrefix.startsWith("/")
    ? afterPrefix || "/"
    : path;
}

function isPublicAuthAction(path: string, authRoute: string): boolean {
  if (!isWithinPath(path, authRoute)) return false;
  const tail = path.slice(authRoute.length);
  const action = tail.split("/").filter(Boolean)[0];
  return PUBLIC_AUTH_ACTIONS.some(
    (publicAction) => action === publicAction || action?.startsWith(`${publicAction}-`),
  );
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

/**
 * Resolve credentials only for known authenticated API namespaces.
 * Public and unknown routes deliberately receive no portal bearer token.
 */
export function getPortalRoleForApiUrl(
  url: string | undefined,
  pathname: string,
  method = "GET",
): ApiAuthRole {
  const path = stripApiPrefix(normalizePath(url ?? ""));
  const httpMethod = method.toUpperCase();

  if (
    isWithinPath(path, "/health") ||
    isWithinPath(path, "/categories") ||
    isWithinPath(path, "/products") ||
    isWithinPath(path, "/search") ||
    isWithinPath(path, "/vendors/store") ||
    (isWithinPath(path, "/reviews") && httpMethod === "GET") ||
    (isWithinPath(path, "/variants") && httpMethod === "GET") ||
    isPublicAuthAction(path, "/auth") ||
    isPublicAuthAction(path, "/admin/auth") ||
    isPublicAuthAction(path, "/vendors/auth")
  ) {
    return null;
  }

  if (isWithinPath(path, "/admin")) return "admin";

  if (
    isWithinPath(path, "/dashboard") ||
    isWithinPath(path, "/vendors/products") ||
    isWithinPath(path, "/vendors/orders") ||
    isWithinPath(path, "/vendors/discounts") ||
    isWithinPath(path, "/vendors/analytics") ||
    isWithinPath(path, "/vendors/wallet") ||
    isWithinPath(path, "/vendors/search") ||
    isWithinPath(path, "/vendors/notifications") ||
    isWithinPath(path, "/vendors/auth/logout") ||
    isWithinPath(path, "/vendors/logout") ||
    isWithinPath(path, "/vendors/account") ||
    isWithinPath(path, "/vendors/me")
  ) {
    return "vendor";
  }

  if (
    USER_API_ROUTES.some((route) => isWithinPath(path, route)) ||
    (isWithinPath(path, "/reviews") && httpMethod !== "GET") ||
    (isWithinPath(path, "/images") && getPortalRoleForPath(pathname) !== "user") ||
    (isWithinPath(path, "/variants") && getPortalRoleForPath(pathname) !== "user") ||
    ((isWithinPath(path, "/payment") || isWithinPath(path, "/payments")) &&
      getPortalRoleForPath(pathname) !== "vendor")
  ) {
    return getPortalRoleForPath(pathname);
  }

  return null;
}
