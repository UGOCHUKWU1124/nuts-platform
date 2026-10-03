import { NextResponse,type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

function contentSecurityPolicy(nonce: string): string {
  const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL
    ? safeOrigin(process.env.NEXT_PUBLIC_BACKEND_URL)
    : null;
  const connectSources = ["'self'", "https://api.paystack.co"];
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://js.paystack.co",
  ];

  if (backendOrigin) connectSources.push(backendOrigin);
  if (process.env.NODE_ENV === "development") {
    scriptSources.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    // Styles: runtime-injected <style> tags (sonner, Next dev overlay/fonts,
    // React 19 hoisted styles) carry no nonce. A nonce in this directive makes
    // browsers IGNORE 'unsafe-inline', so we deliberately omit it here.
    // Scripts stay nonce + strict-dynamic, which is where XSS risk lives.
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src https://checkout.paystack.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(process.env.NODE_ENV === "production"
      ? ["upgrade-insecure-requests"]
      : []),
  ];

  return directives.join("; ");
}

function safeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

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

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
