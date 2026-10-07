import {
adminAuthService,
authService,
userService,
vendorAccountService,
vendorAuthService,
} from "@/api";
import {
type StoredTokens,
clearAuthTokens,
getAuthToken,
getRefreshToken,
setAuthTokens,
} from "@/api/core/token-storage";
import type { AuthRole } from "@/api/dto/auth";
import type { AuthResponseDto } from "@/api/dto/auth";
import type { VendorAuthSessionDto } from "@/api/dto/vendor";
import type { ShippingInformation,UserResponseDto } from "@/api/dto/user";
import axios from "axios";
import { authBootstrap,resetAuthBootstrap } from "@/lib/auth-bootstrap";
import { authBroadcast } from "@/lib/auth-events";
import { getPortalRoleForPath } from "@/lib/portal-role";
import { clearBrowserQueryClient } from "@/lib/query-client";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { create } from "zustand";
import { clearWishlistOnLogout } from "./wishlist";

export type AuthStatus =
  | "unknown"
  | "hydrating"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

export type User = UserResponseDto & {
  role: AuthRole;
  avatar?: string;
  storeName?: string;
  storeSlug?: string;
  storeLogoUrl?: string | null;
  isVerified?: boolean;
  isActive?: boolean;
  phone?: string | null;
  phoneNumber?: string | null;
};

type SessionUserInput = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  createdAt?: Date | string;
  phone?: string | null;
  phoneNumber?: string | null;
  shippingInformation?: ShippingInformation | null;
  storeName?: string;
  storeSlug?: string;
  storeLogoUrl?: string | null;
  isVerified?: boolean;
  isActive?: boolean;
};

export { getAuthToken,getRefreshToken,setAuthTokens };
export type { AuthRole,ShippingInformation,StoredTokens };

const normalizeRole = (role?: string | null): AuthRole | null => {
  if (!role) return null;
  const normalized = role.toLowerCase();
  if (normalized === "user" || normalized === "admin" || normalized === "vendor") {
    return normalized as AuthRole;
  }
  return null;
};

export interface LogoutOptions {
  skipApi?: boolean;
  redirectTo?: string;
}

interface UnifiedLoginPayload {
  email: string;
  password: string;
  role: AuthRole;
}

export const getActiveRole = (): AuthRole => {
  if (typeof window === "undefined") return "user";
  return getPortalRoleForPath(window.location.pathname);
};

export interface RoleSessionState {
  user: User | null;
  role: AuthRole;
  isAuthenticated: boolean;
  status: AuthStatus;
}

