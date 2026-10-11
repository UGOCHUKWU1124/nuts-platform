import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { middleware } from "./middleware.ts";

const TEST_SECRET = "test-secret-at-least-32-chars-long-jwt-key";
process.env.JWT_SECRET = TEST_SECRET;

function createSignedJwt(payload, secret = TEST_SECRET) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      sub: "user-123",
      role: "user",
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${claims}`)
    .digest("base64url");
  return `${header}.${claims}.${signature}`;
}

test("redirects unauthenticated visitor accessing /admin to admin login with redirect parameter", async () => {
  const req = new NextRequest("http://localhost:3000/admin/user?tab=active");
  const res = await middleware(req);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location);
  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.pathname, "/auth/admin/login");
  assert.equal(
    redirectUrl.searchParams.get("redirect"),
    "/admin/user?tab=active",
  );
});

test("redirects unauthenticated visitor accessing /vendor portal to vendor login with redirect parameter", async () => {
  const req = new NextRequest("http://localhost:3000/vendor/analytic");
  const res = await middleware(req);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location);
  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.pathname, "/auth/vendor/login");
  assert.equal(redirectUrl.searchParams.get("redirect"), "/vendor/analytic");
});

test("redirects customer attempting to access /admin to admin login", async () => {
  const token = createSignedJwt({ role: "user" });
  const req = new NextRequest("http://localhost:3000/admin", {
    headers: {
      cookie: `session_active=1; access_token=${token}`,
    },
  });
  const res = await middleware(req);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location);
  assert.ok(location.includes("/auth/admin/login"));
});

test("rejects tampered token attempting role escalation to admin", async () => {
  // Create token with valid signature for 'user'
  const validToken = createSignedJwt({ role: "user" });
  const [h, , s] = validToken.split(".");
  // Tamper payload to forge 'admin' role without secret signature
  const forgedPayload = Buffer.from(
    JSON.stringify({
      sub: "hacker-id",
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const tamperedToken = `${h}.${forgedPayload}.${s}`;

  const req = new NextRequest("http://localhost:3000/admin", {
    headers: {
      cookie: `session_active=1; access_token=${tamperedToken}`,
    },
  });
  const res = await middleware(req);

  // Must reject forged token and redirect to login
  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location?.includes("/auth/admin/login"));
});

test("rejects expired token on protected route", async () => {
  const expiredToken = createSignedJwt({
    role: "admin",
    exp: Math.floor(Date.now() / 1000) - 300, // Expired 5 mins ago
  });
  const req = new NextRequest("http://localhost:3000/admin/settings", {
    headers: {
      cookie: `session_active=1; access_token=${expiredToken}`,
    },
  });
  const res = await middleware(req);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location?.includes("/auth/admin/login"));
});

test("allows cryptographically verified admin to access /admin with CSP and context headers", async () => {
  const token = createSignedJwt({ role: "admin", sub: "admin-uuid-456" });
  const req = new NextRequest("http://localhost:3000/admin/user", {
    headers: {
      cookie: `session_active=1; access_token=${token}`,
    },
  });
  const res = await middleware(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(res.headers.get("content-security-policy"));
});

test("allows cryptographically verified vendor to access /vendor/analytic", async () => {
  const token = createSignedJwt({ role: "vendor", sub: "vendor-uuid-789" });
  const req = new NextRequest("http://localhost:3000/vendor/analytic", {
    headers: {
      cookie: `session_active=1; access_token=${token}`,
    },
  });
  const res = await middleware(req);

  assert.equal(res.status, 200);
  assert.ok(res.headers.get("content-security-policy"));
});

test("redirects already logged-in customer away from /auth/login to home", async () => {
  const token = createSignedJwt({ role: "user" });
  const req = new NextRequest("http://localhost:3000/auth/login", {
    headers: {
      cookie: `session_active=1; access_token=${token}`,
    },
  });
  const res = await middleware(req);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location);
  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.pathname, "/");
});

test("redirects already logged-in customer with safe redirect param to intended destination", async () => {
  const token = createSignedJwt({ role: "user" });
  const req = new NextRequest(
    "http://localhost:3000/auth/login?redirect=%2Fcheckout",
    {
      headers: {
        cookie: `session_active=1; access_token=${token}`,
      },
    },
  );
  const res = await middleware(req);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location);
  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.pathname, "/checkout");
});

test("prevents open redirect attacks via malicious redirect query parameter", async () => {
  const token = createSignedJwt({ role: "user" });
  const req = new NextRequest(
    "http://localhost:3000/auth/login?redirect=https%3A%2F%2Fmalicious-site.com",
    {
      headers: {
        cookie: `session_active=1; access_token=${token}`,
      },
    },
  );
  const res = await middleware(req);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location);
  const redirectUrl = new URL(location);
  // Malicious external origin must be rejected and fallback to "/"
  assert.equal(redirectUrl.pathname, "/");
});

test("allows public visitors to access /vendor and /vendor/[handle] storefront pages", async () => {
  const reqDirectory = new NextRequest("http://localhost:3000/vendor");
  const resDirectory = await middleware(reqDirectory);
  assert.equal(resDirectory.status, 200);

  const reqStore = new NextRequest("http://localhost:3000/vendor/acme-crafts");
  const resStore = await middleware(reqStore);
  assert.equal(resStore.status, 200);
});

test("allows user with admin session to view /auth/login without being hijacked to /admin", async () => {
  const token = createSignedJwt({ role: "admin" });
  const req = new NextRequest("http://localhost:3000/auth/login", {
    headers: {
      cookie: `session_active=1; access_token=${token}`,
    },
  });
  const res = await middleware(req);

  // Status 200 allows viewing customer login page (no 307 hijack to /admin)
  assert.equal(res.status, 200);
});
