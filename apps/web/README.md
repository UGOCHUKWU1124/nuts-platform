# NUTS Platform — Web Client Application (`apps/web`)

[![Next.js 16](https://img.shields.io/badge/Next.js-16.x-black.svg)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![TypeScript 5.8](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC.svg)](https://tailwindcss.com/)
[![Zustand](https://img.shields.io/badge/State-Zustand-orange.svg)](https://github.com/pmndrs/zustand)
[![TanStack Query](https://img.shields.io/badge/Cache-TanStack_Query-FF4154.svg)](https://tanstack.com/query)

> **`apps/web`** is the Next.js 16 unified front-end client for the NUTS Platform. It delivers an enterprise multi-vendor e-commerce experience partitioned across three distinct user domains (Customer Storefront, Merchant Portal, and Platform Administration) powered by React 19 Server Components, App Router routing, and banking-grade in-memory authentication.

---

## Architecture & Layout Domains

The web client organizes routes into route groups with dedicated layout boundaries:

```
apps/web/src/app/
├── (storefront)/        # Public shopping experience
│   ├── category/        # Deep-slug hierarchical taxonomy browsing
│   ├── product/         # Product detail pages & variant selectors
│   ├── cart/            # Full-page cart overview
│   ├── checkout/        # Order placement & Paystack handoff
│   ├── order/           # Order tracking, live status & payment retry
│   ├── store/           # Branded merchant storefronts (/store/[slug])
│   ├── vendors/         # Marketplace vendor directory
│   └── search/          # Full-text exploratory search
├── (vendor)/            # Authenticated merchant portal
│   ├── vendor/product/  # Merchant product management & variant editor
│   └── vendor/orders/   # Vendor fulfillment & order pipeline
├── (admin)/             # Back-office administration portal
│   ├── admin/category/  # Recursive taxonomy tree management
│   └── admin/product/   # Platform-wide product catalog moderation
└── (auth)/              # Multi-step authentication workflows
    ├── auth/register/   # 3-step customer registration wizard
    ├── auth/login/      # Customer & merchant credential authentication
    ├── auth/vendor/     # Merchant self-service onboarding
    └── auth/forgot-password/ # 2-stage OTP password recovery
```

---

## Core Systems & Component Surfaces

### 1. Multi-Step Onboarding & Identity Flows
- **Customer Registration (`RegisterPage` at `/auth/register`):**
  - **Step 1:** Profile data, password complexity enforcement (`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#]).*$/`), and live referral pre-check against `/api/v1/account/referral/validate`.
  - **Step 2:** Strict 6-digit numeric OTP email verification with resend cooldown timer.
  - **Step 3:** Immediate initial delivery address capture (`fullName`, `phone`, `street`, `city`, `state`, `country`).
- **Merchant Onboarding (`VendorRegisterPage` at `/auth/vendor/register`):** Store name and merchant credentials with immediate 6-digit OTP email confirmation.
- **Password Recovery (`ForgotPasswordPage` at `/auth/forgot-password`):** Rate-limited OTP dispatch followed by OTP validation and 12+ character replacement password setting with immediate revocation of existing browser sessions.

### 2. Catalog & Discovery Surfaces
- **Interactive Search Drawer ([`SearchDrawer.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/search/SearchDrawer.tsx)):** Portal-mounted search modal with debounced query execution, exploratory category pills, and multi-entity grouping (Products, Categories, Stores, Coupons).
- **Hierarchical Category Traversal ([`category-tree.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/lib/category-tree.ts)):** Client tree engine that recursively resolves nested URL slugs of arbitrary depth (e.g. `/category/apparel/footwear/running-shoes`), maintaining breadcrumbs and subcategory filters.
- **Category Tree Picker ([`CategoryPicker.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/form/CategoryPicker.tsx)):** Admin and vendor taxonomy explorer with instant path search and leaf-only selection enforcement.
- **Multi-Variant Builder ([`ProductVariantBuilder.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/product/ProductVariantBuilder.tsx)):** Multidimensional attribute matrix configuration (Size, Color, Material) with independent SKUs, stock levels, and compare-at prices.

### 3. Merchant Marketplace Surfaces & Storefront Operator Mode
- **Storefront Operator Bar & Privilege Isolation ([`StorefrontOperatorBar.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/layout/StorefrontOperatorBar.tsx)):** Floating operator dock injected across storefront layouts when authenticated as an Administrator (`canAdminister`) or Merchant (`canSell`). Disables consumer carts and purchasing actions to prevent accidental transactions while offering one-click shortcuts back to Admin/Vendor Consoles, Catalogs, Orders, and Settings.
- **Storefront Merchant & Admin Oversight ([`VendorStoreView.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/vendor/VendorStoreView.tsx)):** Contextual management header displayed on public vendor storefronts giving merchants direct shortcuts to manage products, branding, and dashboard, and giving administrators oversight controls to audit vendor items and inspect KYC credentials.
- **Product Detail Operator Inspection ([`ProductDetailView.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/product/ProductDetailView.tsx)):** Replaces consumer purchase steppers with role-aware preview banners ("Vendor Catalog Preview" or "Administrator Preview") with deep-links directly into back-office catalog editors.
- **Branded Merchant Storefront ([`VendorStoreView.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/vendor/VendorStoreView.tsx)):** Public storefront at `/store/[slug]` featuring server-hydrated store data, vendor initials fallback badge (`getStoreInitials`), verified merchant badging, store-specific product search, price range filtering, and horizontal scrolling category tabs.
- **Merchant Directory ([`VendorsPageView.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/vendor/VendorsPageView.tsx)):** Directory of platform merchants at `/vendors` with search, verification status, product counts, and rating aggregations.
- **Management Operator Toolbar ([`ManagementToolbar.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/common/ManagementToolbar.tsx)):** Standardized control surface for administrative and vendor grids (`/admin/product`, `/admin/category`, `/admin/order`, `/admin/vendor`, `/admin/user`, `/admin/discount`, `/vendor/product`, `/vendor/order`, `/vendor/discount`) featuring debounced search with clear trigger, dual dynamic select filters, active filter reset action, live spinning refresh indicator (`RefreshCw`), and custom action slots.
- **Enterprise Unified Data Grid ([`DataTable.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/data/DataTable.tsx)):** Type-safe generic data grid supporting configurable column definitions (`Column<T>`), dual-model pagination (`DataTablePagination` for cursor or page/limit offset), 6-row skeleton pulse loading states, empty-state illustrations, and interactive row click handlers across all back-office operational portals.
- **Promotions & Discount Code Portals (`/admin/discount` & `/vendor/discount`):** Complete campaign creation and governance surfaces featuring interactive modal editors with Zod schema validation, percentage/fixed discount calculations, 1-click clipboard code copy, and confirmation dialog guards.
- **Defensive Confirmation Dialogs & OTP Prompts ([`ConfirmDialog.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/modal/ConfirmDialog.tsx) & [`OtpPromptDialog.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/modal/OtpPromptDialog.tsx)):** Intercepts all administrative and merchant state-altering operations with accessible, high-visibility confirmation modals prior to network dispatch:
  - **Admin Actions:** Approving vendor stores, verifying KYC credentials, suspending/reactivating vendor accounts, suspending user accounts (with configurable durations and mandatory justification), unsuspending users, executing user account deletion with 2FA OTP, toggling product active status, purging Redis taxonomy cache, restoring archived categories, and reactivating promotional codes.
  - **Vendor Actions:** Deactivating and reactivating products, deleting products, advancing order fulfillment stages (both table-driven and modal-driven via `OrderDetailsModal`), deactivating discount coupons, reactivating inactive coupons, deleting unused coupons, and deactivating/deleting merchant store profiles.
- **Recursive Category Hierarchy Search ([`admin/category/page.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/app/(admin)/admin/category/page.tsx)):** Visual taxonomy explorer that recursively filters nested category nodes and dynamically expands matching branch paths upon search and status filter updates.
- **Multi-Asset Drag-and-Drop Pipeline ([`ImageUpload.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/form/ImageUpload.tsx)):** Role-aware uploader (`admin` vs. `vendor`) supporting up to 6 images with local thumbnail preview queues, per-file pre-upload cancellation, 5MB file cap, MIME validation, primary cover star selection, and Cloudinary batch uploading.

### 4. Shopping Cart, Checkout Orchestration & Payment Resumption
- **Shopping Cart Drawer ([`ShoppingDrawer.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/cart/ShoppingDrawer.tsx)) & Full Cart View ([`CartPageView.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/cart/CartPageView.tsx)):** Slide-over drawer with optimistic item adjustments, line-item subtotal recalculation, and seamless navigation to `/checkout`.
- **Checkout Wizard ([`CheckoutFlow.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/components/domain/cart/CheckoutFlow.tsx)):** Live address selection with inline address capture, discount code validation preview, and idempotent order placement (`Idempotency-Key`).
- **Immediate Client Cart Clearing ([`cart-cleanup.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/lib/cart-cleanup.ts)):** Invokes `clearClientCart(queryClient)` the instant checkout order placement succeeds, purging React Query cart caches and resetting optimistic stores across all open browser tabs.
- **Storefront Self-Healing & Order Polling ([`order/[id]/page.tsx`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/app/(storefront)/order/[id]/page.tsx)):** Polls every 3 seconds while `order.status === 'PENDING'`, running a silent background verification against Paystack. If the customer completed payment on Paystack but closed the window before redirecting to the callback URL, the order page settles the transaction and advances the UI to `PROCESSING` on load.
- **Safe Gateway Redirection:** Validates payment authorization links through domain-guarded `safePaystackCheckoutUrl`, enforcing navigation exclusively to `https://checkout.paystack.com/*`.

### 5. Real-Time Notification Pipeline
- **SSE Stream Lifecycle ([`use-notifications.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/hooks/use-notifications.ts)):** Manages live Server-Sent Events connections at `/api/v1/notifications/sse/stream` scoped to the active portal role.
- **Connection Policy ([`notification-stream-policy.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/lib/notification-stream-policy.ts)):** Limits stream reconnect retries to a maximum of 3 failures (`MAX_NOTIFICATION_STREAM_FAILURES = 3`), retrying selectively on status 429 and server errors >= 500 while avoiding tight retry loops on proxy 502 Bad Gateway responses.
- **Unauthenticated Cache Isolation:** Immediately flushes persisted notification stores when unauthenticated sessions are encountered, preventing data leakage across shared devices.

### 6. Client Security & Network Architecture
- **In-Memory Token Hygiene ([`token-storage.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/api/core/token-storage.ts)):** JWT access tokens are retained strictly in closure memory, eliminating token exposure in `localStorage`.
- **Double-Submit CSRF Defense ([`client.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/api/core/client.ts)):** Axios automatically extracts the `csrf_token` cookie and transmits it via `x-csrf-token` headers on mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Web Locks API Mutex:** Refreshes tokens using `navigator.locks.request("nuts_token_refresh_lock")`, collapsing concurrent tab refreshes into a single network flight.
- **Dynamic Content Security Policy ([`middleware.ts`](file:///c:/MY%20PROJECT/NUTS-P/apps/web/src/middleware.ts)):** Generates Web Crypto nonces per request, enforcing strict script and style restrictions alongside Paystack, Cloudinary, and Google authentication origins.

---

## Local Development

```bash
# Start Next.js web client on port 5173
npm run dev --prefix apps/web

# Execute frontend TypeScript type checking
npm run typecheck --prefix apps/web

# Execute frontend unit test suites
npm run test:unit --prefix apps/web

# Build optimized production bundle
npm run build --prefix apps/web
```
