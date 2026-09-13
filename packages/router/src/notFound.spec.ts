/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A request can arrive already failed: an unknown path, an unknown batch id, or a body the platform
// adapter refused after the route resolved. All three answer the same way, and it is the dispatcher's
// own rule that does it: the error is recorded BEFORE the first global middleFn, so only the members
// that declare `alwaysRun` run. The body is never read by the adapter and never parsed by the router.
// Route-level middleFns belong to registered routes and never ran on a 404.

import {describe, it, expect, beforeEach} from 'vitest';
import {
  createMionRouter,
  resetRouter,
  addStartMiddleFns,
  addEndMiddleFns,
  getRouteExecutionChain,
  getNotFoundExecutionChain,
  getRouterOptions,
} from './router.ts';
import {dispatchRoute, dispatchPlatformError} from './dispatch.ts';
import {createCallContext, resolveRequest} from './callContext.ts';
import {headersFromRecord} from './lib/headers.ts';
import {requestPayloadTooLarge} from './lib/bodyReader.ts';
import {registerBatches} from './batches.ts';
import type {CallContext} from './types/context.ts';
import {MION_BATCH_PATH, MION_ROUTES, StatusCodes, RpcError, getRoutePath} from '@mionjs/core';

const mion = createMionRouter();

function dispatch(path: string, body: string, urlQuery?: string) {
  const headers = headersFromRecord({});
  return dispatchRoute(path, body, headers, headersFromRecord({}), {headers, body}, {}, undefined, urlQuery);
}

/** What an adapter does when it stops a body at the limit: the route resolved, so the chain runs. */
function dispatchRefused(path: string) {
  const rawRequest = {headers: headersFromRecord({})};
  const resolved = resolveRequest(path, undefined, rawRequest);
  return dispatchPlatformError(resolved, requestPayloadTooLarge(), rawRequest.headers, headersFromRecord({}), rawRequest);
}

const thrown = (response: Awaited<ReturnType<typeof dispatch>>) =>
  response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;

