import { NextResponse, type NextRequest } from "next/server.js";

// ── Environment Detection ───────────────────────────────────────────────────
const nodeEnv = process.env.NODE_ENV as string | undefined;
const isProduction = nodeEnv === "production";
const isStaging =
  nodeEnv === "staging" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
  process.env.APP_ENV === "staging";
const isSecureContext = isProduction || isStaging;

// ── Types ───────────────────────────────────────────────────────────────────
export type Role = "admin" | "vendor" | "user";

export interface VerifiedJwtPayload {
  sub: string;
  role: Role;
  tokenVersion?: number;
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string;
}

// ── Cryptographic Edge JWT Verification (Web Crypto API) ────────────────────
const keyCache = new Map<string, CryptoKey>();

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeRole(rawRole?: string | null): Role {
  const normalized = String(rawRole || "").toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "vendor") return "vendor";
  return "user";
}

/**
 * Cryptographically verifies an HS256-signed JWT token using Web Crypto API.
 * Rejects unsigned, forged, algorithm-mismatched, or expired tokens.
 */
export async function verifyJwtHs256(
  token: string | null | undefined,
  secret: string | null | undefined,
): Promise<VerifiedJwtPayload | null> {
  if (!token || !secret) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }

  try {
    // 1. Validate Header and Algorithm
    const headerBytes = base64UrlToUint8Array(headerB64);
    const headerJson = new TextDecoder().decode(headerBytes);
    const header = JSON.parse(headerJson) as { alg?: string; typ?: string };

    if (header.alg !== "HS256") {
      return null;
    }

    // 2. Retrieve or Cache CryptoKey
    let key = keyCache.get(secret);
    if (!key) {
      const enc = new TextEncoder();
      key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      keyCache.set(secret, key);
    }

    // 3. Verify Cryptographic Signature
    const sigBytes = base64UrlToUint8Array(signatureB64);
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      signedData as unknown as BufferSource,
    );

    if (!isValid) {
      return null;
    }

    // 4. Parse Verified Claims
    const payloadBytes = base64UrlToUint8Array(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const rawPayload = JSON.parse(payloadJson) as {
      sub?: string;
      role?: string;
      tokenVersion?: number;
      exp?: number;
      iat?: number;
      iss?: string;
      aud?: string;
    };

    if (!rawPayload || typeof rawPayload !== "object") {
      return null;
    }

    // 5. Expiration Validation
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof rawPayload.exp === "number" && rawPayload.exp <= nowSeconds) {
      return null;
    }

    return {
      sub: String(rawPayload.sub || ""),
      role: normalizeRole(rawPayload.role),
      tokenVersion:
        typeof rawPayload.tokenVersion === "number"
          ? rawPayload.tokenVersion
          : undefined,
      exp: rawPayload.exp,
      iat: rawPayload.iat,
      iss: rawPayload.iss,
      aud: rawPayload.aud,
    };
  } catch {
    return null;
  }
}

// ── Safe Open Redirect Sanitizer ────────────────────────────────────────────
const INTERNAL_ORIGIN = "https://nuts-internal.invalid";

export function safeInternalPath(
  candidate: string | null | undefined,
  fallback: string,
): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const url = new URL(candidate, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

// ── Declarative Route Policies ──────────────────────────────────────────────
interface PortalPolicy {
  readonly name: string;
  readonly matcher: (pathname: string) => boolean;
  readonly requiredRole: Role;
  readonly loginPath: string;
}

const PORTAL_POLICIES: readonly PortalPolicy[] = [
  {
    name: "admin",
    matcher: (p) => p === "/admin" || p.startsWith("/admin/"),
    requiredRole: "admin",
    loginPath: "/auth/admin/login",
  },
  {
    name: "vendor_portal",
    matcher: (p) =>
      p.startsWith("/vendor/analytic") ||
      p.startsWith("/vendor/product") ||
      p.startsWith("/vendor/order") ||
      p.startsWith("/vendor/discount") ||
      p.startsWith("/vendor/setting") ||
      p.startsWith("/vendor/wallet") ||
      p.startsWith("/vendor/notifications"),
    requiredRole: "vendor",
    loginPath: "/auth/vendor/login",
  },
];

const isCustomerProtectedRoute = (pathname: string): boolean =>
  pathname === "/checkout" ||
  pathname.startsWith("/checkout/") ||
  pathname === "/account" ||
  pathname.startsWith("/account/") ||
  pathname === "/orders" ||
  pathname.startsWith("/orders/");

interface GuestAuthRoute {
  readonly path: string;
  readonly role: Role;
  readonly defaultRedirect: string;
}

const GUEST_AUTH_ROUTES: readonly GuestAuthRoute[] = [
  { path: "/auth/login", role: "user", defaultRedirect: "/" },
  { path: "/auth/register", role: "user", defaultRedirect: "/" },
  { path: "/auth/admin/login", role: "admin", defaultRedirect: "/admin" },
  { path: "/auth/vendor/login", role: "vendor", defaultRedirect: "/vendor/analytic" },
];

// ── Security Headers & Content Security Policy ──────────────────────────────
function safeOrigin(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (isSecureContext && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function generateNonce(): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]!);
  }
  return btoa(binary);
}

