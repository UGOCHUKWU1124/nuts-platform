import { performTokenRefresh } from "@/api/core/client";
import { clearAuthTokens,getAuthToken } from "@/api/core/token-storage";
import { getActiveRole,useAuthStore,type AuthRole } from "@/zustand/auth";
import { authBroadcast,type AuthEvent } from "./auth-events";

let bootstrapPromise: Promise<void> | null = null;
let broadcastSubscribed = false;

export function hasSessionIndicatorCookieForRole(role: AuthRole): boolean {
  if (typeof document === "undefined") return false;
  const cookie = document.cookie;
  if (role === "admin") {
    return cookie.includes("admin_session=1") || cookie.includes("admin_access_token");
  }
  if (role === "vendor") {
    return cookie.includes("vendor_session=1") || cookie.includes("vendor_access_token");
  }
  return cookie.includes("user_session=1") || cookie.includes("user_access_token");
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
        clearAuthTokens(activeRole);
        resetAuthBootstrap();
        useAuthStore.getState().clearSession(activeRole);
      } else if (event.type === "LOGIN") {
        resetAuthBootstrap();
        void authBootstrap();
      }
    });
  }

  const current = useAuthStore.getState();
  current.syncActiveRole(currentRole);

  const roleSession = current.sessions?.[currentRole];
  const hasToken = Boolean(getAuthToken(currentRole));
  const hasCookie = hasSessionIndicatorCookieForRole(currentRole);

  // If already authenticated with active in-memory token and valid cookie for this surface, no-op.
  if (roleSession?.isAuthenticated && roleSession?.user && hasCookie && hasToken) {
    return;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    // If no explicit session indicator cookie exists for this portal, user is definitively a guest on this surface
    if (!hasSessionIndicatorCookieForRole(currentRole)) {
      useAuthStore.getState().clearSession(currentRole);
      return;
    }

    const state = useAuthStore.getState();
    const existingSession = state.sessions?.[currentRole];
    const hasPersistedUser = Boolean(existingSession?.user);

    // If session is already authenticated, has user, and has in-memory token, no need to refresh
    if (existingSession?.isAuthenticated && hasPersistedUser && getAuthToken(currentRole)) {
      return;
    }

    if (!hasPersistedUser) {
      useAuthStore.getState().setStatus("hydrating");
    }

    try {
      const refreshed = await performTokenRefresh(undefined, currentRole);
      const refreshedUser = refreshed.user;
      if (
        !refreshed.success ||
        !refreshedUser || typeof refreshedUser !== "object" ||
        !("id" in refreshedUser) || typeof refreshedUser.id !== "string" ||
        !("email" in refreshedUser) || typeof refreshedUser.email !== "string"
      ) {
        useAuthStore.getState().clearSession(currentRole);
        return;
      }

      useAuthStore.getState().setSession({
        id: refreshedUser.id,
        email: refreshedUser.email,
        firstName: "firstName" in refreshedUser && typeof refreshedUser.firstName === "string" ? refreshedUser.firstName : null,
        lastName: "lastName" in refreshedUser && typeof refreshedUser.lastName === "string" ? refreshedUser.lastName : null,
      }, currentRole);
    } catch {
      useAuthStore.getState().clearSession(currentRole);
    }
  })();

  return bootstrapPromise;
};

export const resetAuthBootstrap = () => {
  bootstrapPromise = null;
};
