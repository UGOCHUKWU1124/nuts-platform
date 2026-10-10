import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import * as crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);
  private readonly csrfCookieName = 'csrf_token';
  private readonly csrfHeaderName = 'x-csrf-token';
  private readonly tokenLength = 32;
  private readonly trustedOrigins: Set<string>;

  constructor(
    allowedOrigins: readonly string[] = [],
    private readonly customExemptPaths: readonly (string | RegExp)[] = [],
  ) {
    this.trustedOrigins = new Set(
      allowedOrigins
        .map((origin) => {
          try {
            return new URL(origin.trim()).origin;
          } catch {
            return origin.trim();
          }
        })
        .filter(Boolean),
    );
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Skip CSRF for GET, HEAD, OPTIONS requests (read-only)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      this.generateAndSetCsrfToken(req, res);
      return next();
    }

    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];

    const hasOrigin = typeof origin === 'string';
    const isOriginTrusted = hasOrigin && this.isTrustedOrigin(origin);

    // 1. Strict Origin Verification for all mutating operations
    if (
      (hasOrigin && !isOriginTrusted) ||
      (!hasOrigin && fetchSite === 'cross-site')
    ) {
      this.logger.warn('CSRF origin validation failed', {
        method: req.method,
        path: req.path,
        hasOrigin,
        origin,
        fetchSite,
        ip: req.ip,
      });
      return res.status(403).json({
        success: false,
        message: 'Request origin is not allowed',
        errors: [
          { code: 'CSRF_ORIGIN_ERROR', message: 'Untrusted request origin' },
        ],
      });
    }

    // 2. Unauthenticated auth endpoints and webhooks:
    // Origin is already verified above. No pre-existing authenticated session exists
    // to ride, so requiring a pre-existing cookie causes cross-site lockout.
    // Issue a fresh CSRF token so the newly authenticated session has one ready.
    if (this.isCsrfExempt(req.path)) {
      this.generateAndSetCsrfToken(req, res);
      return next();
    }

    // 3. Requests authenticating via Bearer token are not vulnerable to CSRF
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return next();
    }

    // 4. For state-changing operations on cookie-authenticated sessions, validate CSRF token
    const csrfToken = this.extractCsrfToken(req);
    const storedToken = this.getStoredCsrfToken(req);

    // Require a cookie/header pair for cookie-authenticated requests. A
    // header-only token is not bound to a server-issued browser token.
    if (storedToken) {
      if (!csrfToken || !this.compareTokens(csrfToken, storedToken)) {
        this.logger.warn('CSRF token validation failed: token mismatch', {
          method: req.method,
          path: req.path,
          hasHeaderToken: !!csrfToken,
          ip: req.ip,
        });
        return res.status(403).json({
          success: false,
          message: 'CSRF token validation failed',
          errors: [
            { code: 'CSRF_ERROR', message: 'Invalid or missing CSRF token' },
          ],
        });
      }
    } else {
      this.logger.warn('CSRF token validation failed: missing cookie token', {
        method: req.method,
        path: req.path,
        hasHeaderToken: !!csrfToken,
        ip: req.ip,
      });
      return res.status(403).json({
        success: false,
        message: 'CSRF token validation failed',
        errors: [{ code: 'CSRF_ERROR', message: 'Missing CSRF cookie' }],
      });
    }

    next();
  }

  private generateAndSetCsrfToken(req: Request, res: Response): void {
    const existingToken = this.getStoredCsrfToken(req);
    const token =
      existingToken && existingToken.length === this.tokenLength * 2
        ? existingToken
        : this.generateToken();

    const isProduction = process.env.NODE_ENV === 'production';
    const isStaging = process.env.NODE_ENV === 'staging';

    const sameSiteEnv =
      process.env.COOKIE_SAME_SITE || process.env.AUTH_COOKIE_SAME_SITE;

    const sameSite: 'lax' | 'strict' | 'none' = (
      sameSiteEnv &&
      ['lax', 'strict', 'none'].includes(sameSiteEnv.toLowerCase())
        ? sameSiteEnv.toLowerCase()
        : 'lax'
    ) as 'lax' | 'strict' | 'none';

    const isSecure =
      process.env.AUTH_COOKIE_SECURE === 'true' ||
      process.env.COOKIE_SECURE === 'true' ||
      sameSite === 'none' ||
      isProduction ||
      isStaging;

    const rawDomain =
      process.env.COOKIE_DOMAIN || process.env.AUTH_COOKIE_DOMAIN;
    let domain: string | undefined;

    // Host-Only cookie default (domain: undefined).
    // Only bind domain when explicitly configured in non-production environments.
    if (rawDomain && !isProduction) {
      const host = req.headers.host?.split(':')[0].toLowerCase();
      const parsedDomain = rawDomain
        .trim()
        .replace(/^https?:\/\//i, '')
        .split(':')[0]
        .split('/')[0]
        .trim();

      if (
        parsedDomain &&
        parsedDomain !== 'localhost' &&
        parsedDomain !== '127.0.0.1' &&
        host &&
        host.endsWith(parsedDomain.replace(/^\./, ''))
      ) {
        domain = parsedDomain;
      }
    }

    res.cookie(this.csrfCookieName, token, {
      httpOnly: false,
      secure: isSecure,
      sameSite,
      ...(domain ? { domain } : {}),
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    // Also make it available in response headers for easier client access
    res.setHeader(this.csrfHeaderName, token);
  }

  private extractCsrfToken(req: Request): string | undefined {
    const headerToken = req.headers[this.csrfHeaderName];
    return typeof headerToken === 'string' && headerToken
      ? headerToken
      : undefined;
  }

  private getStoredCsrfToken(req: Request): string | undefined {
    interface CsrfCookies {
      [key: string]: unknown;
    }
    const cookies = req.cookies as CsrfCookies | undefined;
    const storedToken = cookies?.[this.csrfCookieName];
    return typeof storedToken === 'string' ? storedToken : undefined;
  }

  private generateToken(): string {
    return crypto.randomBytes(this.tokenLength).toString('hex');
  }

  private isTrustedOrigin(origin: string): boolean {
    try {
      const normalizedOrigin = new URL(origin).origin;
      return this.trustedOrigins.has(normalizedOrigin);
    } catch {
      return false;
    }
  }

  private compareTokens(token1: string, token2: string): boolean {
    if (
      !new RegExp(`^[a-f0-9]{${this.tokenLength * 2}}$`, 'i').test(token1) ||
      !new RegExp(`^[a-f0-9]{${this.tokenLength * 2}}$`, 'i').test(token2)
    ) {
      return false;
    }
    const buf1 = Buffer.from(token1, 'hex');
    const buf2 = Buffer.from(token2, 'hex');
    if (buf1.length !== this.tokenLength || buf1.length !== buf2.length)
      return false;
    return crypto.timingSafeEqual(buf1, buf2);
  }

  /**
   * Evaluates whether a mutating request is exempt from pre-existing CSRF token cookies.
   *
   * Note: Strict Origin verification has ALREADY passed before this check executes.
   * Exempt paths include:
   * 1. Server-to-server webhook endpoints (authenticated via HMAC signatures, zero browser cookies).
   * 2. Unauthenticated authentication entrypoints (login, register, forgot-password, reset-password, OTPs).
   *    Because no session exists yet, requiring a pre-existing CSRF cookie locks out legitimate
   *    users in decoupled cross-site architectures.
   * 3. Custom regex/string exemptions configured at initialization.
   */
  private isCsrfExempt(path: string | undefined): boolean {
    if (!path) return false;

    // Normalize: strip query strings, remove duplicate and trailing slashes, lowercase
    const cleanPath = path.split('?')[0].replace(/\/+$/, '').toLowerCase();

    // 1. Webhook endpoints (HMAC signature protected, server-to-server)
    if (/\/webhooks?$/.test(cleanPath)) {
      return true;
    }

    // 2. Authentication lifecycle actions across any API version prefix (/api/v1, /api/v2, etc.)
    // Origin is already strictly verified above. Requiring a pre-existing CSRF cookie locks out
    // legitimate users during initial session establishment, token refresh, and logout.
    const isAuthLifecycleAction =
      /\/(auth|vendors\/auth|admin\/auth)\/(login|register|refresh|logout|setup|forgot-password|reset-password|verify-otp|resend-otp|otp|request-otp|register\/otp)($|\/.*)/.test(
        cleanPath,
      );

    if (isAuthLifecycleAction) {
      return true;
    }

    // 3. Extensible custom exemptions
    for (const rule of this.customExemptPaths) {
      if (typeof rule === 'string') {
        const cleanRule = rule.split('?')[0].replace(/\/+$/, '').toLowerCase();
        if (cleanPath === cleanRule) return true;
      } else if (rule instanceof RegExp && rule.test(cleanPath)) {
        return true;
      }
    }

    return false;
  }
}
