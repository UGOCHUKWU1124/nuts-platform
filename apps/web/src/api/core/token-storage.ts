/**
 * In-Memory Token Manager
 *
 * Implements OWASP token storage guidelines:
 * - Short-lived access tokens are stored exclusively in memory (private closure), immune to XSS theft via localStorage / sessionStorage.
 * - Long-lived refresh tokens are handled exclusively via HttpOnly Secure SameSite cookies.
 * - State is cleanly wiped on logout or expiration.
 */
export type AuthRole = "user" | "admin" | "vendor";

export interface StoredTokens {
  accessToken?: string | null;
}

const accessTokens: Record<AuthRole, string | null> = {
  user: null,
  admin: null,
  vendor: null,
};

type TokenListener = (token: string | null, role: string) => void;
const tokenListeners = new Set<TokenListener>();

export const getAuthToken = (role: AuthRole): string | null => {
  return accessTokens[role];
};

export const getRefreshToken = (): string | null => {
  // Refresh tokens are strictly HttpOnly cookies and inaccessible to JavaScript.
  return null;
};

export const setAuthTokens = (role: AuthRole, tokens: StoredTokens | null) => {
  const tokenValue = tokens?.accessToken ?? null;
  accessTokens[role] = tokenValue;

  tokenListeners.forEach((listener) => {
    try {
      listener(tokenValue, role);
    } catch {
      // Ignore listener errors
    }
  });
};

export const setAuthToken = (role: AuthRole, token: string | null) => {
  setAuthTokens(role, { accessToken: token });
};

export const clearAuthTokens = (role?: AuthRole) => {
  const roles = role ? [role] : (Object.keys(accessTokens) as AuthRole[]);
  roles.forEach((tokenRole) => {
    accessTokens[tokenRole] = null;
    tokenListeners.forEach((listener) => {
      try {
        listener(null, tokenRole);
      } catch {
        // Ignore listener errors
      }
    });
  });
};

export const onTokenChange = (listener: TokenListener): (() => void) => {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
};

export const getAuthSessionRole = (): AuthRole | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("session_active="));
  if (!match) return null;
  const value = match.split("=")[1]?.toLowerCase();
  if (value === "user" || value === "admin" || value === "vendor") {
    return value as AuthRole;
  }
  return null;
};

