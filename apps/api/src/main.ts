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

      // In non-production, allow any localhost or 127.0.0.1 origin regardless of port
      if (
        !isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)
      ) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(requestOrigin)) {
        callback(null, true);
        return;
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
  const csrfMiddleware = new CsrfMiddleware(allowedOrigins, isProduction);
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
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Nuts API — E-Commerce Platform')
      .setDescription(
        `## Overview

Production-ready REST API for the Nuts e-commerce platform. Handles multi-vendor marketplace operations including customer auth, shopping cart, checkout, payments via Paystack, vendor store management, and full admin controls.

## Authentication

All authenticated endpoints use **httpOnly cookies** set during login/register. The \`access_token\` cookie is read automatically by the server. A Bearer token may be sent via the \`Authorization\` header as a fallback.

**Cookie-based auth (preferred):** The server sets \`access_token\` and \`refresh_token\` as httpOnly, secure, same-site cookies. These are sent automatically on every request.

**Bearer auth (fallback):** Click the "Authorize" button and paste your JWT token. This is useful for testing in Swagger UI.

### Auth flows
| Flow | Endpoints |
|------|-----------|
| Customer Auth | \`POST /api/v1/auth/register\`, \`/login\`, \`/refresh\`, \`/logout\` |
| Vendor Auth | \`POST /api/v1/vendors/register\`, \`/login\`, \`/refresh\`, \`/logout\` |
| Admin Auth | \`POST /api/v1/admin/auth/setup\`, \`/login\`, \`/refresh\`, \`/logout\` |

### Rate limiting
Sensitive endpoints (auth, OTP, checkout) have strict rate limits. Responses include \`Retry-After\` headers when throttled.`,
      )
      .setVersion('1.0.0')
      .addServer(
        `http://localhost:${config.getOrThrow<number>('PORT')}`,
        'Development server',
      )
      .addServer('https://api.nuts-commerce.com', 'Production server')
      .addTag(
        'ADMIN - ANALYTICS',
        'Admin analytics — summary, revenue, top products/vendors/categories, funnel, activity audit',
      )
      .addTag(
        'ADMIN - AUTH',
        'Admin authentication — setup, login, logout, token refresh',
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
            'Optional fallback. The server prefers httpOnly access_token cookies set during login. Use this header when cookies are unavailable (e.g., mobile clients).',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      deepScanRoutes: true,
    });
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
