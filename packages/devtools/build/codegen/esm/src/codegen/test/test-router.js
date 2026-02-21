import { HeadersSubset } from "@mionkit/core";
import { linkedFn, route, headersFn, initMionRouter } from "@mionkit/router";
const routes = {
  auth: headersFn(
    (ctx, h) => new HeadersSubset({ "x-user-id": "user-123" })
  ),
  users: {
    getUser: route((ctx, id) => ({ id, name: "Test User", age: 30 })),
    createUser: route((ctx, user) => `Created user ${user.name}`)
  },
  utils: {
    sum: route((ctx, a, b) => a + b),
    echo: route((ctx, message) => message)
  },
  log: linkedFn((ctx) => {
  })
};
const testApiPromise = initMionRouter(routes, { prefix: "api/v1" });
export {
  routes,
  testApiPromise
};
//# sourceMappingURL=test-router.js.map
