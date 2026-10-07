import { adminAuthService, userService, vendorAccountService } from "@/api";
import { AuthRefreshUnavailableError } from "@/api/core/client";
import { clearAuthTokens } from "@/api/core/token-storage";
import { clearBrowserQueryClient } from "@/lib/query-client";
import { getActiveRole,useAuthStore,type AuthRole } from "@/zustand/auth";
import { authBroadcast,type AuthEvent } from "./auth-events";
import axios from "axios";

const bootstrapPromises = new Map<AuthRole, Promise<void>>();
let broadcastSubscribed = false;

async function getCurrentProfile(role: AuthRole): Promise<unknown> {
  if (role === "admin") {
    return (await adminAuthService.me()).data;
  }
  if (role === "vendor") {
    return (await vendorAccountService.me()).data;
  }
  return (await userService.me()).data;
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

  // Auth cookies are HttpOnly and may be host-only on a separate API origin, so
  // the frontend cannot reliably use a readable cookie as proof of a session.
  if (roleSession?.isAuthenticated && roleSession?.user) {
    return;
  }

  const pendingBootstrap = bootstrapPromises.get(currentRole);
  if (pendingBootstrap) {
    return pendingBootstrap;
  }

  const bootstrapPromise = (async () => {
    const state = useAuthStore.getState();
    const existingSession = state.sessions?.[currentRole];
    const hasSessionUser = Boolean(existingSession?.user);

    if (!hasSessionUser && getActiveRole() === currentRole) {
      useAuthStore.getState().setStatus("hydrating");
    }

    try {
      // Validate the access cookie first. The shared Axios interceptor refreshes
      // and retries this request only when the access token has actually expired.
      const profile = await getCurrentProfile(currentRole);
      if (
        !profile ||
        typeof profile !== "object" ||
        !("id" in profile) ||
        typeof profile.id !== "string" ||
        !("email" in profile) ||
        typeof profile.email !== "string"
      ) {
        if (getActiveRole() === currentRole) {
          useAuthStore.getState().setStatus("unavailable");
        }
        return;
      }

      const sessionProfile = profile as Record<string, unknown>;
      const optionalString = (value: unknown) =>
        typeof value === "string" ? value : undefined;

      useAuthStore.getState().setSession({
        id: profile.id,
        email: profile.email,
        firstName: optionalString(sessionProfile.firstName) ?? null,
        lastName: optionalString(sessionProfile.lastName) ?? null,
        phone: optionalString(sessionProfile.phone) ?? null,
        phoneNumber: optionalString(sessionProfile.phoneNumber) ?? null,
        storeName: optionalString(sessionProfile.storeName),
        storeSlug: optionalString(sessionProfile.storeSlug),
        storeLogoUrl:
          typeof sessionProfile.storeLogoUrl === "string" || sessionProfile.storeLogoUrl === null
            ? sessionProfile.storeLogoUrl
            : undefined,
        isVerified:
          typeof sessionProfile.isVerified === "boolean" ? sessionProfile.isVerified : undefined,
        isActive:
          typeof sessionProfile.isActive === "boolean" ? sessionProfile.isActive : undefined,
      }, currentRole);
    } catch (error) {
      if (error instanceof AuthRefreshUnavailableError) {
        if (getActiveRole() === currentRole) {
          useAuthStore.getState().setStatus("unavailable");
        }
        return;
      }

      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 403) {
        useAuthStore.getState().clearSession(currentRole);
        return;
      }

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