function buildContentSecurityPolicy(nonce: string): string {
  const connectSources = new Set<string>(["'self'", "https://api.paystack.co"]);

  for (const rawUrl of [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_BACKEND_URL,
    process.env.NEXT_PUBLIC_WS_URL,
  ]) {
    const origin = safeOrigin(rawUrl);
    if (origin) connectSources.add(origin);
  }

  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://js.paystack.co",
  ];

  if (!isSecureContext) {
    scriptSources.push("'unsafe-eval'");
  }

  const imageSources = new Set<string>([
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://images.unsplash.com",
    "https://lh3.googleusercontent.com",
  ]);

  if (process.env.NEXT_PUBLIC_IMAGE_DOMAINS) {
    for (const domain of process.env.NEXT_PUBLIC_IMAGE_DOMAINS.split(",")) {
      const trimmed = domain.trim();
      if (trimmed) {
        imageSources.add(
          trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
        );
      }
    }
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `img-src ${Array.from(imageSources).join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${Array.from(connectSources).join(" ")}`,
    "frame-src https://checkout.paystack.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isSecureContext ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

// ── Session State Inspection ────────────────────────────────────────────────
interface SessionState {
  isAuthenticated: boolean;
  isVerified: boolean;
  role: Role | null;
  userId: string | null;
}

async function resolveSessionState(request: NextRequest): Promise<SessionState> {
  const sessionActive = request.cookies.get("session_active")?.value === "1";
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  const jwtSecret =
    process.env.JWT_SECRET ||
    process.env.JWT_ACCESS_SECRET;

  if (accessToken && jwtSecret) {
    const verified = await verifyJwtHs256(accessToken, jwtSecret);
    if (verified) {
      return {
        isAuthenticated: true,
        isVerified: true,
        role: verified.role,
        userId: verified.sub,
      };
    }
  }

  // Fallback when token is pending silent refresh or secret is not present at edge
  if (sessionActive || refreshToken || accessToken) {
    return {
      isAuthenticated: Boolean(sessionActive || accessToken || refreshToken),
      isVerified: false,
      role: null,
      userId: null,
    };
  }

  return {
    isAuthenticated: false,
    isVerified: false,
    role: null,
    userId: null,
  };
}

// ── Next.js Edge Middleware ─────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const fullPath = `${pathname}${search}`;
  const session = await resolveSessionState(request);

  // 1. Enforce Platform Portals (Admin & Vendor Portals)
  for (const policy of PORTAL_POLICIES) {
    if (policy.matcher(pathname)) {
      if (!session.isAuthenticated || session.role !== policy.requiredRole) {
        const loginUrl = new URL(policy.loginPath, request.url);
        loginUrl.searchParams.set("redirect", fullPath);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // 2. Enforce Customer Protected Routes (/checkout, /account, /orders)
  if (isCustomerProtectedRoute(pathname)) {
    if (!session.isAuthenticated) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", fullPath);
      return NextResponse.redirect(loginUrl);
    }

    // Role segregation: prevent platform admins or merchants from customer checkout
    if (session.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (session.role === "vendor") {
      return NextResponse.redirect(new URL("/vendor/analytic", request.url));
    }
  }

  // 3. Guest-Only Auth Route Redirection
  for (const guestRoute of GUEST_AUTH_ROUTES) {
    if (pathname === guestRoute.path) {
      // Only redirect if authenticated with the specific matching role
      if (session.isAuthenticated && session.role === guestRoute.role) {
        const redirectParam = request.nextUrl.searchParams.get("redirect");
        const destination = safeInternalPath(redirectParam, guestRoute.defaultRedirect);
        return NextResponse.redirect(new URL(destination, request.url));
      }
    }
  }

  // 4. Construct Security Headers and Downstream Context
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  if (session.isVerified && session.userId && session.role) {
    requestHeaders.set("x-user-id", session.userId);
    requestHeaders.set("x-user-role", session.role);
    requestHeaders.set("x-authenticated", "1");
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );

  if (isSecureContext) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
