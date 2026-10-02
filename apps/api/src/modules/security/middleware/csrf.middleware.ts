import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import * as crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);
  private readonly csrfCookieName = 'csrf_token';
  private readonly csrfHeaderName = 'x-csrf-token';
  private readonly tokenLength = 32;

  constructor(
    private readonly allowedOrigins: readonly string[] = [],
    private readonly isProduction = process.env.NODE_ENV === 'production',
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Skip CSRF for GET, HEAD, OPTIONS requests (read-only)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      this.generateAndSetCsrfToken(req, res);
      return next();
    }

    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if (
      (typeof origin === 'string' && !this.isTrustedOrigin(origin)) ||
      fetchSite === 'cross-site'
    ) {
      this.logger.warn('CSRF origin validation failed', {
        method: req.method,
        path: req.path,
        hasOrigin: typeof origin === 'string',
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

    // Requests authenticating via Bearer token are not vulnerable to CSRF
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return next();
    }

    // For state-changing methods, validate CSRF token
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

    // Set CSRF token as a JS-readable cookie.
    // NOTE: The double-submit cookie pattern REQUIRES the client to read this
    // cookie and echo it back in the `x-csrf-token` header. An httpOnly cookie
    // would make that impossible and every state-changing request would 403.
    res.cookie(this.csrfCookieName, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    // Also make it available in response headers for easier client access
    res.setHeader(this.csrfHeaderName, token);
  }

  private extractCsrfToken(req: Request): string | undefined {
    // CSRF tokens belong in a custom header so they do not leak into URLs or
    // application payloads that may be logged or forwarded downstream.
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
      if (this.allowedOrigins.includes(normalizedOrigin)) return true;
      return (
        !this.isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)
      );
    } catch {
      return false;
    }
  }

  private compareTokens(token1: string, token2: string): boolean {
    // Use timing-safe comparison to prevent timing attacks.
    // timingSafeEqual throws when buffer lengths differ, so guard first.
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
}