const defaultSessions: Record<AuthRole, RoleSessionState> = {
  user: { user: null, role: "user", isAuthenticated: false, status: "unknown" },
  vendor: { user: null, role: "vendor", isAuthenticated: false, status: "unknown" },
  admin: { user: null, role: "admin", isAuthenticated: false, status: "unknown" },
};

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  role: AuthRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  sessions: Record<AuthRole, RoleSessionState>;

  // State machine mutations
  syncActiveRole: (targetRole?: AuthRole) => void;
  setSession: (user: SessionUserInput, role: AuthRole) => void;
  clearSession: (targetRole?: AuthRole) => void;
  setStatus: (status: AuthStatus) => void;
  setUser: (user: User | UserResponseDto | null) => void;

  // Auth Operations
  login: (payload: UnifiedLoginPayload) => Promise<void>;
  logout: (options?: LogoutOptions & { role?: AuthRole }) => Promise<void>;
  hydrateRole: (role: AuthRole) => void;
  hydrateFromCookies: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  (set, get) => ({
      status: "unknown",
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: true,
      isInitialized: false,
      sessions: { ...defaultSessions },

      syncActiveRole: (targetRole) => {
        const active = targetRole || getActiveRole();
        const activeSession = get().sessions?.[active];
        if (activeSession?.user && activeSession.status !== "unavailable") {
          set({
            user: activeSession.user,
            role: active,
            isAuthenticated: true,
            status: "authenticated",
            isLoading: false,
            isInitialized: true,
          });
        } else if (activeSession?.status === "unavailable") {
          set({
            user: activeSession.user,
            role: active,
            isAuthenticated: false,
            status: "unavailable",
            isLoading: false,
            isInitialized: true,
          });
        } else {
          const nextStatus =
            activeSession?.status === "unauthenticated"
              ? "unauthenticated"
              : "hydrating";
          set({
            user: null,
            role: null,
            isAuthenticated: false,
            status: nextStatus,
            isLoading: nextStatus === "hydrating",
            isInitialized: nextStatus !== "hydrating",
          });
        }
      },

      setStatus: (status) =>
        set((state) => {
          const active = getActiveRole();
          const activeSession = state.sessions[active];
          const sessions =
            status === "hydrating" || status === "unavailable"
              ? {
                  ...state.sessions,
                  [active]: { ...activeSession, status },
                }
              : state.sessions;

          return {
          sessions,
          status,
          isLoading: status === "unknown" || status === "hydrating",
          isInitialized: status !== "unknown",
          isAuthenticated: status === "authenticated",
          };
        }),

      setSession: (rawUser, role) => {
        const normalized = normalizeRole(role) || "user";
        const user: User = {
          id: rawUser.id,
          email: rawUser.email,
          firstName: rawUser.firstName ?? null,
          lastName: rawUser.lastName ?? null,
          role: normalized,
          storeName: rawUser.storeName,
          storeSlug: rawUser.storeSlug,
          storeLogoUrl: rawUser.storeLogoUrl ?? null,
          isVerified: rawUser.isVerified ?? false,
          isActive: rawUser.isActive ?? true,
          phone: rawUser.phone ?? rawUser.phoneNumber ?? null,
          phoneNumber: rawUser.phoneNumber ?? rawUser.phone ?? null,
          shippingInformation: rawUser.shippingInformation,
          createdAt: rawUser.createdAt ? new Date(rawUser.createdAt) : new Date(),
        };

        const updatedSessions = {
          ...get().sessions,
          [normalized]: {
            user,
            role: normalized,
            isAuthenticated: true,
            status: "authenticated" as AuthStatus,
          },
        };

        const currentActive = getActiveRole();
        const isActivePortal = currentActive === normalized;

        set({
          sessions: updatedSessions,
          ...(isActivePortal
            ? {
                status: "authenticated",
                user,
                role: normalized,
                isAuthenticated: true,
                isLoading: false,
                isInitialized: true,
              }
            : {}),
        });
      },

      clearSession: (targetRole) => {
        const roleToClear = targetRole || getActiveRole();
        const updatedSessions = {
          ...get().sessions,
          [roleToClear]: {
            user: null,
            role: roleToClear,
            isAuthenticated: false,
            status: "unauthenticated" as AuthStatus,
          },
        };

        const currentActive = getActiveRole();
        const isActivePortal = currentActive === roleToClear;

        set({
          sessions: updatedSessions,
          ...(isActivePortal
            ? {
                status: "unauthenticated",
                user: null,
                role: null,
                isAuthenticated: false,
                isLoading: false,
                isInitialized: true,
              }
            : {}),
        });
      },

      login: async (payload) => {
        if (getActiveRole() === payload.role) {
          set({ status: "hydrating", isLoading: true, isInitialized: false });
        }
        try {
          const { email, password, role } = payload;
          let responseData: AuthResponseDto | VendorAuthSessionDto;

          switch (role) {
            case "admin":
              responseData = (await adminAuthService.login({ email, password })).data;
              break;
            case "vendor":
              responseData = (await vendorAuthService.login({ email, password })).data;
              break;
            case "user":
            default:
              responseData = (await authService.login({ email, password })).data;
              break;
          }

          if (responseData?.accessToken) {
            setAuthTokens(role, {
              accessToken: responseData.accessToken,
            });
          }

          resetAuthBootstrap();

          const rawUser = "vendor" in responseData ? responseData.vendor : responseData.user;
          if (!rawUser) throw new Error("Authentication response did not include a user profile");
          clearBrowserQueryClient();
          get().setSession(rawUser, role);

          authBroadcast.broadcast({ type: "LOGIN", role });
        } catch (err) {
          if (getActiveRole() === payload.role) {
            set({ status: "unauthenticated", isLoading: false, isInitialized: true });
          }
          throw err;
        }
      },

      logout: async (options) => {
        const currentRole = options?.role || get().role || getActiveRole();
        const skipApi = options?.skipApi ?? false;

        if (!skipApi) {
          try {
            if (currentRole === "admin") {
              await adminAuthService.logout();
            } else if (currentRole === "vendor") {
              await vendorAuthService.logout();
            } else {
              await authService.logout();
            }
          } catch (error) {
            const status = axios.isAxiosError(error)
              ? error.response?.status
              : undefined;
            if (status !== 401) {
              throw new Error(
                "Could not confirm sign out. Your session is still active; please try again.",
                { cause: error },
              );
            }
          }
        }

        clearAuthTokens(currentRole);
        resetAuthBootstrap();
        if (currentRole === "user") {
          clearWishlistOnLogout();
        }

        clearBrowserQueryClient();

        get().clearSession(currentRole);
        authBroadcast.broadcast({ type: "LOGOUT", role: currentRole });

        if (typeof window !== "undefined" && options?.redirectTo) {
          window.location.assign(safeInternalPath(options.redirectTo, "/"));
        }
      },

      hydrateRole: (role) => {
        const normalized = normalizeRole(role) ?? "user";
        set((state) => ({
          user: state.user ? { ...state.user, role: normalized } : null,
          role: normalized,
          isAuthenticated: true,
          status: "authenticated",
          isInitialized: true,
          isLoading: false,
        }));
      },

      hydrateFromCookies: async () => {
        await authBootstrap();
      },

      setUser: (user) => {
        if (!user) {
          get().clearSession();
          return;
        }
        const role = get().role ?? getActiveRole();
        get().setSession(user, role);
      },

      fetchUser: async () => {
        const currentRole = get().role || getActiveRole();
        if (!currentRole) {
          get().clearSession();
          return;
        }

        try {
          if (currentRole === "admin") {
            const { data } = await adminAuthService.me();
            if (data?.id) get().setSession(data, "admin");
          } else if (currentRole === "vendor") {
            const { data } = await vendorAccountService.me();
            if (data?.id) get().setSession(data, "vendor");
          } else {
            const { data } = await userService.me();
            if (data?.id) {
              get().setSession(data, "user");
            }
          }
        } catch {
          get().clearSession(currentRole);
        }
      },
  })
);
