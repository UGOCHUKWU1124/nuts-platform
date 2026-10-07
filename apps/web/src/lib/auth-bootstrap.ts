import { performTokenRefresh } from "@/api/core/client";
import { clearAuthTokens } from "@/api/core/token-storage";
import { clearBrowserQueryClient } from "@/lib/query-client";
import { getActiveRole,useAuthStore,type AuthRole } from "@/zustand/auth";
import { authBroadcast,type AuthEvent } from "./auth-events";

const bootstrapPromises = new Map<AuthRole, Promise<void>>();
let broadcastSubscribed = false;

export function hasSessionIndicatorCookieForRole(role: AuthRole): boolean {
  if (typeof document === "undefined") return false;
  const cookies = new Map(
    document.cookie
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter((parts) => parts.length >= 2)
      .map(([name, ...value]) => [name, value.join("=")]),
  );
  if (role === "admin") {
    return (
      cookies.get("admin_session") === "1" ||
      cookies.has("admin_access_token")
    );
  }
  if (role === "vendor") {
    return (
      cookies.get("vendor_session") === "1" ||
      cookies.has("vendor_access_token")
    );
  }
  return cookies.get("user_session") === "1" || cookies.has("user_access_token");
}

/**
 * Idempotent bootstrap function resilient to React Strict Mode double-mounts.
 * Scoped strictly to the active portal surface (user / vendor / admin).
 */
export const authBootstrap = async (): Promise<void> => {
  if (typeof window === "undefined") return;

  const currentRole = getActiveRole();

  // Initialize cross-tab synchronization listener once
  if (!broadcastSubscribed) {
    broadcastSubscribed = true;
    authBroadcast.subscribe((event: AuthEvent) => {
      const activeRole = getActiveRole();
      // If event is scoped to a specific surface/role and doesn't match active surface, ignore!
      if (event.role && event.role !== activeRole) {
        return;
      }

      if (event.type === "LOGOUT" || event.type === "SESSION_EXPIRED") {
        clearBrowserQueryClient();
        clearAuthTokens(activeRole);
        resetAuthBootstrap();
        useAuthStore.getState().clearSession(activeRole);
      } else if (event.type === "LOGIN") {
        clearBrowserQueryClient();
        resetAuthBootstrap();
        void authBootstrap();
      }
    });
  }

  const current = useAuthStore.getState();
  current.syncActiveRole(currentRole);

  const roleSession = current.sessions?.[currentRole];
  const hasCookie = hasSessionIndicatorCookieForRole(currentRole);

  // If Zustand session is already authenticated and the session cookie is still present,
  // skip the refresh. The in-memory access token is intentionally excluded: it resets to null
  // on every page reload (JS module re-init), so including it would trigger a needless /refresh
  // on every page load even when the session is perfectly valid. Genuine token expiry is
  // caught lazily by the 401 interceptor in client.ts, which then calls performTokenRefresh.
  if (roleSession?.isAuthenticated && roleSession?.user && hasCookie) {
    return;
  }

  const pendingBootstrap = bootstrapPromises.get(currentRole);
  if (pendingBootstrap) {
    return pendingBootstrap;
  }

  const bootstrapPromise = (async () => {
    // If no explicit session indicator cookie exists for this portal, user is definitively a guest on this surface
    if (!hasSessionIndicatorCookieForRole(currentRole)) {
      useAuthStore.getState().clearSession(currentRole);
      return;
    }

    const state = useAuthStore.getState();
    const existingSession = state.sessions?.[currentRole];
    const hasPersistedUser = Boolean(existingSession?.user);

    // If session is already authenticated and we have the user profile, skip refresh.
    // Token expiry is handled lazily by the 401 interceptor in client.ts.
    if (existingSession?.isAuthenticated && hasPersistedUser) {
      return;
    }

    if (!hasPersistedUser && getActiveRole() === currentRole) {
      useAuthStore.getState().setStatus("hydrating");
    }

    try {
      const refreshed = await performTokenRefresh(undefined, currentRole);
      if (!refreshed.success) {
        if (refreshed.reason === "expired") {
          useAuthStore.getState().clearSession(currentRole);
        } else if (getActiveRole() === currentRole) {
          useAuthStore.getState().setStatus("unavailable");
        }
        return;
      }

      const refreshedUser = refreshed.user;
      if (
        !refreshedUser ||
        typeof refreshedUser !== "object" ||
        !("id" in refreshedUser) ||
        typeof refreshedUser.id !== "string" ||
        !("email" in refreshedUser) ||
        typeof refreshedUser.email !== "string"
      ) {
        if (getActiveRole() === currentRole) {
          useAuthStore.getState().setStatus("unavailable");
        }
        return;
      }

      const profile = refreshedUser as Record<string, unknown>;
      const optionalString = (value: unknown) =>
        typeof value === "string" ? value : undefined;

      useAuthStore.getState().setSession({
        id: refreshedUser.id,
        email: refreshedUser.email,
        firstName: optionalString(profile.firstName) ?? null,
        lastName: optionalString(profile.lastName) ?? null,
        phone: optionalString(profile.phone) ?? null,
        phoneNumber: optionalString(profile.phoneNumber) ?? null,
        storeName: optionalString(profile.storeName),
        storeSlug: optionalString(profile.storeSlug),
        storeLogoUrl:
          typeof profile.storeLogoUrl === "string" || profile.storeLogoUrl === null
            ? profile.storeLogoUrl
            : undefined,
        isVerified:
          typeof profile.isVerified === "boolean" ? profile.isVerified : undefined,
        isActive: typeof profile.isActive === "boolean" ? profile.isActive : undefined,
      }, currentRole);
    } catch (error) {
      console.error("Session bootstrap failed unexpectedly", error);
      if (getActiveRole() === currentRole) {
        useAuthStore.getState().setStatus("unavailable");
      }
    }
  })();

  bootstrapPromises.set(currentRole, bootstrapPromise);
  try {
    await bootstrapPromise;
  } finally {
    if (bootstrapPromises.get(currentRole) === bootstrapPromise) {
      bootstrapPromises.delete(currentRole);
    }
  }
};

export const resetAuthBootstrap = () => {
  bootstrapPromises.clear();
};
