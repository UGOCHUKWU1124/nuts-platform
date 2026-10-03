export type AuthCookieRole = 'user' | 'admin' | 'vendor';

/**
 * Separate cookie namespaces prevent one principal type from
 * accidentally overwriting another principal's authentication session.
 */
export const authCookieNames = (role: AuthCookieRole) => ({
  access: `${role}_access_token`,
  refresh: `${role}_refresh_token`,
  session: `${role}_session`,
});

export const USER_ACCESS_TOKEN_COOKIE = authCookieNames('user').access;

export const USER_REFRESH_TOKEN_COOKIE = authCookieNames('user').refresh;

export const ADMIN_ACCESS_TOKEN_COOKIE = authCookieNames('admin').access;

export const ADMIN_REFRESH_TOKEN_COOKIE = authCookieNames('admin').refresh;

export const VENDOR_ACCESS_TOKEN_COOKIE = authCookieNames('vendor').access;

export const VENDOR_REFRESH_TOKEN_COOKIE = authCookieNames('vendor').refresh;

/**
 * Authentication cookies are only sent to API routes.
 *
 * The frontend-visible session marker is deliberately handled separately
 * with "/" inside AuthCookieService.
 */
export const AUTH_COOKIE_PATH = '/';
