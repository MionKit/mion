import { HeadersSubset } from "@mionkit/core";
import { linkedFn, route, headersFn, initMionRouter } from "@mionkit/router";
const routes = {
  // Keep auth route (same as test-router.ts)
  auth: headersFn(
    (ctx, h) => new HeadersSubset({ "x-user-id": "user-123" })
  ),
  // NEW: products routes (replaces users routes)
  products: {
    getProduct: route((ctx, id) => ({ id, name: "Test Product", price: 99.99 })),
    createProduct: route((ctx, product) => `Created product ${product.name}`)
  },
  // Keep utils routes (same as test-router.ts)
  utils: {
    sum: route((ctx, a, b) => a + b),
    echo: route((ctx, message) => message)
  },
  // Keep log linkedFn (same as test-router.ts)
  log: linkedFn((ctx) => {
  })
};
const testApiPromise = initMionRouter(routes, { prefix: "api/v1" });
export {
  routes,
  testApiPromise
};
//# sourceMappingURL=test-router-modified.js.map
