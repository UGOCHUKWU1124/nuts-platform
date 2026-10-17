import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Express } from 'express';
import { Logger } from 'nestjs-pino';
import { removeDuplicateAdminCategoryPaths } from './modules/shared/utils/swagger-paths.util';

/**
 * Enterprise OpenAPI 3.0 / Swagger Setup for NUTS Platform.
 *
 * ARCHITECTURAL & SECURITY RULES:
 * 1. Swagger UI and specifications are STRICTLY prohibited in production environments.
 *    Exposing OpenAPI contracts in production introduces reconnaissance attack surfaces,
 *    internal schema leakage, and endpoint enumeration risks.
 * 2. Swagger is strictly restricted to DEVELOPMENT and STAGING environments.
 * 3. In staging and development, Swagger provides an interactive developer portal
 *    with collapsed tag navigation, persistent authorization, latency indicators,
 *    and raw JSON / YAML exports.
 */
export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  const rawNodeEnv = (
    config.get<string>('NODE_ENV') ||
    process.env.NODE_ENV ||
    'development'
  )
    .toLowerCase()
    .trim();

  const rawAppEnv = (config.get<string>('APP_ENV') || process.env.APP_ENV || '')
    .toLowerCase()
    .trim();

  const renderServiceName = (
    config.get<string>('RENDER_SERVICE_NAME') ||
    process.env.RENDER_SERVICE_NAME ||
    ''
  ).toLowerCase();

  const renderExternalUrl = (
    config.get<string>('RENDER_EXTERNAL_URL') ||
    config.get<string>('RENDER_EXTERNAL_HOSTNAME') ||
    config.get<string>('BASE_URL') ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RENDER_EXTERNAL_HOSTNAME ||
    process.env.BASE_URL ||
    ''
  ).toLowerCase();

  const swaggerFlag =
    config.get<string | boolean>('SWAGGER_ENABLED') ??
    process.env.SWAGGER_ENABLED;

  const isExplicitlyEnabled =
    swaggerFlag === true || swaggerFlag === 'true' || swaggerFlag === '1';

  const isExplicitlyDisabled =
    swaggerFlag === false || swaggerFlag === 'false' || swaggerFlag === '0';

  // Staging detection:
  // 1. Explicit NODE_ENV=staging or APP_ENV=staging
  // 2. Render service name or hostname contains 'staging' (e.g. nuts-api-staging.onrender.com)
  const isStaging =
    rawNodeEnv === 'staging' ||
    rawAppEnv === 'staging' ||
    renderServiceName.includes('staging') ||
    renderExternalUrl.includes('staging');

  // Strict production: APP_ENV is explicitly production
  const isStrictProduction = rawAppEnv === 'production';

  // Production check: strict production OR (NODE_ENV=production and not staging and not explicitly enabled)
  const isProduction =
    isStrictProduction ||
    (rawNodeEnv === 'production' && !isStaging && !isExplicitlyEnabled);

  // Physical security gate: NEVER register Swagger in production under any circumstance.
  if (isProduction) {
    return;
  }

  // Allow optional explicit opt-out in staging or development
  if (isExplicitlyDisabled) {
    return;
  }

  const expressApp = app.getHttpAdapter().getInstance() as Express;

  // Enterprise API Documentation Redirects (registered ONLY when Swagger is enabled)
  expressApp.get(['/docs', '/documentation', '/api/docs.json'], (req, res) => {
    if (req.path === '/api/docs.json') {
      return res.redirect('/api/docs-json');
    }
    return res.redirect('/api/docs');
  });

  const port = config.get<number>('PORT', 3001);
  const baseUrl = config.get<string>('BASE_URL');

  const swaggerBuilder = new DocumentBuilder()
    .setTitle('Nuts API — E-Commerce Platform')
    .setDescription(
      `## Overview

REST API specification and developer portal for the **NUTS Multi-Vendor Marketplace Platform**.

Architected with **NestJS 11**, **TypeScript 5.8**, **PostgreSQL 16**, **Prisma 7**, **Redis Alpine**, and **RabbitMQ** adhering strictly to Domain-Driven Design (DDD) principles.

The platform enforces strict zero-trust role isolation across three autonomous security boundaries:
1. **Customer Storefront Domain** (Shoppers, Cart, Direct Checkout, Customer Orders, Customer Wallet, Reviews)
2. **Vendor Merchant Domain** (Storefront Management, Products & Variants, Merchant Orders, Vendor Wallet, Analytics)
3. **Platform Administration Domain** (Platform Governance, Merchant Approvals, Global Orders, Category Taxonomy, System Cache)

---

## Authentication & Authorization Model

All protected operations enforce a **zero-trust capability-driven security model**. Authentication identities are strictly partitioned across database tables and logical boundaries; role spoofing and cross-domain access are physically prevented by database isolation and backend \`RolesGuard\` validation.

### Security Principals & Server-Driven Capabilities

Every authenticated identity returns a capability manifest from \`GET /api/v1/auth/me\` that dictates valid client actions:

| Principal | Role | Domain Scope & Permissions | Capability Flags |
| :--- | :--- | :--- | :--- |
| **Customer** | \`user\` | Storefront shopping, wishlist, cart, checkout, customer orders & wallet. | \`canPurchase: true\`, \`canSell: false\`, \`canAdminister: false\` |
| **Vendor** | \`vendor\` | Store catalog, product variants, inventory, store orders, merchant wallet, analytics. | \`canPurchase: false\`, \`canSell: true\`, \`canAdminister: false\` |
| **Admin** | \`admin\` | Platform governance, vendor approvals, user management, category taxonomy, system cache. | \`canPurchase: false\`, \`canSell: false\`, \`canAdminister: true\` |

> **Zero-Trust Cross-Domain Boundary:** A valid access token for a \`vendor\` or \`admin\` will receive an immediate \`403 Forbidden\` on customer shopping endpoints (\`/cart\`, \`/checkout\`, \`/orders/my-orders\`, \`/users/wallet\`). Merchant and administrative accounts cannot make storefront purchases, maintain customer carts, or access customer wallets.

---

## Session & Token Management

The platform employs a **Dual-Token Ephemeral Session Architecture** adhering to OWASP ASVS:

- **Protocol Token Type (\`tokenType\`):** Always \`'Bearer'\`, indicating the standard HTTP Authorization header scheme (\`Authorization: Bearer <accessToken>\`).
- **Access Token (\`accessToken\`):** Short-lived JWT (15-minute lifespan). Stateless bearer credential carrying identity claims (\`sub\`, \`email\`, \`role\`, \`tokenVersion\`, \`sessionId\`). Returned in JSON login/refresh responses for client in-memory storage, and set as an \`accessToken\` HttpOnly cookie.
- **Refresh Token (\`refreshToken\`):** Long-lived rotating cryptographic token (7-day lifespan). Bound to a single client device session stored in Redis/DB with automatic reuse detection and replay mitigation. Delivered **strictly via the \`refreshToken\` HttpOnly cookie** and never exposed in JSON responses.
- **One-Time Passcode (\`otp\`):** Ephemeral 6-digit numeric code (10-minute TTL) stored in Redis for registration email verification, sensitive account modifications, and password resets.
- **Session Identifier (\`sessionId\` / \`refreshTokenId\`):** Cryptographic UUID tracking each active device session, enabling per-device logout and multi-session revocation (\`POST /api/v1/auth/logout-all\`).

### Supported Authentication Transports

#### Transport 1: HttpOnly Cookies (Standard for Web Clients)
- Automatically issued upon successful authentication as \`Secure\`, \`HttpOnly\`, \`SameSite=Lax\` cookies:
  - \`accessToken\` — Primary authentication bearer credential.
  - \`refreshToken\` — Rotating session refresh credential scoped to session endpoints (\`path: '/'\`).

#### Transport 2: Authorization Header (Mobile Clients & Swagger UI Testing)
- Provide the JWT bearer token in the standard header:
  \`Authorization: Bearer <accessToken>\`
- Click the **"Authorize"** button in Swagger UI to test protected endpoints interactively.

---

## Security Architecture & Attack Defenses

NUTS Platform implements comprehensive defense-in-depth against top web vulnerabilities:

#### 1. Cross-Site Scripting (XSS) Immunity
- Client access tokens reside strictly in JavaScript memory closures (never in \`localStorage\` or \`sessionStorage\`).
- Refresh tokens are delivered via \`HttpOnly\`, \`Secure\`, \`SameSite=Lax\` cookies, physically inaccessible to browser JavaScript.
- Dynamic Content Security Policy (CSP) with cryptographic Web Crypto nonces blocks inline script execution.

#### 2. Cross-Site Request Forgery (CSRF) Mitigation
- Double-Submit Cookie pattern with custom \`x-csrf-token\` headers on state-changing requests (\`POST\`, \`PUT\`, \`PATCH\`, \`DELETE\`).
- Validated against cryptographically signed HMAC nonces. Server-to-server payment webhooks (\`/payments/webhook\`) bypass CSRF checks at line 1 of middleware, validated instead by timing-safe HMAC-SHA512 request signature verification.

#### 3. Brute Force & Credential Stuffing Defense
- Redis-backed sliding-window rate limiters (\`@StrictThrottle\`, \`@RefreshTokenThrottle\`, \`@OtpThrottle\`) returning \`429 Too Many Requests\` with \`Retry-After\`.
- Account lockout with exponential delay backoff on consecutive failed attempts.
- Constant-time password validation using \`bcrypt.compare\` (cost factor 12) with fake-hash comparison (\`UNKNOWN_ACCOUNT_PASSWORD_HASH\`) against non-existent accounts, eliminating username enumeration via timing attacks.

#### 4. Token Hijacking & Session Replay Defenses
- RFC 6819 single-use refresh token rotation with compare-and-swap (CAS) semantics.
- 15-second Redis grace period window (\`auth:grace:{refreshId}\`) permitting legitimate in-flight network retries and multi-tab single-flight refresh without false-positive session revocation.
- Immediate cluster-wide invalidation via cached security stamps (\`auth:stamp:{role}:{userId}\`) upon password change, account suspension, or logout.

#### 5. Injection & Mass Assignment Prevention
- PostgreSQL interactions executed via Prisma ORM with parameterized queries, eliminating SQL injection.
- Strict NestJS validation pipes (\`whitelist: true\`, \`forbidNonWhitelisted: true\`) rejecting extraneous payload attributes.
- Compile-time safe selects (\`auth.selects.ts\`) physically excluding sensitive fields (e.g. \`password\`) from API outputs.

#### 6. Broken Object Level Authorization (BOLA / IDOR)
- Multi-tenant tenant/vendor isolation enforced in service queries (\`where: { id, vendorId }\`, \`where: { id, userId }\`).
- Administrative and vendor backoffices physically decoupled from storefront purchase flows.

#### 7. Financial Fraud & Double-Spending
- \`DECIMAL(10, 2)\` fixed-point arithmetic using \`Prisma.Decimal\`, preventing IEEE-754 precision drift.
- Conditional atomic SQL wallet debits (\`WHERE balance >= :amount\`).
- Two-phase escrow crediting 85% merchant earnings to \`pendingBalance\` upon payment confirmation, unlocking to available \`balance\` strictly upon order delivery (\`DELIVERED\`).

---

## Concurrency & Race Condition Controls

- **Candidate Cart Selection & Pessimistic Row Locking (\`FOR UPDATE\`):**
  - Checkout executes inside an atomic transaction with row-level locks on all user carts.
  - Multi-cart evaluation in-memory selects the active cart with items (\`cartItems.length > 0\`), pruning empty orphan carts and evicting Redis cache (\`user:cart:v3:\${userId}\`).

- **Inventory Matrix & Deadlock Prevention:**
  - Stock decrements execute atomically: \`UPDATE products SET stock = stock - :qty WHERE stock >= :qty\`.
  - Multiple items in a batch are sorted lexicographically by ID prior to row acquisition, eliminating circular deadlock cycles (\`SQLSTATE 40P01\`).

- **Signed Asynchronous Payment Settlement:**
  - Paystack HMAC-SHA512 signed webhooks authoritatively settle \`PENDING\` orders to \`PROCESSING\` even if client redirect fails or network latency disrupts callback queries.
  - Metadata fallback resolves payments by \`orderId\` when reference strings differ.

- **Automated Unpaid Order Sweeper (\`UnpaidOrdersCron\`):**
  - Distributed cron running every 5 minutes under atomic Redis lock (\`cron:lock:unpaid-orders\`). Sweeps orders in \`PENDING\` state older than 30 minutes, restoring inventory stock and setting status to \`CANCELLED\`.

---

## Domain API Endpoints

### 1. Customer Authentication & Identity (\`/api/v1/auth\`, \`/api/v1/account\`)

- \`POST /api/v1/auth/request-otp\` — Send registration / verification OTP
- \`POST /api/v1/auth/register\` — Register customer account (requires verified email OTP)
- \`POST /api/v1/auth/login\` — Customer credentials login (issues session cookies)
- \`POST /api/v1/auth/refresh\` — Rotate customer refresh session and tokens
- \`POST /api/v1/auth/logout\` — Revoke current device session and clear cookies
- \`POST /api/v1/auth/logout-all\` — Invalidate all active sessions across all devices and clear cookies
- \`GET  /api/v1/auth/me\` — Retrieve authenticated identity and capability flags (\`canPurchase\`, \`canSell\`, \`canAdminister\`)
- \`POST /api/v1/auth/forgot-password\` & \`POST /api/v1/auth/reset-password\`
- \`GET  /api/v1/account\` (or \`/api/v1/users\`) — Retrieve customer profile
- \`PATCH /api/v1/account\` — Update customer profile details
- \`PATCH /api/v1/account/deactivate\` — Self-deactivate account
- \`POST /api/v1/account/reactivate\` — Publicly restore deactivated account within 60-day grace period

### 2. Vendor / Merchant Operations (\`/api/v1/vendors\`, \`/api/v1/vendors/auth\`)

- \`POST /api/v1/vendors/auth/request-otp\` — Request vendor registration email OTP
- \`POST /api/v1/vendors/register\` — Register vendor store and wallet (requires verified email OTP)
- \`POST /api/v1/vendors/login\` — Vendor merchant login (issues session cookies)
- \`POST /api/v1/vendors/refresh\` — Rotate vendor refresh session and tokens
- \`POST /api/v1/vendors/logout\` — Revoke vendor session and clear cookies
- \`GET  /api/v1/vendors/me\` — Retrieve authenticated vendor identity, storeName, and storeSlug
- \`GET  /api/v1/vendors/account\` — Retrieve full vendor business profile
- \`PATCH /api/v1/vendors/account\` — Update vendor store settings and branding
- \`GET  /api/v1/vendors/products\` & \`POST /api/v1/vendors/products\` — Manage merchant catalog
- \`GET  /api/v1/vendors/orders\` — Manage merchant orders and status transitions
- \`GET  /api/v1/vendors/wallet\` — Inspect merchant wallet and escrow balances
- \`PATCH /api/v1/vendors/discounts/:id/reactivate\` — Reactivate vendor promotional discount code

### 3. Administrator Operations (\`/api/v1/admin\`)

- \`POST /api/v1/admin/auth/login\` — Administrator login (enforces strict \`ADMIN\` role verification)
- \`POST /api/v1/admin/auth/refresh\` — Rotate administrator session and tokens
- \`POST /api/v1/admin/auth/logout\` — Revoke administrator session and clear cookies
- \`GET  /api/v1/admin/auth/me\` — Retrieve authenticated administrator profile
- \`GET  /api/v1/admin/users\` — Search, inspect, suspend, and reactivate platform users
- \`GET  /api/v1/admin/vendors\` & \`PATCH /api/v1/admin/vendors/:id/approve\` — Vendor partner approvals
- \`GET  /api/v1/admin/search/status\` — Operational health diagnostics for search indexing and Redis cache
- \`PATCH /api/v1/admin/discounts/:id/reactivate\` — Reactivate platform-wide discount campaign

### 4. Shopping Cart & Checkout Orchestration (\`/api/v1/cart\`, \`/api/v1/orders/checkout\`)

- \`GET    /api/v1/cart\` — Retrieve authenticated customer's active cart with products and variants
- \`GET    /api/v1/cart/discount-preview\` — Preview cart totals with applied discount code
- \`POST   /api/v1/cart/items/:productId\` — Add product or variant to cart with specified quantity
- \`PATCH  /api/v1/cart/items/:productId\` — Update cart item quantity atomically (quantity 0 removes item)
- \`DELETE /api/v1/cart/items/:productId\` — Remove specific product or variant from cart
- \`DELETE /api/v1/cart\` — Clear all items from current active cart
- \`POST   /api/v1/orders/checkout\` — Execute order checkout under pessimistic row locks (\`FOR UPDATE\`), selecting non-empty candidate carts, pruning empty orphan carts, and invalidating Redis cart cache (\`user:cart:v3:\${userId}\`)

### 5. Payments, Settlement & Webhooks (\`/api/v1/payments\`)

- \`POST /api/v1/payments/initialize\` — Initialize Paystack checkout session for an order (returns Paystack checkout authorization URL; 3DS & bank verification handled securely on gateway)
- \`GET  /api/v1/payments/order/:orderId\` — Retrieve payment record and transaction status for an order
- \`GET  /api/v1/payments/callback\` — Verify transaction callback reference with Paystack and advance order
- \`POST /api/v1/payments/webhook\` — Cryptographically signed Paystack HMAC-SHA512 webhook handler for asynchronous order settlement
- \`POST /api/v1/payments/:id/refund\` — Process full or partial payment refund (Admin/Vendor authorized)

### 6. Real-Time Notifications & Streaming (\`/api/v1/notifications\`)

- \`GET   /api/v1/notifications\` — List paginated notifications (role-scoped, supports unreadOnly filter)
- \`GET   /api/v1/notifications/unread-count\` — Retrieve live unread notification count
- \`PATCH /api/v1/notifications/:id/read\` — Mark a single notification as read
- \`PATCH /api/v1/notifications/read-all\` — Mark all user notifications as read
- \`GET   /api/v1/notifications/sse/stream\` — Real-Time Server-Sent Events (SSE) notification stream (cluster Redis Pub/Sub, connection caps, 15s session-revocation heartbeats)

---

## Unified Response Envelope

All endpoints respond with the standard RFC-compliant envelope:
\`\`\`json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "timestamp": "2026-10-15T13:30:00.000Z"
}
\`\`\``,
    )
    .setVersion('1.0.0');

  const serverUrls = new Set<string>();

  if (baseUrl) {
    swaggerBuilder.addServer(
      baseUrl,
      isStaging ? 'Active Staging Server' : 'Active Server',
    );
    serverUrls.add(baseUrl.replace(/\/$/, ''));
  }

  const renderExternalUrlEnv =
    config.get<string>('RENDER_EXTERNAL_URL') ||
    process.env.RENDER_EXTERNAL_URL;

  if (renderExternalUrlEnv) {
    const formattedRenderUrl = renderExternalUrlEnv.startsWith('http')
      ? renderExternalUrlEnv
      : `https://${renderExternalUrlEnv}`;
    if (!serverUrls.has(formattedRenderUrl.replace(/\/$/, ''))) {
      swaggerBuilder.addServer(
        formattedRenderUrl,
        'Render Staging Environment',
      );
      serverUrls.add(formattedRenderUrl.replace(/\/$/, ''));
    }
  }

  const localhostUrl = `http://localhost:${port}`;
  if (!serverUrls.has(localhostUrl)) {
    swaggerBuilder.addServer(localhostUrl, 'Local Development Server');
  }

  const swaggerConfig = swaggerBuilder
    .addTag(
      'ADMIN - ANALYTICS',
      'Admin analytics — summary, revenue, top products/vendors/categories, funnel, activity audit',
    )
    .addTag(
      'ADMIN - AUTH',
      'Admin authentication — login, logout, token refresh, administrator provisioning',
    )
    .addTag(
      'ADMIN - CACHE',
      'Admin-only cache operations — inspect and flush shared Redis cache data',
    )
    .addTag(
      'ADMIN - CATEGORY',
      'Admin category management — create, update, activate/deactivate, delete',
    )
    .addTag(
      'ADMIN - VENDORS',
      'Admin vendor management — list, approve, verify, suspend, delete',
    )
    .addTag(
      'ADMIN - DISCOUNT CODES',
      'Admin discount code management — create platform-wide codes, list, deactivate, delete',
    )
    .addTag(
      'ADMIN - ORDERS',
      'Admin order management — list/filter all orders, update any order status',
    )
    .addTag(
      'ADMIN - PRODUCT VARIANTS',
      'Admin variant management — CRUD, stock, activate/deactivate for any variant',
    )
    .addTag(
      'ADMIN - PRODUCTS',
      'Admin product management — CRUD, stock, activate/deactivate for any product',
    )
    .addTag(
      'ADMIN - SEARCH',
      'Admin global search — search users, vendors, products, orders, and discount codes',
    )
    .addTag(
      'ADMIN - USERS',
      'Admin user management — list, view, deactivate/reactivate, delete users',
    )
    .addTag(
      'AUTH',
      'Customer authentication — register, login, logout, refresh, password reset',
    )
    .addTag(
      'CART',
      'Shopping cart management — add/update/remove items, clear cart (authenticated)',
    )
    .addTag(
      'CATEGORIES',
      'Public category tree — browse the nested category hierarchy and resolve slug paths',
    )
    .addTag(
      'VENDOR - ANALYTICS',
      'Vendor analytics — revenue, top products, performance metrics',
    )
    .addTag(
      'VENDOR - DISCOUNT CODES',
      'Vendor discount code management — create, list, deactivate, delete codes',
    )
    .addTag(
      'VENDOR - ORDERS',
      'Vendor order management — view orders containing your products, update fulfillment status',
    )
    .addTag(
      'VENDOR - PRODUCT VARIANTS',
      'Vendor variant management — CRUD, stock adjustments, activate/deactivate',
    )
    .addTag(
      'VENDOR - PRODUCTS',
      'Vendor product management — CRUD, stock adjustments, activate/deactivate',
    )
    .addTag(
      'VENDOR - SEARCH',
      'Vendor-scoped search and autocomplete for products, orders, and discount codes',
    )
    .addTag(
      'VENDOR - WALLET',
      'Vendor wallet — view balance, transaction history',
    )
    .addTag(
      'VENDORS - ACCOUNT',
      'Vendor account management — view/update profile, deactivate, reactivate, delete account',
    )
    .addTag(
      'VENDORS - AUTH',
      'Vendor authentication — register, login, logout, refresh, OTP, password reset',
    )
    .addTag(
      'HEALTH',
      'Application health and readiness checks — liveness probe, database connectivity',
    )
    .addTag(
      'IMAGES',
      'Authenticated image uploads for vendor and admin product management',
    )
    .addTag(
      'NOTIFICATIONS',
      'Authenticated notification inbox — list, read, and manage notifications',
    )
    .addTag(
      'NOTIFICATIONS - SSE',
      'Authenticated server-sent event stream for real-time notifications',
    )
    .addTag(
      'ORDERS',
      'Customer order management — checkout, view orders, cancel, update shipping',
    )
    .addTag(
      'PAYMENTS',
      'Payment processing via Paystack — initialize, verify, webhooks, refunds',
    )
    .addTag(
      'PRODUCT VARIANTS',
      'Public product variant information — sizes, colors, stock per variant',
    )
    .addTag(
      'PRODUCTS',
      'Public product catalog — browse, search, filter by category/price/stock',
    )
    .addTag(
      'REVIEWS',
      'Product reviews — create, view by product, delete your own reviews',
    )
    .addTag(
      'SEARCH',
      'Global storefront search — products, autocomplete suggestions',
    )
    .addTag(
      'SHIPPING ADDRESSES',
      'Saved shipping address management — create, list, set default, delete',
    )
    .addTag(
      'USER WALLET',
      'User wallet — view balance, transaction history (authenticated)',
    )
    .addTag(
      'USERS',
      'Current user profile management — view, update, change password, deactivate/delete account',
    )
    .addTag(
      'WISHLIST',
      'Customer wishlist — add/remove products and variants, view wishlist',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Standard JWT Access Token. Enter your token here to test protected endpoints in Swagger UI or for external mobile clients.',
        in: 'header',
      },
      'JWT-auth',
    )
    .addCookieAuth('accessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
      description:
        'HttpOnly accessToken cookie automatically dispatched on login/register for browser-based clients.',
    })
    .addCookieAuth('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refreshToken',
      description:
        'HttpOnly refreshToken cookie automatically dispatched for session rotation.',
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
  });
  removeDuplicateAdminCategoryPaths(document.paths);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      tryItOutEnabled: true,
    },
    customSiteTitle: 'NUTS Platform — Staging & Development API Reference',
    customCss: `
      /* Global Layout & Font */
      .swagger-ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important; }
      .swagger-ui .topbar { display: none !important; }
      .swagger-ui .info { margin: 28px 0 36px 0 !important; max-width: 1200px !important; }
      .swagger-ui .info .title { font-weight: 800 !important; letter-spacing: -0.025em !important; font-size: 32px !important; margin-bottom: 16px !important; }
      .swagger-ui .info .description { margin-top: 20px !important; line-height: 1.8 !important; }

      /* Headings with clear breathing room */
      .swagger-ui .markdown h2, .swagger-ui .info h2 { font-size: 22px !important; font-weight: 700 !important; margin: 38px 0 16px 0 !important; padding-bottom: 8px !important; border-bottom: 2px solid #e2e8f0 !important; }
      .swagger-ui .markdown h3, .swagger-ui .info h3 { font-size: 18px !important; font-weight: 700 !important; margin: 30px 0 14px 0 !important; }
      .swagger-ui .markdown h4, .swagger-ui .info h4 { font-size: 15px !important; font-weight: 700 !important; margin: 24px 0 10px 0 !important; }

      /* Paragraphs & Text */
      .swagger-ui .markdown p, .swagger-ui .info p { font-size: 14.5px !important; line-height: 1.8 !important; margin: 0 0 16px 0 !important; }

      /* Lists & Items — Permanently eliminate line collisions and text overlap */
      .swagger-ui .markdown ul, .swagger-ui .info ul,
      .swagger-ui .markdown ol, .swagger-ui .info ol {
        margin: 10px 0 20px 0 !important;
        padding-left: 28px !important;
        list-style-position: outside !important;
        overflow: visible !important;
      }
      .swagger-ui .markdown li, .swagger-ui .info li, .swagger-ui li {
        font-size: 14px !important;
        line-height: 1.85 !important;
        margin-top: 6px !important;
        margin-bottom: 10px !important;
        padding: 0 !important;
        overflow: visible !important;
        display: list-item !important;
      }

      /* Nested Sub-lists */
      .swagger-ui .markdown li > ul, .swagger-ui .info li > ul,
      .swagger-ui .markdown li > ol, .swagger-ui .info li > ol {
        margin-top: 8px !important;
        margin-bottom: 12px !important;
        padding-left: 22px !important;
      }

      /* Inline Code Badges — Prevent line-box height expansion collisions */
      .swagger-ui .markdown code, .swagger-ui .info code, .swagger-ui code {
        font-size: 12.5px !important;
        line-height: 1.3 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        display: inline-block !important;
        vertical-align: baseline !important;
        margin: 0 2px !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      }
      .swagger-ui .markdown pre, .swagger-ui .info pre {
        padding: 16px 20px !important;
        border-radius: 8px !important;
        overflow-x: auto !important;
        margin: 20px 0 !important;
        line-height: 1.6 !important;
      }
      .swagger-ui .markdown pre code, .swagger-ui .info pre code {
        background: none !important;
        padding: 0 !important;
        display: block !important;
      }

      /* Tables with generous cell padding and borders */
      .swagger-ui .markdown table, .swagger-ui .info table {
        width: 100% !important;
        border-collapse: separate !important;
        border-spacing: 0 !important;
        margin: 24px 0 30px 0 !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        overflow: hidden !important;
      }
      .swagger-ui .markdown th, .swagger-ui .info th {
        font-weight: 700 !important;
        font-size: 13px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        padding: 14px 18px !important;
        border-bottom: 1px solid #e2e8f0 !important;
        text-align: left !important;
      }
      .swagger-ui .markdown td, .swagger-ui .info td {
        padding: 14px 18px !important;
        border-bottom: 1px solid #f1f5f9 !important;
        font-size: 13.5px !important;
        vertical-align: top !important;
        line-height: 1.7 !important;
      }
      .swagger-ui .markdown tr:last-child td, .swagger-ui .info tr:last-child td { border-bottom: none !important; }

      /* Blockquotes */
      .swagger-ui .markdown blockquote, .swagger-ui .info blockquote {
        margin: 20px 0 !important;
        padding: 14px 20px !important;
        border-left: 4px solid #0284c7 !important;
        border-radius: 0 8px 8px 0 !important;
        font-size: 14px !important;
        line-height: 1.7 !important;
      }
      .swagger-ui .markdown blockquote p, .swagger-ui .info blockquote p {
        margin: 0 !important;
        line-height: 1.7 !important;
      }

      /* Horizontal Dividers */
      .swagger-ui .markdown hr, .swagger-ui .info hr { border: none !important; border-top: 1px solid #e2e8f0 !important; margin: 34px 0 !important; }

      /* Scheme Container & Authorize Button */
      .swagger-ui .scheme-container { padding: 18px 24px !important; border: 1px solid #e2e8f0 !important; border-radius: 8px !important; margin-bottom: 28px !important; box-shadow: none !important; }
      .swagger-ui .btn.authorize { font-weight: 600 !important; border-radius: 8px !important; padding: 8px 22px !important; transition: all 0.2s !important; }

      /* Endpoint Cards & Summaries */
      .swagger-ui .opblock { border-radius: 8px !important; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05) !important; margin: 0 0 12px 0 !important; }
      .swagger-ui .opblock .opblock-summary { padding: 12px 18px !important; }
      .swagger-ui .opblock-tag { font-size: 16px !important; font-weight: 700 !important; border-bottom: 2px solid #e2e8f0 !important; margin: 34px 0 16px 0 !important; padding-bottom: 10px !important; }
      .swagger-ui .opblock-description-wrapper p, .swagger-ui .renderedMarkdown p { font-size: 13.5px !important; line-height: 1.7 !important; margin: 6px 0 !important; }
    `,
  });

  const logger = app.get(Logger);
  logger.log(
    `🚀 Swagger documentation available at /api/docs [${rawNodeEnv}] (JSON: /api/docs-json, YAML: /api/docs-yaml)`,
  );
}
