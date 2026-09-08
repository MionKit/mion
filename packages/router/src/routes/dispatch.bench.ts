/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Throughput harness for the request dispatch chain. Every case drives a REAL request through
// dispatchRoute, so it measures what a server pays per request minus the socket: chain walk, param
// decode, validation, handler call, result guards and response serialization. Run with:
//   pnpm exec vitest bench --project router dispatch
//
// `control` is deliberately unrelated to dispatch. A change that moves it moved the machine, not
// the code, so compare every other case against it before believing a delta.

import {bench, describe} from 'vitest';
import {createMionRouter, resetRouter} from '../router.ts';
import {dispatchRoute} from '../dispatch.ts';
import {headersFromRecord} from '../lib/headers.ts';
import {Routes} from '../types/general.ts';
import {FatalError, RpcError} from '@mionjs/core';

const mion = createMionRouter({});

interface Item {
  id: string;
  name: string;
  tags: string[];
  score: number;
}

const routes = {
  // no params, no work: the floor of what a chain costs
  syncNoParams: mion.route((): string => 'hello'),
  // one validated object param, the shape most routes actually have
  syncObjectParam: mion.route((_ctx, item: Item): Item => item),
  // an async handler, so the loop's await is real rather than skipped
  asyncRoute: mion.route(async (_ctx, item: Item): Promise<Item> => item),
  // a sync handler that returns a promise WITHOUT being an async function
  promiseArrow: mion.route((_ctx, item: Item): Promise<Item> => Promise.resolve(item)),
  // a big payload, so a per-step win is not measured only against an empty body
  largePayload: mion.route((_ctx, items: Item[]): Item[] => items),
  // the error path, present so a guard change is shown not to make failures slower
  fatalRoute: mion.route((): string | RpcError<'gate-closed'> => new FatalError({publicMessage: 'closed', type: 'gate-closed'})),
} satisfies Routes;

// three middleFns in front of one route: the per-step costs multiply here
const chainRoutes = {
  first: mion.middleFn((): void => undefined),
  second: mion.middleFn((): void => undefined),
  third: mion.middleFn(async (): Promise<void> => undefined),
  chained: mion.route((_ctx, item: Item): Item => item),
} satisfies Routes;

resetRouter();
mion.initRoutes({...routes, ...chainRoutes});

const item: Item = {id: 'id-1', name: 'name-1', tags: ['a', 'b'], score: 1};
const manyItems: Item[] = Array.from({length: 200}, (_unused, i) => ({
  id: `id-${i}`,
  name: `name-${i}`,
  tags: ['a', 'b'],
  score: i,
}));

/** Bodies are built once: the bench measures dispatch, not JSON.stringify. */
const bodies = {
  syncNoParams: '{}',
  syncObjectParam: JSON.stringify({syncObjectParam: [item]}),
  asyncRoute: JSON.stringify({asyncRoute: [item]}),
  promiseArrow: JSON.stringify({promiseArrow: [item]}),
  largePayload: JSON.stringify({largePayload: [manyItems]}),
  fatalRoute: '{}',
  chained: JSON.stringify({chained: [item]}),
};

const reqHeaders = headersFromRecord({});
const rawRequest = {};
const rawResponse = {};

/** One request, exactly as an adapter would issue it. Response headers are fresh per call because
 *  the serializer writes content-type into them, which is what a real response does too. */
function dispatch(path: string, body: string) {
  return dispatchRoute(path, body, reqHeaders, headersFromRecord({}), rawRequest, rawResponse);
}

describe('dispatch chain', () => {
  bench('control (no dispatch, machine drift only)', () => {
    JSON.parse(bodies.syncObjectParam);
  });

  bench('sync route, no params', async () => {
    await dispatch('/syncNoParams', bodies.syncNoParams);
  });

  bench('sync route, validated object param', async () => {
    await dispatch('/syncObjectParam', bodies.syncObjectParam);
  });

  bench('async route', async () => {
    await dispatch('/asyncRoute', bodies.asyncRoute);
  });

  bench('sync route returning a promise', async () => {
    await dispatch('/promiseArrow', bodies.promiseArrow);
  });

  bench('route behind three middleFns', async () => {
    await dispatch('/chained', bodies.chained);
  });

  bench('large payload (200 items)', async () => {
    await dispatch('/largePayload', bodies.largePayload);
  });

  bench('route returning a FatalError', async () => {
    await dispatch('/fatalRoute', bodies.fatalRoute);
  });
});
