"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const core = require("@mionkit/core");
const router = require("@mionkit/router");
const routes = {
  auth: router.headersFn(
    (ctx, h) => new core.HeadersSubset({ "x-user-id": "user-123" })
  ),
  users: {
    getUser: router.route((ctx, id) => ({ id, name: "Test User", age: 30 })),
    createUser: router.route((ctx, user) => `Created user ${user.name}`)
  },
  utils: {
    sum: router.route((ctx, a, b) => a + b),
    echo: router.route((ctx, message) => message)
  },
  log: router.linkedFn((ctx) => {
  })
};
const testApiPromise = router.initMionRouter(routes, { prefix: "api/v1" });
exports.routes = routes;
exports.testApiPromise = testApiPromise;
//# sourceMappingURL=test-router.js.map
