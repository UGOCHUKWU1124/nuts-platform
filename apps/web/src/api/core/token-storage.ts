/**
 * In-Memory Token Manager
 *
 * Implements OWASP token storage guidelines:
 * - Access tokens are stored exclusively in memory (private closure), immune to XSS theft via localStorage / sessionStorage.
 * - Refresh tokens are handled exclusively via HttpOnly Secure SameSite cookies.
 * - State is cleanly wiped on logout or expiration.
 */
import { getPortalRoleForPath } from "@/lib/portal-role";

export interface StoredTokens {
  accessToken?: string | null;
}

const inMemoryTokens: Record<string, string | null> = {
  user: null,
  vendor: null,
  admin: null,
};

type TokenListener = (token: string | null, role: string) => void;
const tokenListeners = new Set<TokenListener>();

export const getAuthToken = (role?: string | null): string | null => {
  if (role) {
    const key = role.toLowerCase();
    if (key in inMemoryTokens) {
      return inMemoryTokens[key] ?? null;
    }
  }

  if (typeof window !== "undefined") {
    const role = getPortalRoleForPath(window.location.pathname);
    return inMemoryTokens[role] ?? null;
  }

  return inMemoryTokens.user ?? null;
};

export const getRefreshToken = (): string | null => {
  // In production, refresh tokens are strictly HttpOnly cookies and inaccessible to JS.
  return null;
};

export const setAuthTokens = (role: string, tokens: StoredTokens | null) => {
  const key = (role || "user").toLowerCase();
  const tokenValue = tokens?.accessToken ?? null;
  inMemoryTokens[key] = tokenValue;
  tokenListeners.forEach((listener) => {
    try {
      listener(tokenValue, key);
    } catch {
      // Ignore listener errors
    }
  });
};

export const clearAuthTokens = (role?: string) => {
  if (role) {
    const key = role.toLowerCase();
    inMemoryTokens[key] = null;
    tokenListeners.forEach((listener) => {
      try {
        listener(null, key);
      } catch {
        // Ignore listener errors
      }
    });
  } else {
    inMemoryTokens.user = null;
    inMemoryTokens.vendor = null;
    inMemoryTokens.admin = null;
    tokenListeners.forEach((listener) => {
      try {
        listener(null, "all");
      } catch {
        // Ignore listener errors
      }
    });
  }
};

export const onTokenChange = (listener: TokenListener): (() => void) => {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
};
