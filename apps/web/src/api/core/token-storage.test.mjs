import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAuthTokens,
  getAuthSessionRole,
  getAuthToken,
  setAuthTokens,
} from "./token-storage.ts";

test("access tokens remain isolated by explicit account role", () => {
  clearAuthTokens();
  setAuthTokens("vendor", { accessToken: "vendor-access" });
  setAuthTokens("admin", { accessToken: "admin-access" });

  assert.equal(getAuthToken("vendor"), "vendor-access");
  assert.equal(getAuthToken("admin"), "admin-access");
  assert.equal(getAuthToken("user"), null);

  clearAuthTokens("vendor");
  assert.equal(getAuthToken("vendor"), null);
  assert.equal(getAuthToken("admin"), "admin-access");
  clearAuthTokens();
});

test("session role hint is read without deriving it from the current route", () => {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "session_active=vendor" },
  });

  try {
    assert.equal(getAuthSessionRole(), "vendor");
  } finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  }
});

test("unknown session role hints are ignored", () => {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "session_active=owner" },
  });

  try {
    assert.equal(getAuthSessionRole(), null);
  } finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  }
});
