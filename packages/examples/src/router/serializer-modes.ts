import {initMionRouter, route, Routes} from '@mionjs/router';

interface Report {
  id: string;
  generatedAt: Date;
  totals: Map<string, number>;
}

const routes = {
  getReport: route(
    (ctx, id: string): Report => ({
      id,
      generatedAt: new Date(),
      totals: new Map(),
    })
  ),
} satisfies Routes;

// start-json
// 'json' is the default: fastest, mutates the value in place, keeps unknown properties.
export const jsonApi = await initMionRouter(routes, {serializer: 'json'});
// end-json

// start-stringify-json
// 'stringifyJson' never mutates the value and drops properties the type does not declare.
export const stringifyJsonApi = await initMionRouter(routes, {
  serializer: 'stringifyJson',
});
// end-stringify-json

// start-binary
// 'binary' produces the smallest payload and, like stringifyJson, leaves the value untouched.
export const binaryApi = await initMionRouter(routes, {serializer: 'binary'});
// end-binary