describe('a request that arrived failed runs only the alwaysRun middleFns', () => {
  const hello = mion.route((): string => 'hello');
  let seen: string[];
  const logStart = mion.rawMiddleFn((ctx: CallContext) => {
    seen.push(`start:${ctx.path}`);
  });
  const alwaysStart = mion.rawMiddleFn(
    (ctx: CallContext) => {
      seen.push(`always-start:${ctx.path}`);
    },
    {alwaysRun: true}
  );
  const logEnd = mion.rawMiddleFn((ctx: CallContext) => {
    seen.push(`end:${ctx.response.statusCode}`);
  });
  const alwaysEnd = mion.rawMiddleFn(
    (ctx: CallContext) => {
      seen.push(`always-end:${ctx.response.statusCode}`);
    },
    {alwaysRun: true}
  );
  const routeLevel = mion.middleFn((): void => {
    seen.push('route-level');
  });

  /** the four globals in one go: two that must be skipped, two that must run */
  function withGlobals() {
    addStartMiddleFns({logStart, alwaysStart});
    addEndMiddleFns({logEnd, alwaysEnd});
  }

  beforeEach(() => {
    resetRouter();
    seen = [];
  });

  describe('an unknown path', () => {
    it('answers route-not-found without parsing a body that is not JSON', async () => {
      mion.initRoutes({hello});
      const response = await dispatch('/nope', '{not json');
      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
      expect(thrown(response)[MION_ROUTES.notFound]?.type).toBe('route-not-found');
      expect(thrown(response)['mionDeserializeRequest']).toBeUndefined();
      expect(response.headers.get('x-rpc-error')).toBe('route-not-found');
    });

    it('a not-found context reports readsBody false and a chain with no route', () => {
      mion.initRoutes({hello});
      const context = createCallContext('/nope', undefined, {}, headersFromRecord({}), headersFromRecord({}));
      expect(context.readsBody).toBe(false);
      expect(context.executionChain.routeIndex).toBe(-1);
      expect(context.executionChain.methods[0].id).toBe(MION_ROUTES.notFound);
      const known = createCallContext(
        getRoutePath(['hello'], getRouterOptions()),
        undefined,
        {},
        headersFromRecord({}),
        headersFromRecord({})
      );
      expect(known.readsBody).toBe(true);
    });

    it('runs only the alwaysRun globals, never a plain global or a route-level one', async () => {
      withGlobals();
      mion.initRoutes({routeLevel, hello});
      await dispatch('/nope', '{not json');
      expect(seen).toEqual(['always-start:/nope', 'always-end:404']);
      seen = [];
      await dispatch('/hello', '{"hello":[]}');
      expect(seen).toEqual(['start:/hello', 'always-start:/hello', 'route-level', 'end:200', 'always-end:200']);
    });
  });

  describe('an unknown batch id', () => {
    it('answers batch-unknown-id through the chain without parsing the body', async () => {
      mion.initRoutes({hello});
      registerBatches({known: {routes: ['hello']}});
      const response = await dispatch(MION_BATCH_PATH, '{not json', 'id=unknown');
      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
      expect(thrown(response)[MION_ROUTES.batchNotFound]).toMatchObject({type: 'batch-unknown-id', statusCode: 404});
      expect(thrown(response)['mionDeserializeRequest']).toBeUndefined();
      expect(response.headers.get('x-rpc-error')).toBe('batch-unknown-id');
    });

    it('a not-found batch context reports readsBody false and no batch id', () => {
      mion.initRoutes({hello});
      const context = createCallContext(MION_BATCH_PATH, 'id=unknown', {}, headersFromRecord({}), headersFromRecord({}));
      expect(context.readsBody).toBe(false);
      expect(context.batchId).toBeUndefined();
      expect(context.executionChain.routeIndex).toBe(-1);
      expect(context.executionChain.methods[0].id).toBe(MION_ROUTES.batchNotFound);
    });

    it('runs only the alwaysRun globals', async () => {
      withGlobals();
      mion.initRoutes({hello});
      await dispatch(MION_BATCH_PATH, '{}', 'id=unknown');
      expect(seen).toEqual([`always-start:${MION_BATCH_PATH}`, 'always-end:404']);
    });
  });

  describe('a body the adapter refused', () => {
    it('answers the 413 through the chain, running only the alwaysRun globals', async () => {
      withGlobals();
      mion.initRoutes({routeLevel, hello});
      const response = await dispatchRefused(getRoutePath(['hello'], getRouterOptions()));
      expect(response.statusCode).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
      expect(thrown(response)[MION_ROUTES.platformError]?.type).toBe('request-payload-too-large');
      expect(response.headers.get('x-rpc-error')).toBe('request-payload-too-large');
      expect(seen).toEqual(['always-start:/hello', 'always-end:413']);
    });

    it('never parses a body handed over anyway, and the route never runs', async () => {
      mion.initRoutes({hello});
      const response = await dispatchRefused(getRoutePath(['hello'], getRouterOptions()));
      expect(thrown(response)['mionDeserializeRequest']).toBeUndefined();
      expect(response.body['hello']).toBeUndefined();
    });
  });

  it('the two not-found chains carry no route and are not reachable as paths', () => {
    mion.initRoutes({hello});
    const opts = getRouterOptions();
    for (const id of [MION_ROUTES.notFound, MION_ROUTES.batchNotFound]) {
      const chain = getNotFoundExecutionChain(id)!;
      expect(chain.readsBody).toBe(false);
      expect(chain.routeIndex).toBe(-1);
      expect(chain.methods[0].id).toBe(id);
      // they stopped being routes, so nothing answers on their old path
      expect(getRouteExecutionChain(getRoutePath([id], opts))).toBeUndefined();
    }
    expect(getRouteExecutionChain(getRoutePath(['hello'], opts))?.readsBody).toBe(true);
  });
});
