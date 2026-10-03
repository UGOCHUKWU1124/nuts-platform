import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

import {
  AUTH_COOKIE_PATH,
  authCookieNames,
  AuthCookieRole,
} from '../constants/auth-cookies.constants';
import type { AuthTokens } from '../types/auth.types';

@Injectable()
export class AuthCookieService {
  private readonly baseOptions: CookieOptions;
  private readonly accessMaxAge: number;
  private readonly refreshMaxAge: number;

  constructor(private readonly config: ConfigService) {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    const sameSiteConfig = this.config.get<string>('COOKIE_SAME_SITE', 'lax');

    if (!['lax', 'strict', 'none'].includes(sameSiteConfig)) {
      throw new Error('COOKIE_SAME_SITE must be lax, strict, or none');
    }

    /**
     * SameSite=None requires Secure.
     *
     * Do not enable cross-site cookies accidentally.
     */
    const secure = isProduction || sameSiteConfig === 'none';

    if (sameSiteConfig === 'none' && !secure) {
      throw new Error('SameSite=None cookies require Secure');
    }

    this.baseOptions = {
      httpOnly: true,
      secure,
      sameSite: sameSiteConfig as CookieOptions['sameSite'],
    };

    const sanitizedDomain = this.sanitizeDomain(
      this.config.get<string>('COOKIE_DOMAIN'),
    );

    // Production auth cookies stay host-only. A parent-domain cookie would
    // expose credentials to every sibling subdomain and enable cookie tossing.
    if (sanitizedDomain && !isProduction) {
      this.baseOptions.domain = sanitizedDomain;
    }

    this.accessMaxAge = this.msFromExpires(
      this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
    );

    this.refreshMaxAge = this.msFromExpires(
      this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
    );
  }

  setAuthCookies(
    res: Response,
    tokens: AuthTokens,
    role: AuthCookieRole,
  ): void {
    const names = authCookieNames(role);

    /**
     * httpOnly prevents browser JavaScript from reading the credential.
     *
     * The cookie is scoped to the API because the frontend does not need
     * direct access to the JWT.
     */
    res.cookie(names.access, tokens.accessToken, {
      ...this.baseOptions,
      maxAge: this.accessMaxAge,
      path: AUTH_COOKIE_PATH,
    });

    /**
     * Refresh credentials are also API-only.
     */
    res.cookie(names.refresh, tokens.refreshToken, {
      ...this.baseOptions,
      maxAge: this.refreshMaxAge,
      path: AUTH_COOKIE_PATH,
    });

    /**
     * This is intentionally NOT an authentication credential.
     *
     * Frontend JavaScript may read it as a "session probably exists"
     * convenience indicator, but the backend never trusts it.
     */
    res.cookie(names.session, '1', {
      ...this.baseOptions,
      httpOnly: false,
      maxAge: this.refreshMaxAge,
      path: '/',
    });
  }

  clearAuthCookies(res: Response, role: AuthCookieRole): void {
    const names = authCookieNames(role);

    res.clearCookie(names.access, {
      ...this.baseOptions,
      path: AUTH_COOKIE_PATH,
    });

    res.clearCookie(names.refresh, {
      ...this.baseOptions,
      path: AUTH_COOKIE_PATH,
    });

    res.clearCookie(names.session, {
      ...this.baseOptions,
      httpOnly: false,
      path: '/',
    });
  }

  private msFromExpires(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());

    if (!match) {
      throw new Error(
        `Invalid JWT expiration format: "${value}". Expected values such as 15m or 7d.`,
      );
    }

    const amount = Number(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    } as const;

    return amount * multipliers[unit as keyof typeof multipliers];
  }

  /**
   * Sanitizes the configured cookie domain.
   * Strips protocols (http://, https://), ports (:5173), and paths.
   * Returns undefined for localhost / 127.0.0.1 to allow RFC-compliant host-only cookies.
   */
  private sanitizeDomain(rawDomain?: string): string | undefined {
    if (!rawDomain) return undefined;
    let domain = rawDomain.trim();

    if (domain.includes('://')) {
      try {
        domain = new URL(domain).hostname;
      } catch {
        domain = domain.replace(/^https?:\/\//i, '');
      }
    }

    domain = domain.split(':')[0].split('/')[0].trim();

    if (!domain || domain === 'localhost' || domain === '127.0.0.1') {
      return undefined;
    }

    return domain;
  }
}
