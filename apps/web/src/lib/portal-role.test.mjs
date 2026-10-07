import assert from "node:assert/strict";
import test from "node:test";

import {
  getPortalRoleForApiUrl,
  getPortalRoleForPath,
} from "./portal-role.ts";

test("portal routes resolve only their own role", () => {
  assert.equal(getPortalRoleForPath("/admin/products"), "admin");
  assert.equal(getPortalRoleForPath("/auth/admin/login"), "admin");
  assert.equal(getPortalRoleForPath("/vendor/product/123"), "vendor");
  assert.equal(getPortalRoleForPath("/auth/vendor/login"), "vendor");
  assert.equal(getPortalRoleForPath("/vendor/my-store"), "user");
  assert.equal(getPortalRoleForPath("/vendor"), "user");
  assert.equal(getPortalRoleForPath("/product"), "user");
});

test("public storefront APIs never select portal credentials", () => {
  for (const url of [
    "/api/v1/vendors/store",
    "/api/v1/vendors/store/my-store/products",
    "/api/v1/products",
    "/api/v1/categories",
    "/api/v1/search",
  ]) {
    assert.equal(getPortalRoleForApiUrl(url, "/vendor/my-store"), null, url);
  }
});

test("protected API namespaces use the matching account role", () => {
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/vendors/me", "/vendor/analytic"),
    "vendor",
  );
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/admin/auth/me", "/admin"),
    "admin",
  );
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/account", "/"),
    "user",
  );
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/vendors/products", "/vendor/my-store"),
    "vendor",
  );
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/admin/products", "/vendor/my-store"),
    "admin",
  );
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/cart", "/vendor/my-store"),
    "user",
  );
});

test("public auth actions and unknown endpoints do not receive bearer credentials", () => {
  assert.equal(getPortalRoleForApiUrl("/api/v1/vendors/auth/login", "/vendor/product"), null);
  assert.equal(getPortalRoleForApiUrl("/api/v1/auth/register", "/"), null);
  assert.equal(getPortalRoleForApiUrl("/api/v1/unclassified", "/admin"), null);
});

test("shared management endpoints use the active management portal", () => {
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/images/upload", "/vendor/product"),
    "vendor",
  );
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/variants/123", "/admin/products", "PATCH"),
    "admin",
  );
  assert.equal(
    getPortalRoleForApiUrl("/api/v1/variants/123", "/vendor/product", "GET"),
    null,
  );
});
