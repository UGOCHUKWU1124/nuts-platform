# NUTS Platform — Enterprise Backend API (`apps/api`)

[![NestJS 11](https://img.shields.io/badge/NestJS-11.x-red.svg)](https://nestjs.com/)
[![TypeScript 5.8](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Prisma 7](https://img.shields.io/badge/Prisma-7.x-2D3748.svg)](https://www.prisma.io/)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Alpine-DC382D.svg)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-AMQP-FF6600.svg)](https://www.rabbitmq.com/)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ED.svg)](https://www.docker.com/)

> **`apps/api`** is the core REST API and asynchronous event processing service of the NUTS Platform. Architected with NestJS 11, TypeScript 5.8, PostgreSQL 16, Prisma 7, Redis Alpine, RabbitMQ, and Docker containerization, adhering strictly to Domain-Driven Design (DDD) principles, it provides high-throughput transaction processing, banking-grade IAM security, real-time Server-Sent Events (SSE), and fault-tolerant message handling.

---

## Core Framework & Infrastructure Architecture

- **Modular Monolith Framework:** NestJS 11 on Node.js with TypeScript and RxJS stream pipelines.
- **Containerization & Deployment:** Multi-stage Docker production images with Alpine Linux minimal runtime base, non-root user execution, and standalone dependency isolation.
- **Data Persistence & ORM:** PostgreSQL 16 managed via Prisma 7 with native pg adapter (`@prisma/adapter-pg`).
- **Distributed Cache & State:** Redis Alpine via `ioredis` with clustered pub/sub event broadcasting, Redlock distributed locking, `enableOfflineQueue: true`, active connection lifecycle telemetry (`connect`, `ready`, `error`, `reconnecting`), and deep `/health/ready` latency ping probes.
- **Asynchronous Messaging Broker:** RabbitMQ 3 (AMQP) topic exchanges with dedicated queues, consumer workers, and dead-letter exchanges (`nuts.dlx` / `q.nuts.dlq`).
- **Media Asset Pipeline & CDN Delivery:** Cloudinary Media Management backed by Akamai Edge CDN, automatically transforming and delivering assets via `f_auto,q_auto` (serving AVIF and WebP with zero CPU overhead on origin servers).
- **Transactional Communications:** Brevo HTTPS transactional email delivery with template variable hydration and circuit-breaker fail-safe delivery.

---

## Architecture & Domain Subsystems

### 1. Identity & Access Management (IAM)
Located in [`src/modules/auth`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/auth) and [`src/modules/identity`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/identity):
- **Triple-Tier Role Model:** Physical and logical partition across `USER` (Customer), `VENDOR` (Merchant), and `ADMIN` (Platform Operator) roles.
- **Dual-Channel Authentication Architecture:** NUTS API operates a **Defense-in-Depth Dual-Channel Verification Model** in [`JwtStrategy.extractAccessToken`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/auth/strategies/access/jwt.strategy.ts), evaluated in strict order of precedence:
  1. *Priority 1 — `Authorization: Bearer <token>` Header:* Consumed by Axios in React runtime, mobile clients, and Swagger UI. Grants native CSRF immunity.
  2. *Priority 2 — `HttpOnly Cookie: accessToken`:* Consumed by Next.js 16 SSR / Edge Middleware on initial direct URL navigation or F5 reload before client JavaScript boots.
  3. *Priority 3 — Query Parameter `?token=` or `?accessToken=`:* Consumed by Server-Sent Events (SSE) connections where browsers cannot set custom headers.
- **Dual-Emission on Login & Refresh:** Backend simultaneously issues `accessToken` (15m) and `refreshToken` (7d) as secure HttpOnly cookies (`SameSite=Lax; Secure; Path=/`), AND returns `{ accessToken, tokenType: 'Bearer', expiresIn: 900, user }` in the JSON response body. The frontend Axios client reads the JSON body into an in-memory JS closure (never `localStorage`), while the browser stores the cookies for SSR. The 7-day `refreshToken` is strictly excluded from JSON to eliminate XSS session theft.
- **Strict CamelCase Standard:** All cookie names, DTO fields, query parameters, and response envelopes strictly follow camelCase (`accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `productId`, `variantId`).
- **Token Taxonomy & Lifecycle:**
  - **Protocol Token Type (`tokenType`):** Always `'Bearer'`, defining the standard HTTP Authorization header contract (`Authorization: Bearer <accessToken>`).
  - **Access Token (`accessToken`):** Short-lived JWT (15-minute lifespan) carrying user claims (`sub`, `email`, `role`, `tokenVersion`, `sessionId`). Sent in JSON response bodies and as an `accessToken` HttpOnly cookie.
  - **Refresh Token (`refreshToken`):** Long-lived rotating cryptographic token (7-day lifespan) bound to a device session. Delivered strictly through the `refreshToken` HttpOnly cookie and never exposed in JSON responses.
  - **One-Time Passcode (`otp`):** Ephemeral 6-digit verification code stored in Redis (10-minute TTL) for email verification, registration, and password recovery.
  - **Session Identifier (`sessionId` / `refreshTokenId`):** UUID tracking each physical device session in PostgreSQL/Redis, allowing individual logout and global multi-device revocation (`POST /api/v1/auth/logout-all`).
- **RFC 6819 Single-Use Rotation:** Refresh token reuse detection with atomic CAS rotation and a 15-second Redis grace period concurrency window for in-flight requests.
- **Multi-Device Global Logout:** `POST /api/v1/auth/logout-all` revokes all active device sessions for the authenticated identity, invalidates cached security stamps, and clears authentication cookies.
- **Redis Security Stamp Revocation:** Sub-millisecond session validation via cached security stamps (`auth:stamp:{role}:{userId}`), enabling immediate cluster-wide revocation upon logout, password reset, or admin suspension.
- **Compile-Time Safe Selects:** Centralized Prisma projections (`auth.selects.ts`) enforcing compile-time exclusion of password hashes from API responses.
- **Timing-Safe Cryptographic Defense:** Enforces bcrypt (cost factor 12) with fake-hash comparison (`UNKNOWN_ACCOUNT_PASSWORD_HASH`) against non-existent accounts to eliminate timing-based user enumeration.
- **Account Lifecycle & Verification Alignment:**
  - `UsersController` is exposed via dual routes `@Controller(['account', 'users'])`.
  - Stored `isEmailVerified` boolean on PostgreSQL `users` table (`@default(true)`), backfilling all existing verified registrations.
  - Returns both `isEmailVerified` and legacy alias `isVerified` on all user profile DTOs for complete backward compatibility.
  - Enforces international E.164 phone number formatting (`/^\+[1-9]\d{6,14}$/`) across all incoming registration, address, and profile payloads.
  - Sensitive operations require two-factor OTP authorization (`@OtpRequired()`).
  - Account deactivation (`PATCH /account/deactivate`) and deletion (`DELETE /account/delete`) immediately clear auth cookies at the HTTP boundary.
  - Public account reactivation (`POST /account/reactivate`) allows restore within a 60-day grace period.

### 2. Shopping Cart & Checkout Orchestration
Located in [`src/modules/checkout/cart`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/checkout/cart) and [`src/modules/checkout/orders`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/checkout/orders):
- **Candidate Cart Selection & Pessimistic Row Locking (`FOR UPDATE`):** Checkout locks all open candidate carts for the user in PostgreSQL. Rather than blindly picking the newest cart (which may be an empty orphan from another session), `OrdersService` evaluates candidate carts in-memory to find the active cart with items (`cartItems.length > 0`), eliminating false-positive empty cart checkout errors.
- **Automatic Orphan Cart Pruning:** Unchecked-out duplicate empty carts are consolidated and pruned in the same atomic transaction.
- **Distributed Redis Cache Synchronization:** Caches active carts under `user:cart:v3:${userId}`. Mutations (adding, updating quantity, removing, clearing) and checkout completion automatically purge this key to guarantee real-time cart state across client sessions.
- **Atomic Item Quantities & Variant Validation:** Enforces stock checks against specific `ProductVariant` instances, calculating sub-totals and price totals using fixed-point precision.

### 3. Catalog & Multi-Variant Inventory Matrix
Located in [`src/modules/catalog`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/catalog):
- **Self-Referential Category Tree:** Recursive PostgreSQL relations (`parentId` / `children`) enabling arbitrary-depth subcategory classification and deep-slug resolution.
- **Decoupled Variant Matrix:** Products decouple root marketing metadata from sellable SKUs (`ProductVariant`), supporting multidimensional attributes (Size, Color, Material, Weight) with dedicated pricing and stock counters.
- **Atomic Stock Deduction:** Conditional SQL executions (`UPDATE products SET stock = stock - :qty WHERE stock >= :qty RETURNING id`) with lexicographical ID lock sorting to prevent overselling and eliminate deadlocks (`SQLSTATE 40P01`).

### 3. Search & Relevance Ranking Engine
Located in [`src/modules/shared/search`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/shared/search):
- **12-Tier Multi-Attribute Scoring:** Combines exact title hits (+10.0), exact SKU/order identifiers (+8.0 to +10.0), prefix title matches (+6.0), full-text vector queries (`to_tsvector @@ plainto_tsquery`, +2.8), vendor/category associations (+1.8 to +2.0), and `pg_trgm` typo tolerance fallback.
- **Cross-Domain Indexing:** Dispatches search across Products, Vendors, Categories, Users, Orders, and Discount Codes.
- **Redis Query Cache:** Results cached with 120-second TTL and graceful fallback to PostgreSQL when cache is unavailable.
- **Operational Health Diagnostics (`GET /api/v1/admin/search/status`):** Exposed via [`AdminSearchController`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/search/admin-search.controller.ts) under `@Roles(ROLE.ADMIN)`, verifying indexing readiness, PostgreSQL full-text search capability, and Redis query cache operational health.
- **Deep Relational Search Queries:**
  - `OrdersService.findAllAdmin` & `findAllForVendor`: Full relational lookups across `orderNumber`, `user.email`, `user.firstName`, `user.lastName`, `shippingAddress`, `discountCode`, `payment.transactionReference`, and ordered item titles (`orderItems.some.product.name`).
  - `ProductsService.buildListWhere`: Cross-entity search evaluating `name`, `sku`, `description`, `slug`, vendor relations (`vendor.storeName`, `vendor.email`), and category relation (`category.name`).
  - `AdminVendorsService.findAll`: Multi-attribute search matching `email`, `storeName`, `storeSlug`, `firstName`, `lastName`, `businessEmail`, `businessPhone`, `phone`, and `storeDescription`.
  - `UsersService.findAll`: Searches `firstName`, `lastName`, `email`, and `phone`.
- **Promotions & Discount Code Lifecycle (`PATCH /reactivate`):**
  - Dedicated reactivation endpoints in both `AdminDiscountCodesController` (`PATCH /api/v1/admin/discounts/:id/reactivate`) and `VendorDiscountCodesController` (`PATCH /api/v1/vendors/discounts/:id/reactivate`), restoring inactive vouchers to active status with automatic promotion cache invalidation.

### 4. Billing, Wallets & Payment Authorization
Located in [`src/modules/billing`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/billing):
- **Fixed-Point Decimal Arithmetic:** PostgreSQL `DECIMAL(10, 2)` balances with `Prisma.Decimal` arithmetic, eliminating IEEE 754 precision drift.
- **Atomic Wallet Debits:** Conditional SQL balance deduction (`WHERE balance >= :amount`) preventing double-spend anomalies.
- **Two-Phase Vendor Escrow:** Credits 85% merchant earnings to `pendingBalance` upon payment confirmation; releases funds to available `balance` strictly upon order delivery (`DELIVERED`).
- **Immediate Frontend & Backend Cart Emptying:**
  - Client-side cache purging (`clearClientCart`) empties React Query cart cache and optimistic items the instant checkout or Paystack redirection is triggered.
  - Server-side atomic transaction marks the active cart as `checkedOut = true`, prunes its `cartItem` rows, and clears Redis cache (`user:cart:v3:${userId}`).
- **Direct Paystack Payment Routing (`PaymentsController`):**
  - Mapped via `@Controller(['payment', 'payments'])`.
  - `POST /payment/initialize` validates customer order ownership using `ParseUUIDPipe` and initializes the Paystack transaction session, returning gateway authorization URLs. 3DS security and bank OTP challenges are managed directly by Paystack's payment interface.
- **Cryptographic Paystack Webhook Resilience:**
  - Server-to-server webhook endpoints (`POST /api/v1/payments/webhook` and `/webhooks`) bypass CSRF checks at line 1 of `CsrfMiddleware` before browser origin or cookie validation.
  - Paystack IP filtering middleware (`PaystackIpMiddleware`) validates source IP ranges while honoring trusted reverse proxy forwarded headers.
  - Cryptographic HMAC-SHA512 verification via `crypto.timingSafeEqual()` against raw request buffers (`req.rawBody`).
  - **Authoritative Signed Webhook Settlement:** If Paystack's external verification GET API is slow or unreachable, `PaymentsService` advances `PENDING` orders to `PROCESSING` directly using the cryptographically verified HMAC webhook event data.
  - **Metadata Order Fallback:** Resolves payment records by `orderId` if transaction references differ, preventing orphaned `PENDING` states when callback URLs are bypassed.
  - **Storefront Self-Healing (`/order/[id]`):** Order detail views automatically poll and verify payment in the background while `order.status === 'PENDING'`, instantly advancing the UI even if the customer navigates away from the Paystack callback URL.
  - **Automated Unpaid Order Expiration & Stock Restoration (`UnpaidOrdersCron`):** Distributed cron running every 5 minutes (`UNPAID_ORDER_EXPIRATION.CRON_SCHEDULE`). Employs Redis atomic locks (`cron:lock:unpaid-orders`) to sweep `PENDING` orders exceeding 30 minutes, automatically cancelling them, returning reserved stock to inventory (`restoreOrderStock`), updating payments to `FAILED`, and recording audit trails.

### 5. Real-Time Notification Pipeline & Event Architecture
Located in [`src/modules/notifications`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/notifications):
- **Clustered Server-Sent Events (SSE):** Distributed across API pods via Redis Pub/Sub (`nuts:notifications:broadcast`) with per-user connection limits (maximum 5) and live session validation.
- **Database Deduplication:** Enforces unique `dedupeKey` constraints with deterministic event keys to prevent duplicate delivery across webhook retries and network replays.
- **Standardized Response Contracts (`NotificationsController`):** Enforces explicit `@Message()` descriptors across all endpoints (`Notifications retrieved successfully`, `Unread notification count retrieved successfully`, `Notification marked as read successfully`, `All notifications marked as read successfully`, `All read notifications cleared successfully`, `Notification deleted successfully`).
- **Asynchronous Worker Queues:** Dedicated RabbitMQ queues (`q.nuts.emails`, `q.nuts.notifications`) with automatic failover to Brevo and database fallback when the broker is unreachable.
- **Outbox Partial Indexing:** Optimized event polling using partial index `outbox_events_pending_process_idx` on `outbox_events ("createdAt" ASC) WHERE "status" IN ('PENDING', 'FAILED') AND "attempts" < 5`.
- **Automated Retention Cron:** Daily distributed cron pruning read notifications older than 90 days and unread notifications older than 180 days in bounded 1,000-row batches.
- **Transactional Outbox & Message Failure Handling (`OutboxRelay`):**
  - Bounded 5-attempt retry engine with atomic batch claiming (`status: PROCESSING`).
  - Terminal failure preservation: failed events exceeding 5 attempts remain permanently indexed in PostgreSQL via `outbox_events_pending_process_idx` for manual inspection and replay.
  - Poison message dead-lettering: RabbitMQ consumers execute `nack(false, false)`, routing unparseable payloads directly to `q.nuts.dlq` via `nuts.dlx` to prevent infinite consumer retry loops.
  - Offline broker resilience: `NotificationListener` falls back immediately to Brevo HTTPS and direct database persistence if RabbitMQ is offline.
- **Duplicate Email Prevention Architecture:**
  - State-machine concurrency gates: Paystack webhooks execute atomic conditional updates (`updateMany WHERE id = :id AND status = 'PENDING'`). Exactly one caller claims `count === 1`; duplicate webhooks exit immediately without emitting events.
  - Outbox single-append guarantee: Emails are committed inside the order/payment transaction, preventing phantom emails on rollback.
  - In-app deduplication keys: Unique `dedupeKey` constraints trap duplicates with Prisma `P2002`.
  - Rate-limiting & cooldowns: OTP and sensitive email requests are gated by `@OtpThrottle()` and Redis 60-second cooldown keys.
  - `idempotencyKey` vs. `dedupeKey`: Client-driven ingress idempotency (HTTP header `Idempotency-Key` stored in `checkout_idempotency`) protects checkout double-clicks; server-driven deterministic `dedupeKey` (`EVENT:ENTITY_ID:ROLE:ACTOR_ID` on `notifications` table) protects asynchronous consumers and event streams against webhook retries without requiring distributed Redis locks.

### 6. Security, Exception Translation & Operational Hardening
Located in [`src/modules/security`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/modules/security) and [`src/common/filters`](file:///c:/MY%20PROJECT/NUTS-P/apps/api/src/common/filters):
- **Standardized Exception Envelope (`GlobalExceptionFilter`):** Uniform JSON error contract (`{ success: false, message, error: { code, details?, retryAfter? }, timestamp }`).
- **Prisma Error Translation:** Translates `P2002` (409 Conflict), `P2025` (404 Not Found), and `P2003` (400 Bad Request with structured constraint diagnostics).
- **Rate-Limiting & Retry-After:** Propagates `Retry-After` headers and envelope properties on throttled requests (`429 Too Many Requests`).
- **Double-Submit Cookie CSRF Defense (`CsrfMiddleware`):** Validates `x-csrf-token` header against server-issued `csrf_token` cookie for mutating requests, with origin and fetch-site verification.
- **OpenAPI 3.0 / Swagger Portal:** Interactive developer portal at `/api/docs` with client-side filtering, bearer persistence, and production gating (`NODE_ENV=production` physically unmounts docs endpoints).

---

## Architectural Trade-offs & Deep Engineering Concepts

Building an enterprise-scale, multi-vendor commerce engine requires navigating critical engineering trade-offs. The following decisions reflect conscious design choices prioritizing data integrity, sub-millisecond execution, and security under resource constraints.

### 1. Modular Monolith vs. Distributed Microservices
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NUTS API: MODULAR MONOLITH                            │
│                                                                             │
│  ┌────────────────┐    ┌─────────────────┐    ┌──────────────────────────┐  │
│  │ Identity / IAM │    │ Catalog / Merch │    │   Checkout & Orders      │  │
│  └───────┬────────┘    └────────┬────────┘    └────────────┬─────────────┘  │
│          │                      │                          │                │
│          └──────────────┐       │       ┌──────────────────┘                │
│                         ▼       ▼       ▼                                   │
│                     ┌───────────────────────┐                               │
│                     │ Transactional Outbox  │                               │
│                     └───────────┬───────────┘                               │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  ▼
                        ┌───────────────────┐
                        │ RabbitMQ Exchange │
                        └─────────┬─────────┘
                                  ▼
                    ┌───────────────────────────┐
                    │ Async Workers & Consumers │
                    └───────────────────────────┘
```
- **The Trade-off:** Microservices introduce network hops (serialization/deserialization penalties), complex distributed transactions (2PC / Saga rollbacks), partial failure states, and high memory footprints (50–100MB per microservice runtime). On a 512MB RAM budget, running 6 independent services is physically impossible.
- **The Solution:** A Modular Monolith adhering to Domain-Driven Design (DDD). Each domain (IAM, Catalog, Cart, Checkout, Billing, Notifications) maintains strict module boundaries, encapsulated data models, and isolated service contracts.
- **Cross-Domain Communication:** Synchronous queries use typed NestJS service interfaces within the process boundary ($O(1)$ memory references, zero network overhead). Asynchronous mutations (e.g. Order Placed $\to$ Inventory Deduction $\to$ Vendor Notification $\to$ Customer Email) execute via the **Transactional Outbox Pattern** backed by PostgreSQL and RabbitMQ, guaranteeing **At-Least-Once Delivery** without distributed two-phase commits.

### 2. Dual-Transport OWASP Ephemeral Session Architecture: In-Memory Access Tokens + HttpOnly SSR Cookies vs. LocalStorage
- **The Problem with LocalStorage:** Storing JWTs in browser `localStorage` or `sessionStorage` leaves credentials permanently exposed to **Cross-Site Scripting (XSS)**. Any third-party script, compromised npm package, or injected DOM element can execute `localStorage.getItem()` and immediately exfiltrate the user's active session.
- **The Problem with Cookie-Only SPAs:** Pure cookie-only authentication complicates non-browser clients (Swagger UI, curl, automated test suites, native mobile apps) and exposes mutating requests to Cross-Site Request Forgery (CSRF).
- **The Problem with Memory-Only SPAs in Next.js (SSR):** If access tokens are kept *only* in JavaScript memory, every initial page navigation (e.g. typing `nuts.com/admin` in the URL bar or pressing F5 reload) reaches the Next.js Node/Edge server before any React bundle or client-side JavaScript executes in the browser. At that millisecond, client memory is empty (0 bytes), no custom `Authorization: Bearer` header can be attached, and the server would falsely redirect the user to `/login` or require a slow, blocking server-to-server token exchange on every page render.
- **The NUTS Engineering Solution (Dual-Transport Hybrid Model):**
  1. *Simultaneous Dual-Emission on Login & Refresh:* When `/api/v1/auth/login` or `/auth/refresh` succeeds, the backend responds across two discrete channels simultaneously:
     - **HTTP Headers (`Set-Cookie`):**
       ```http
       Set-Cookie: accessToken=eyJhbGciOi...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900
       Set-Cookie: refreshToken=eyJhbGciOi...; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
       ```
       The browser network engine automatically places these in its protected cookie jar. JavaScript (`document.cookie`) is strictly forbidden by the browser engine from accessing them.
     - **HTTP Response Body (`JSON Payload`):**
       ```json
       {
         "status": "success",
         "data": {
           "accessToken": "eyJhbGciOi...",
           "tokenType": "Bearer",
           "expiresIn": 900,
           "user": { "id": "usr_01J...", "email": "customer@nuts.com", "role": "USER" }
         }
       }
       ```
       Client JavaScript reads the JSON body and stores the `accessToken` inside a module-scoped memory closure ([`token-storage.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/api/core/token-storage.ts)).
  2. *The Critical Asymmetry:* The 7-day `refreshToken` is **never** included in the JSON body—it exists strictly inside the `HttpOnly` cookie. This guarantees that even if an attacker achieves full XSS script execution, they cannot steal the long-lived refresh token.
  3. *Runtime Usage Separation:*
     - **Client-Side API Requests (Axios in React runtime):** Axios extracts the in-memory token from its private closure and attaches `Authorization: Bearer <token>`. This provides standard REST API interoperability and automatic CSRF immunity (browsers never attach custom HTTP headers to cross-site `<form>` submissions).
     - **Next.js 16 SSR & Edge Middleware Navigation:** When the user navigates directly to a URL or refreshes, the browser automatically sends the secure `accessToken` cookie. Next.js Edge Middleware and Server Component Layouts ([`server-auth.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/lib/server-auth.ts)) verify the HMAC-SHA256 signature in < 1ms using Web Crypto API, enforcing route protection on the server before streaming HTML to the client.
  4. *Zero-Persistence Client Security:* In-memory tokens vanish when the browser tab closes. If an XSS exploit occurs, the attacker cannot read the 7-day `refreshToken` (blocked by browser `HttpOnly` policy), and the short-lived 15-minute `accessToken` cannot be refreshed without access to the protected cookie.

### 3. Pessimistic Row-Level Locking (`FOR UPDATE`) vs. Optimistic Locking
- **The Trade-off:** Optimistic locking (using a `version` column) assumes low contention. Under high-concurrency flash sales (hundreds of shoppers purchasing the last 5 units of a product simultaneously), optimistic locking causes thundering-herd rollback cascades, wasting CPU cycles and failing user checkouts.
- **The Solution:** **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**:
  - During checkout, `OrdersService` acquires row locks on all open user candidate carts.
  - Multi-cart evaluation filters open carts to select the active cart containing line items (`cartItems.length > 0`), pruning duplicate empty carts in the same atomic transaction.
  - In inventory management, stock is deducted via conditional atomic SQL: `UPDATE products SET stock = stock - :qty WHERE stock >= :qty RETURNING id`. If rows affected is 0, the transaction immediately rolls back with an `InsufficientStockException`, eliminating both overselling and retry churn.

### 4. 15-Second Redis Grace-Period Window (RFC 6819) vs. Instant Invalidation
- **The Trade-off:** RFC 6819 mandates single-use refresh token rotation to prevent replay attacks. However, in real-world web applications, modern browsers fire parallel API requests across multiple tabs on load. If Tab A refreshes the token and immediately revokes the old token, Tab B's concurrent refresh request will present the old token, falsely trigger reuse detection, and catastrophically log the user out across all tabs.
- **The Solution:** **Atomic Compare-And-Swap (CAS) with 15-Second Redis Grace Cache**:
  - The first refresh request rotates the token in PostgreSQL and writes the fresh token pair to Redis under `auth:grace:{refreshId}` with a strict 15-second TTL.
  - If concurrent requests with the same `refreshId` arrive within 15 seconds (due to multi-tab loading or network packet retries), the API serves the cached fresh token pair instead of rejecting the request.
  - If a refresh request with an already-rotated token arrives *after* the 15-second window, the security engine treats it as a compromised token replay attack and immediately revokes the entire device session.

### 5. Redis Security Stamp Revocation vs. JWT Blacklists
- **The Trade-off:** Stateless JWTs cannot be revoked before expiration without tracking state. Naive JWT blacklisting stores every revoked token until its expiry, creating an unbounded $O(N)$ memory leak in Redis.
- **The Solution:** **Security Stamp Model (`auth:stamp:{role}:{userId}`)**:
  - When an account changes password, logs out globally, or is suspended by an administrator, the API updates `tokenVersion` in PostgreSQL and updates the Redis security stamp in $O(1)$ time.
  - On incoming requests, `JwtAuthGuard` compares the token's embedded `tokenVersion` claim against the cached Redis stamp in sub-millisecond time. If mismatched, the request is immediately rejected (`401 Unauthorized`), achieving instantaneous cluster-wide revocation with near-zero memory footprint.

---

## Concurrency, Race Conditions & Edge-Case Engineering

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                           CONCURRENCY CONTROLS MATRIX                                 │
├──────────────────────────────┬─────────────────────────────┬──────────────────────────┤
│ Scenarios & Edge Cases       │ Primary Failure Mode        │ Architectural Mitigation │
├──────────────────────────────┼─────────────────────────────┼──────────────────────────┤
│ Token Refresh Stampede       │ Session revoked in multi-tab│ 15s Redis Grace Window   │
│ Flash-Sale Inventory Deplete │ Overselling / Deadlock 40P01│ Lexicographical Lock Sort│
│ Multi-Tab Checkout Collision │ Duplicate Order Creation    │ Row-Level FOR UPDATE     │
│ Webhook vs. Client Redirect  │ Orphaned PENDING Order      │ Signed Webhook Settlement│
│ Unpaid Order Stock Hold      │ Abandoned Inventory Lock    │ Redis-Locked Cron Sweeper│
│ SSE Stream Leak              │ Server File Descriptor Drain│ Heartbeat Stamp Pings    │
└──────────────────────────────┴─────────────────────────────┴──────────────────────────┘
```

### 1. Token Refresh Stampede & Network Replay
- **The Problem:** A customer opens 4 browser tabs simultaneously after an idle period. All 4 tabs detect an expired access token and simultaneously invoke `POST /auth/refresh`.
- **The Mechanics:**
  1. Tab 1 arrives at the server. `RefreshSessionService` rotates `refreshTokenId` in PostgreSQL using CAS (`WHERE refreshTokenId = :expectedId`).
  2. Tab 1 receives fresh tokens and writes them to Redis grace cache.
  3. Tabs 2, 3, and 4 arrive milliseconds later. Their CAS in PostgreSQL returns `count === 0`.
  4. Instead of throwing an unauthorized exception, the service inspects Redis for `auth:grace:{refreshId}`. Finding the active grace record, it returns the newly generated token set to Tabs 2, 3, and 4.
  5. On the frontend, client-side single-flight locking (via Web Locks API and in-memory promise deduplication) prevents multiple tabs from flooding the network in the first place, providing defense-in-depth.

### 2. Inventory Overselling & Circular Deadlock Avoidance (`SQLSTATE 40P01`)
- **The Problem:** Two customers simultaneously checkout multi-item orders containing Product A and Product B. Customer 1 locks Product A and waits for Product B. Customer 2 locks Product B and waits for Product A. Both transactions block indefinitely, triggering PostgreSQL deadlock aborts (`SQLSTATE 40P01`).
- **The Mechanics:**
  1. `OrdersService` extracts all product/variant IDs in the checkout cart.
  2. **Lexicographical Sorting:** The array of IDs is strictly sorted before any database lock or query executes (`['prod_aaa', 'prod_bbb'].sort()`).
  3. All database locks across the entire platform are acquired in the exact same deterministic order.
  4. Circular wait conditions are mathematically impossible, completely eliminating database deadlocks under heavy concurrent checkout load.
  5. Stock deduction executes with atomic conditional SQL:
     ```sql
     UPDATE "products"
     SET "stock" = "stock" - :quantity, "updatedAt" = NOW()
     WHERE "id" = :productId AND "stock" >= :quantity
     RETURNING "id", "stock";
     ```

### 3. Duplicate Checkout & Candidate Cart Evaluation
- **The Problem:** A customer clicks "Pay" twice in rapid succession, or has two tabs open with items in one tab and an empty cart in another. Naive checkout picking the newest cart selects the empty cart, throwing a false error, or creates duplicate orders.
- **The Mechanics:**
  1. `OrdersService.checkout` initiates an atomic PostgreSQL transaction with serializable isolation semantics.
  2. Executes pessimistic row-level locking across all open carts for the user:
     ```sql
     SELECT * FROM "carts"
     WHERE "userId" = :userId AND "checkedOut" = false
     FOR UPDATE;
     ```
  3. In-memory evaluation scans candidate carts to locate the active cart containing items (`cartItems.length > 0`).
  4. If multiple empty candidate carts exist (e.g. from abandoned parallel sessions), they are pruned and deleted within the transaction.
  5. Cart status is atomically updated to `checkedOut = true`, cart items are deleted, and the distributed Redis cache key (`user:cart:v3:${userId}`) is evicted.
  6. Subsequent rapid clicks instantly fail with `CartNotFoundException`, preventing duplicate order creation.

### 4. Asynchronous Webhook Settlement & Callback Latency
- **The Problem:** When paying via Paystack, the customer may close the browser immediately after debit, network dropouts may prevent redirect back to `/order/[id]`, or Paystack's external verification GET API may experience high latency.
- **The Mechanics:**
  1. Paystack dispatches an asynchronous server-to-server webhook (`POST /payments/webhook`).
  2. **CSRF Bypass:** Line 1 of `CsrfMiddleware` explicitly bypasses CSRF validation for webhook paths, ensuring third-party servers are never blocked by browser cookie policies.
  3. **Cryptographic Validation:** The raw request buffer (`req.rawBody`) is verified via HMAC-SHA512 using `crypto.timingSafeEqual()` against `process.env.PAYSTACK_SECRET_KEY`.
  4. **Authoritative State Transition:** The webhook handler inspects the event payload. If `event === 'charge.success'`, it advances the order directly to `PROCESSING`, updates payment to `SUCCESS`, credits 85% merchant earnings to `pendingBalance`, and emits an outbox event.
  5. **Metadata Order Fallback:** If the transaction reference in the webhook does not match a payment record (e.g. due to gateway reference prefixing), the handler extracts `orderId` from Paystack's `metadata` payload to locate and settle the order.
  6. **Storefront Self-Healing:** If the customer does return to `/order/[id]`, the page polls the backend while `order.status === 'PENDING'`, instantly updating the UI as soon as the webhook completes without requiring manual refresh.

### 5. Automated Unpaid Order Sweeper & Stock Restoration (`UnpaidOrdersCron`)
- **The Problem:** Shoppers initialize checkout, reserve inventory, but abandon the Paystack payment modal. Without cleanup, inventory remains permanently locked, preventing other shoppers from purchasing.
- **The Mechanics:**
  1. `UnpaidOrdersCron` runs every 5 minutes (`UNPAID_ORDER_EXPIRATION.CRON_SCHEDULE = '*/5 * * * *'`).
  2. **Distributed Locking:** Uses Redis `SET cron:lock:unpaid-orders "1" EX 240 NX` to ensure that in multi-instance horizontal deployments, only one API pod executes the sweep.
  3. Queries for orders in `PENDING` state created more than 30 minutes ago (`createdAt < NOW() - 30 minutes`).
  4. For each expired order, an atomic transaction:
     - Updates order status to `CANCELLED` with cancellation reason `Auto-cancelled due to payment timeout`.
     - Updates associated payment records to `FAILED`.
     - Iterates through line items and restores stock directly to products and variants (`restoreOrderStock`).
     - Appends an audit trail entry in `OrderStatusHistory`.

### 6. Real-Time SSE Stream Resilience & Zombie Connection Mitigation
- **The Problem:** Long-lived HTTP connections (Server-Sent Events) can leak file descriptors, exhaust server memory, and leave zombie connections active when client tabs crash or disconnect abruptly.
- **The Mechanics:**
  1. `NotificationsController.streamNotifications` registers SSE clients in an in-memory connection registry tracked by `userId`.
  2. **Connection Capping:** Enforces a maximum of 5 concurrent SSE streams per user. If a 6th connection attempts to open, the oldest connection is gracefully terminated (`429 / Stream closed`).
  3. **Heartbeat Loop:** Every 15 seconds, a heartbeat ping (`: heartbeat\n\n`) is dispatched down the wire.
  4. Concurrently, the heartbeat handler inspects the user's active Redis security stamp. If the security stamp was revoked (e.g. user logged out or suspended in another tab), the SSE stream is terminated immediately (`res.end()`).
  5. Express `req.on('close')` listeners guarantee that when a browser closes, the client is unlinked from Redis Pub/Sub listeners, preventing memory leaks.

---

## Security In-Depth: Attack Vector Defense Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               ATTACK DEFENSE MATRIX                                     │
├──────────────────────────────┬──────────────────────────────┬───────────────────────────┤
│ Attack Category              │ OWASP Threat Class           │ Implemented Countermeasure│
├──────────────────────────────┼──────────────────────────────┼───────────────────────────┤
│ Cross-Site Scripting (XSS)   │ Injection (A03:2021)         │ In-memory JWT + HttpOnly  │
│ Cross-Site Request Forgery   │ Broken Access (A01:2021)     │ Double-Submit Cookie CSRF │
│ Credential Stuffing / Brute  │ Identification (A07:2021)    │ Sliding Throttler + Locks │
│ Timing Analysis Attacks      │ Cryptographic (A02:2021)     │ Constant-Time Fake Hashes │
│ Session Hijacking / Replay   │ Identification (A07:2021)    │ RFC 6819 CAS Rotation     │
│ Broken Object Authorization  │ Broken Access (A01:2021)     │ Tenant-Scoped ORM Queries │
│ Mass Assignment / Injection  │ Injection (A03:2021)         │ Strict DTO Whitelisting   │
│ Financial Double-Spending    │ Software Integrity (A08:2021)│ Fixed-Point Decimal + SQL │
└──────────────────────────────┴──────────────────────────────┴───────────────────────────┘
```

### 1. Cross-Site Scripting (XSS)
- **Vulnerability:** Malicious scripts injected into the DOM attempt to read `document.cookie`, `localStorage`, or `sessionStorage` to steal session tokens.
- **Platform Countermeasures:**
  - Zero storage of authentication credentials in `localStorage` or `sessionStorage`.
  - Refresh tokens delivered via cookies with flags: `HttpOnly` (blocks JavaScript access), `Secure` (blocks transmission over plaintext HTTP), `SameSite=Lax` (prevents cross-site cookie leakage).
  - Dynamic Content Security Policy (CSP) headers generated on every request with cryptographically secure Web Crypto nonces (`crypto.randomBytes(16)`), blocking execution of unauthorized inline scripts.

### 2. Cross-Site Request Forgery (CSRF)
- **Vulnerability:** An attacker tricks a victim's browser into executing state-changing requests against NUTS API using ambient authenticated cookies.
- **Platform Countermeasures:**
  - Implements the **Double-Submit Cookie Pattern**: The server issues a cryptographically random, signed CSRF token in an accessible cookie (`csrf_token`).
  - Mutating HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) must extract this value and supply it in the `x-csrf-token` HTTP header.
  - `CsrfMiddleware` verifies that the header matches the cookie and validates the `Origin` and `Referer` headers against allowed domains.
  - Webhooks from Paystack bypass CSRF strictly at line 1 of middleware, requiring HMAC-SHA512 cryptographic signature validation instead.

### 3. Brute Force & Credential Stuffing
- **Vulnerability:** Automated bots submit thousands of password or OTP guesses per second to compromise user accounts.
- **Platform Countermeasures:**
  - Redis sliding-window rate limiting:
    - `@StrictThrottle()`: 5 requests per minute for login and password reset.
    - `@OtpThrottle()`: 3 OTP generation requests per 10 minutes.
    - `@RefreshTokenThrottle()`: 30 token rotations per minute.
  - `AccountLockGuard`: Tracks consecutive failed attempts in Redis (`auth:lock:{email}`). Upon reaching the threshold (5 attempts), the account is locked for 15 minutes with exponential backoff.
  - `Retry-After` headers return the exact seconds remaining before requests can resume.

### 4. Username Enumeration via Timing Attacks
- **Vulnerability:** Attackers measure server response latency to differentiate between existing accounts (slow bcrypt computation, ~100ms) and non-existent accounts (fast return, ~2ms).
- **Platform Countermeasures:**
  - `AuthService` pre-computes an application-level fake hash (`UNKNOWN_ACCOUNT_PASSWORD_HASH` using bcrypt cost factor 12).
  - If a user lookup returns null, the engine still executes `await bcrypt.compare(password, UNKNOWN_ACCOUNT_PASSWORD_HASH)`.
  - Server response time remains strictly constant regardless of whether the email exists in the database, completely eliminating user enumeration vulnerabilities.

### 5. Broken Object Level Authorization (BOLA / IDOR)
- **Vulnerability:** A logged-in customer modifies URL parameters to access another customer's order (`/api/v1/orders/:id`), or a vendor modifies product listings belonging to a competing merchant.
- **Platform Countermeasures:**
  - Zero trust in client-supplied identity parameters. The authenticated user ID is extracted strictly from the validated JWT claims (`req.user.sub`).
  - All Prisma database queries enforce strict tenant ownership constraints:
    - Customer orders: `prisma.order.findFirst({ where: { id, userId: req.user.sub } })`.
    - Vendor catalog: `prisma.product.updateMany({ where: { id, vendorId: req.user.sub }, data })`.
  - Roles are enforced via NestJS `RolesGuard`. Vendor or Admin attempts to access customer checkout endpoints receive immediate `403 Forbidden` responses.

### 6. SQL Injection & Mass Assignment
- **Vulnerability:** Attackers supply SQL fragments in request parameters or extra JSON fields (e.g. `{ "role": "ADMIN", "isApproved": true }`) to escalate privileges.
- **Platform Countermeasures:**
  - All database interactions use Prisma ORM with parameterized prepared statements, preventing SQL injection.
  - NestJS global validation pipes enforce `whitelist: true` and `forbidNonWhitelisted: true`. Any request body containing fields not explicitly declared in the corresponding DTO is rejected with `400 Bad Request`.
  - Compile-time safe projections (`USER_AUTH_SELECT`, `VENDOR_AUTH_SELECT`) ensure password hashes and secret salts can never be returned in API output.

### 7. Financial Double-Spending & Precision Loss
- **Vulnerability:** Parallel requests debiting a wallet simultaneously allow spending more than the available balance, or IEEE-754 floating-point arithmetic causes fractional cent rounding discrepancies ($0.1 + 0.2 = 0.30000000000000004$).
- **Platform Countermeasures:**
  - All currency columns use PostgreSQL `DECIMAL(10, 2)` mapped to `Prisma.Decimal`, enforcing arbitrary-precision fixed-point mathematics.
  - Wallet balance debits execute via atomic conditional updates:
    ```sql
    UPDATE "vendor_wallets"
    SET "balance" = "balance" - :amount
    WHERE "vendorId" = :vendorId AND "balance" >= :amount;
    ```
  - If concurrent requests attempt to debit the wallet, the second update matches 0 rows and immediately fails, preventing double-spend anomalies.


---

## Local Development & Testing

```bash
# Start API in watch mode on port 3001
npm run dev --prefix apps/api

# Run all backend unit test suites (38 test suites, 249 tests passing)
npm run test --prefix apps/api

# Run all End-to-End (E2E) integration test suites
npm run test:e2e --prefix apps/api

# Run dedicated End-to-End Payment Flow test suite (Phases 1-6)
npx jest --config ./test/jest-e2e.json payment-flow --prefix apps/api

# Run targeted authentication and security test suites
npm run test --prefix apps/api -- src/modules/auth src/modules/security

# Execute type checking
npm run typecheck --prefix apps/api

# Run lint checks
npm run lint --prefix apps/api
```

### End-to-End Payment Flow Suite (`test/payment-flow.e2e-spec.ts`)

Simulates the complete customer journey and gateway interaction:
- **Phase 1 (Identity & JWT):** Customer authentication and session initialization under `JwtAuthGuard`.
- **Phase 2 (Cart Orchestration):** Product and variant addition (`POST /api/v1/cart/items/:productId`) with stock validation, followed by cart verification (`GET /api/v1/cart`).
- **Phase 3 (Checkout & Atomic Cart Clearance):** `POST /api/v1/orders/checkout` creating `PENDING` order, transactionally setting `checkedOut = true`, deleting cart items, and purging Redis cart cache.
- **Phase 4 (Paystack Initialization):** `POST /api/v1/payment/initialize` creating Paystack checkout URL and unique reference.
- **Phase 5 (Asynchronous Settlement via Webhook):** Simulates customer paying on Paystack and closing browser or bypassing the callback URL. Posts HMAC-SHA512 `x-paystack-signature` webhook payload (`POST /api/v1/payments/webhook`) bypassing CSRF checks. Advances payment to `SUCCESS`, order to `PROCESSING`, records status history, credits vendor wallet (85%), and generates transactional outbox event.
- **Phase 6 (Storefront Self-Healing & Cart Emptiness):** Verifies order state (`GET /api/v1/orders/:id`), payment verification (`GET /api/v1/payments/verify/:reference`), and confirms 0 remaining items in active cart (`GET /api/v1/cart`).
