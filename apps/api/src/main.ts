import 'reflect-metadata';
import './instrument';

// Configure libuv threadpool size for crypto and I/O scalability before any modules load
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { CsrfMiddleware } from './modules/security/middleware/csrf.middleware';
import { SecurityHeadersMiddleware } from './modules/security/middleware/security-headers.middleware';
import { GlobalExceptionFilter } from './modules/shared/filters/global-exception.filter';
import { ResponseInterceptor } from './modules/shared/interceptors/response.interceptor';
import { NormalizeInputPipe } from './modules/shared/pipes/normalize-input.pipe';
import { SanitizeHtmlPipe } from './modules/shared/pipes/sanitize-html.pipe';
import { removeDuplicateAdminCategoryPaths } from './modules/shared/utils/swagger-paths.util';

const CSRF_EXEMPT_WEBHOOK_PATHS = new Set([
  '/api/v1/payment/webhook',
  '/api/v1/payments/webhook',
]);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  // Express must only trust the private reverse-proxy hops used by the
  // production ingress. This gives req.ip the real client address for limits.
  const expressApp = app
    .getHttpAdapter()
    .getInstance() as import('express').Express;
  expressApp.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // Cloud platform health and liveness probe (e.g. Render HEAD / and GET /)
  expressApp.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'nuts-api',
      timestamp: new Date().toISOString(),
    });
  });
  expressApp.head('/', (_req, res) => {
    res.status(200).end();
  });

  // Raise the per-response listener ceiling before any middleware attaches its
  // own 'finish' handlers. The default of 10 is a leak-detection heuristic that
  // is too low for a production middleware stack (pino-http + OTel HTTP/Express
  // instrumentation + NestJS platform adapter + compression + end-of-stream ×2
  // + Express internals already reaches ~12). We use 25 rather than 0 so that
  // a real listener leak (e.g., a handler that keeps attaching listeners across
  // retries without ever removing them) will still surface as a warning.
  expressApp.use((_req, res, next) => {
    res.setMaxListeners(25);
    next();
  });

  // Install parsers explicitly so request memory use stays bounded. Retain the
  // exact JSON bytes for Paystack's signature check without making a second copy.
  expressApp.use(
    express.json({
      limit: '1mb',
      verify: (request, _response, buffer) => {
        (request as Request & { rawBody?: Buffer }).rawBody = buffer;
      },
    }),
  );
  expressApp.use(
    express.urlencoded({
      extended: false,
      limit: '32kb',
      parameterLimit: 1000,
    }),
  );

  const allowedOrigins =
    config
      .get<string>('ALLOWED_ORIGINS')
      ?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) || [];

  const allowedOriginsSet = new Set(
    allowedOrigins.map((o) => {
      try {
        return new URL(o).origin;
      } catch {
        return o;
      }
    }),
  );

  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      try {
        const normalized = new URL(requestOrigin).origin;
        if (allowedOriginsSet.has(normalized)) {
          callback(null, true);
          return;
        }
      } catch {
        // Invalid origin format
      }

      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Idempotency-Key',
      'X-Request-Id',
      'x-csrf-token',
      'x-auth-role',
      'x-otp-code',
    ],
    // Let browser JS read the rotated CSRF token from responses cross-origin.
    exposedHeaders: ['x-csrf-token', 'Server-Timing'],
  });

  app.use(helmet());

  app.use(
    compression({
      threshold: 1024,
    }),
  );
  app.use(cookieParser());

  // Apply security headers middleware
  const securityHeadersMiddleware = new SecurityHeadersMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) => {
    securityHeadersMiddleware.use(req, res, next);
  });

  // Apply CSRF middleware for state-changing operations
  const csrfMiddleware = new CsrfMiddleware(allowedOrigins);
  app.use((req: Request, res: Response, next: NextFunction) => {
    // For read-only requests, always allow CSRF token generation
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return csrfMiddleware.use(req, res, next);
    }

    // Signed provider callbacks do not use browser authentication cookies.
    // All other cookie-authenticated mutations must pass CSRF validation.
    if (req.method === 'POST' && CSRF_EXEMPT_WEBHOOK_PATHS.has(req.path)) {
      return next();
    }

    csrfMiddleware.use(req, res, next);
  });

  app.setGlobalPrefix('api/v1');

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.useGlobalFilters(new GlobalExceptionFilter(config));
  app.useGlobalPipes(
    new NormalizeInputPipe(),
    new SanitizeHtmlPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerEnabled =
    !isProduction || config.get<boolean>('SWAGGER_ENABLED') === true;

  if (swaggerEnabled) {
    const port = config.get<number>('PORT', 3001);
    const baseUrl = config.get<string>('BASE_URL');

    const swaggerBuilder = new DocumentBuilder()
      .setTitle('Nuts API — E-Commerce Platform')
      .setDescription(
        `## Overview REST API for the **NUTS Multi-Vendor Marketplace Platform**.
Architected with NestJS, TypeScript, PostgreSQL, Prisma, Redis, and RabbitMQ following Domain-Driven Design (DDD) principles.

The platform enforces strict zero-trust role isolation across three autonomous security boundaries:
1. **Customer Storefront Domain** (Shoppers, Cart, Checkout, Customer Orders, Customer Wallet, Reviews)
2. **Vendor Merchant Domain** (Storefront Management, Products & Variants, Merchant Orders, Vendor Wallet, Analytics)
3. **Platform Administration Domain** (Platform Governance, Merchant Approvals, Global Orders, Category Taxonomy, System Cache)

---

## Authentication & Authorization Model

All protected operations enforce a **zero-trust capability-driven security model**. Authentication identities are strictly separated; role spoofing and cross-domain access are physically prevented by database isolation and backend \`RolesGuard\` validation.

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
- **Access Token:** Short-lived JWT (15-minute lifespan). Encodes identity (\`sub\`, \`email\`, \`role\`) and permissions.
- **Refresh Token:** Long-lived rotating cryptographic token (7-day lifespan). Bound to a single client device session stored in Redis/DB with automatic reuse detection and replay mitigation.

### Supported Authentication Transports
1. **HttpOnly Cookies (Standard for Web Clients):**
   - Automatically issued upon successful authentication as \`Secure\`, \`HttpOnly\`, \`SameSite=Lax\` cookies:
     - \`access_token\`: Primary authentication bearer cookie.
     - \`refresh_token\`: Secret refresh cookie scoped to session endpoints.
     - \`session_active\`: Client-readable session state hint.
2. **Authorization Header (Mobile Clients & Swagger UI Testing):**
   - Provide the JWT in the standard header:
     \`Authorization: Bearer <access_token>\`
   - Use the **"Authorize"** button in Swagger UI to test protected endpoints.

---

## Domain Authentication Endpoints

### 1. Customer Authentication (\`/api/v1/auth\`)
- \`POST /api/v1/auth/request-otp\` — Send registration / verification OTP
- \`POST /api/v1/auth/register\` — Register customer account (requires verified email OTP)
- \`POST /api/v1/auth/login\` — Customer credentials login (issues session cookies)
- \`POST /api/v1/auth/refresh\` — Rotate customer refresh session and tokens
- \`POST /api/v1/auth/logout\` — Revoke current device session and clear cookies
- \`GET  /api/v1/auth/me\` — Retrieve authenticated identity and capability flags (\`canPurchase\`, \`canSell\`, \`canAdminister\`)
- \`POST /api/v1/auth/forgot-password\` & \`POST /api/v1/auth/reset-password\`

### 2. Vendor / Merchant Authentication (\`/api/v1/vendors/auth\` or \`/api/v1/vendors\`)
- \`POST /api/v1/vendors/auth/otp/request\` — Request vendor registration email OTP
- \`POST /api/v1/vendors/register\` — Register vendor store and wallet (requires verified email OTP)
- \`POST /api/v1/vendors/login\` — Vendor merchant login (issues session cookies)
- \`POST /api/v1/vendors/refresh\` — Rotate vendor refresh session and tokens
- \`POST /api/v1/vendors/logout\` — Revoke vendor session and clear cookies
- \`POST /api/v1/vendors/auth/forgot-password/otp/request\` & \`POST /api/v1/vendors/auth/forgot-password/reset\`

### 3. Administrator Authentication (\`/api/v1/admin/auth\`)
- \`POST /api/v1/admin/auth/login\` — Administrator login (enforces strict \`ADMIN\` role verification)
- \`POST /api/v1/admin/auth/refresh\` — Rotate administrator session and tokens
- \`POST /api/v1/admin/auth/logout\` — Revoke administrator session and clear cookies
- \`GET  /api/v1/admin/auth/me\` — Retrieve authenticated administrator profile
- \`POST /api/v1/admin/auth/create-admin\` — Provision additional administrator accounts (Admin only)

---

## Resiliency, Rate Limiting & Security

- **Strict Throttling:** Sensitive endpoints (auth, OTP, checkout) enforce strict rate limits (e.g. 5 req/min). Throttled requests respond with \`429 Too Many Requests\` and include a \`Retry-After\` header.
- **Account Lockout:** Multiple consecutive failed password attempts trigger temporary account locks with exponential backoff.
- **CSRF Defense:** State-changing cookie-authenticated requests enforce double-submit CSRF origin and token validation.
- **Unified Response Envelope:** All endpoints respond with the standard RFC-compliant envelope:
  \`{ "success": boolean, "statusCode": number, "data": T, "timestamp": string, "requestId": string }\``,
      )
      .setVersion('1.0.0');

    if (baseUrl) {
      swaggerBuilder.addServer(
        baseUrl,
        isProduction ? 'Active Production / Staging Server' : 'Active Server',
      );
    }
    swaggerBuilder
      .addServer(`http://localhost:${port}`, 'Local Development Server')
      .addServer('https://staging-api.nuts-commerce.com', 'Staging Environment')
      .addServer('https://api.nuts-commerce.com', 'Production Environment');

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
      .addCookieAuth('access_token', {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description:
          'HttpOnly access_token cookie automatically dispatched on login/register for browser-based clients.',
      })
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      deepScanRoutes: true,
    });
    removeDuplicateAdminCategoryPaths(document.paths);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
      },
      customSiteTitle: 'Nuts API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
    });
    logger.log(' Swagger documentation available at /api/docs');
  }

  app.enableShutdownHooks();
  const port = config.get<number>('PORT') || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(
    `Application running on port ${port} (0.0.0.0) [${config.get('NODE_ENV')}]`,
  );
}

bootstrap().catch((error) => {
  console.error('Failed to start application', error);
  process.exit(1);
});
