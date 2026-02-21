"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const core = require("@mionkit/core");
const router = require("@mionkit/router");
const routes = {
  // Keep auth route (same as test-router.ts)
  auth: router.headersFn(
    (ctx, h) => new core.HeadersSubset({ "x-user-id": "user-123" })
  ),
  // NEW: products routes (replaces users routes)
  products: {
    getProduct: router.route((ctx, id) => ({ id, name: "Test Product", price: 99.99 })),
    createProduct: router.route((ctx, product) => `Created product ${product.name}`)
  },
  // Keep utils routes (same as test-router.ts)
  utils: {
    sum: router.route((ctx, a, b) => a + b),
    echo: router.route((ctx, message) => message)
  },
  // Keep log linkedFn (same as test-router.ts)
  log: router.linkedFn((ctx) => {
  })
};
const testApiPromise = router.initMionRouter(routes, { prefix: "api/v1" });
exports.routes = routes;
exports.testApiPromise = testApiPromise;
//# sourceMappingURL=test-router-modified.js.map
