/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// An unknown path or an unknown batch id resolves to one of mion's own not-found chains. Such a
// chain has no route to feed, so its body is never read by the adapter and never parsed by the
// router, while the GLOBAL start / end middleFns (logging, rate limiting) still see the request.
// Route-level middleFns belong to registered routes and never ran on a 404.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, addStartMiddleFns, addEndMiddleFns, getRouteExecutionChain} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {createCallContext} from './callContext.ts';
import {headersFromRecord} from './lib/headers.ts';
import {registerBatches} from './batches.ts';
import type {CallContext} from './types/context.ts';
import {MION_BATCH_PATH, MION_ROUTES, StatusCodes, RpcError, getRoutePath} from '@mionjs/core';
import {getRouterOptions} from './router.ts';

const mion = createMionRouter();

function dispatch(path: string, body: string, urlQuery?: string) {
  const headers = headersFromRecord({});
  return dispatchRoute(path, body, headers, headersFromRecord({}), {headers, body}, {}, undefined, urlQuery);
}

const thrown = (response: Awaited<ReturnType<typeof dispatch>>) =>
  response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;

describe('not-found chains never read the body', () => {
  const hello = mion.route((): string => 'hello');
  let seen: string[];
  const logStart = mion.rawMiddleFn((ctx: CallContext) => {
    seen.push(`start:${ctx.path}`);
  });
  const logEnd = mion.rawMiddleFn(
    (ctx: CallContext) => {
      seen.push(`end:${ctx.response.statusCode}`);
    },
    {alwaysRun: true}
  );
  const routeLevel = mion.middleFn((): void => {
    seen.push('route-level');
  });

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
    });

    it('a not-found context reports readsBody false and the not-found chain', () => {
      mion.initRoutes({hello});
      const context = createCallContext('/nope', undefined, {}, headersFromRecord({}), headersFromRecord({}));
      expect(context.readsBody).toBe(false);
      expect(context.executionChain.methods[context.executionChain.routeIndex].id).toBe(MION_ROUTES.notFound);
      const known = createCallContext(
        getRoutePath(['hello'], getRouterOptions()),
        undefined,
        {},
        headersFromRecord({}),
        headersFromRecord({})
      );
      expect(known.readsBody).toBe(true);
    });

    it('runs the global start and end middleFns, never a route-level one', async () => {
      addStartMiddleFns({logStart});
      addEndMiddleFns({logEnd});
      mion.initRoutes({routeLevel, hello});
      await dispatch('/nope', '{not json');
      expect(seen).toEqual(['start:/nope', 'end:404']);
      seen = [];
      await dispatch('/hello', '{"hello":[]}');
      expect(seen).toEqual(['start:/hello', 'route-level', 'end:200']);
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
      expect(context.executionChain.methods[context.executionChain.routeIndex].id).toBe(MION_ROUTES.batchNotFound);
    });

    it('runs the global start and end middleFns', async () => {
      addStartMiddleFns({logStart});
      addEndMiddleFns({logEnd});
      mion.initRoutes({hello});
      await dispatch(MION_BATCH_PATH, '{}', 'id=unknown');
      expect(seen).toEqual([`start:${MION_BATCH_PATH}`, 'end:404']);
    });
  });

  it('readsBody is false for exactly the two not-found chains', () => {
    mion.initRoutes({hello});
    const opts = getRouterOptions();
    const flags = Object.values(MION_ROUTES)
      .map((id) => [id, getRouteExecutionChain(getRoutePath([id], opts))?.readsBody] as const)
      .filter(([, flag]) => flag !== undefined);
    expect(Object.fromEntries(flags)).toEqual({
      [MION_ROUTES.thrownErrors]: true,
      [MION_ROUTES.platformError]: true,
      [MION_ROUTES.notFound]: false,
      [MION_ROUTES.batchNotFound]: false,
    });
    expect(getRouteExecutionChain(getRoutePath(['hello'], opts))?.readsBody).toBe(true);
  });
});
