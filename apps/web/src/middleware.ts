import { NextResponse, type NextRequest } from "next/server.js";
import {
  verifyJwtHs256,
  type Role,
  type VerifiedJwtPayload,
} from "./lib/edge-jwt";

export { verifyJwtHs256, type Role, type VerifiedJwtPayload };

// ── Environment Detection ───────────────────────────────────────────────────
const nodeEnv = process.env.NODE_ENV as string | undefined;
const isProduction = nodeEnv === "production";
const isStaging =
  nodeEnv === "staging" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
  process.env.APP_ENV === "staging";
const isSecureContext = isProduction || isStaging;

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

const VENDOR_PORTAL_SECTIONS = new Set([
  "analytic",
  "product",
  "order",
  "discount",
  "setting",
  "settings",
  "wallet",
  "manage-wallet",
]);

const isVendorPortalPath = (pathname: string): boolean => {
  if (!pathname.startsWith("/vendor/")) return false;
  const segment = pathname.split("/").filter(Boolean)[1];
  return Boolean(segment && VENDOR_PORTAL_SECTIONS.has(segment));
};

const PORTAL_POLICIES: readonly PortalPolicy[] = [
  {
    name: "admin",
    matcher: (p) => p === "/admin" || p.startsWith("/admin/"),
    requiredRole: "admin",
    loginPath: "/auth/admin/login",
  },
  {
    name: "vendor_portal",
    matcher: isVendorPortalPath,
    requiredRole: "vendor",
    loginPath: "/auth/vendor/login",
  },
];

const isCustomerProtectedRoute = (pathname: string): boolean =>
  pathname === "/checkout" ||
  pathname.startsWith("/checkout/") ||
  pathname === "/account" ||
  pathname.startsWith("/account/") ||
  pathname === "/order" ||
  pathname.startsWith("/order/") ||
  pathname === "/orders" ||
  pathname.startsWith("/orders/") ||
  pathname === "/wallet" ||
  pathname.startsWith("/wallet/");

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
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;
  const jwtSecret = process.env.JWT_SECRET;

  if (accessToken && jwtSecret) {
    // 1. Strict Cryptographic Verification
    const verified = await verifyJwtHs256(accessToken, jwtSecret);
    if (verified) {
      return {
        isAuthenticated: true,
        isVerified: true,
        role: verified.role,
        userId: verified.sub,
      };
    }

    // 2. Silent Rotation Grace Window:
    // If access token has expired but authentic refresh_token cookie is present,
    // verify signature without expiration so the page shell mounts and Axios can refresh.
    if (refreshToken) {
      const signatureValid = await verifyJwtHs256(accessToken, jwtSecret, {
        ignoreExpiration: true,
      });
      if (signatureValid) {
        return {
          isAuthenticated: true,
          isVerified: true,
          role: signatureValid.role,
          userId: signatureValid.sub,
        };
      }
    }

    // Tampered signature or invalid structure -> Reject
    return {
      isAuthenticated: false,
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

  // 2. Enforce Customer Protected Routes (/checkout, /account, /order, /wallet)
  if (isCustomerProtectedRoute(pathname)) {
    if (!session.isAuthenticated) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", fullPath);
      return NextResponse.redirect(loginUrl);
    }

    // Role segregation: platform admins or merchants do not use customer account portal
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
