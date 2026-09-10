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
import {decodeQueryBody} from '../lib/queryBody.ts';
import {registerBatches} from '../batches.ts';
import {Routes} from '../types/general.ts';
import {FatalError, RpcError, MION_BATCH_PATH, toBase64Url} from '@mionjs/core';

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
  // one long string: cheap to validate, so the query-body case below measures the query walk and
  // the base64 decode rather than the cost of validating a big object
  echoText: mion.route((_ctx, text: string): string => text),
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
registerBatches({benchPair: {routes: ['syncNoParams', 'syncObjectParam']}});

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

// The query-string cases below. `data` is what a GET query route carries, sized like a real one;
// the batch id is what the router reads out of the query on every batch request.
const queryBodyPayload = toBase64Url(JSON.stringify({echoText: ['x'.repeat(2800)]}));
const queries = {
  queryBody: `data=${queryBodyPayload}`,
  batch: 'id=benchPair',
};
const batchBody = JSON.stringify({syncNoParams: [], syncObjectParam: [item]});

/** One request, exactly as an adapter would issue it. Response headers are fresh per call because
 *  the serializer writes content-type into them, which is what a real response does too. */
function dispatch(path: string, body: string, urlQuery?: string) {
  return dispatchRoute(path, body, reqHeaders, headersFromRecord({}), rawRequest, rawResponse, undefined, urlQuery);
}

/** A GET query route, the way an adapter serves one: the body rides in `?data=` and the adapter
 *  decodes it before dispatch, so the query string is walked twice per request. */
function dispatchQueryBody(path: string, urlQuery: string) {
  const queryBody = decodeQueryBody(urlQuery, undefined);
  return dispatchRoute(
    path,
    queryBody!.rawBody,
    reqHeaders,
    headersFromRecord({}),
    rawRequest,
    rawResponse,
    queryBody!.bodyType,
    urlQuery
  );
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

  // ####### query string #######
  // Nothing else here sends one, so a change to how the query is read would otherwise be invisible.
  bench('no query string (the common case)', async () => {
    await dispatch('/syncObjectParam', bodies.syncObjectParam);
  });

  bench('query body, ~4KB ?data= payload', async () => {
    await dispatchQueryBody('/echoText', queries.queryBody);
  });

  bench('batch, ?id=', async () => {
    await dispatch(MION_BATCH_PATH, batchBody, queries.batch);
  });

  bench('route returning a FatalError', async () => {
    await dispatch('/fatalRoute', bodies.fatalRoute);
  });
});
