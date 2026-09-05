/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, expectTypeOf, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getRouterOptions} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {HandlerType, HeadersSubset} from '@mionjs/core';
import type {CallContext} from './types/context.ts';
import type {Routes} from './types/general.ts';
import type {MionRouter, RouterCallContext, RouteHelper} from './types/mionRouter.ts';

type SharedData = {user: string | null; visits: number};
const getSharedData = (): SharedData => ({user: null, visits: 0});

// The module-level factory: one per app, the shape every consumer file has.
const mion = createMionRouter({basePath: 'api', contextDataFactory: getSharedData});
// Plain closures: destructuring keeps the typed context and the build-time injection.
const {route: destructuredRoute, middleFn: destructuredMiddleFn} = mion;

const routes = {
  auth: mion.headersFn(
    (ctx, h: HeadersSubset<'Authorization'>): HeadersSubset<'x-user-id'> => new HeadersSubset({'x-user-id': 'user-1234'})
  ),
  timestamp: mion.middleFn((ctx, time: number): string => `time: ${time}`),
  nothing: mion.rawMiddleFn((ctx, req: unknown, resp: unknown): void => undefined),
  print: mion.route((ctx, name: string): string => `name: ${name}`),
  visits: destructuredRoute((ctx): number => ctx.shared.visits),
  greet: destructuredMiddleFn((ctx, greeting: string): string => `${greeting} ${ctx.shared.user ?? 'anonymous'}`),
} satisfies Routes;

// The build-time injected payload: compiled fn tuples per side + the two type id handles.
const expectedRtFns = {
  paramsFns: expect.any(Array),
  returnFns: expect.any(Array),
  paramsId: expect.anything(),
  returnId: expect.anything(),
};

describe('createMionRouter helpers', () => {
  it('injects the compiled type functions through mion.route / query / mutation', () => {
    expect(routes.print).toEqual({type: HandlerType.route, handler: expect.any(Function), rtFns: expectedRtFns});
    const q = mion.query((ctx, id: number): string => `id: ${id}`);
    expect(q).toEqual({
      type: HandlerType.route,
      handler: expect.any(Function),
      options: {isMutation: false},
      rtFns: expectedRtFns,
    });
    const m = mion.mutation((ctx, name: string): string => `name: ${name}`);
    expect(m).toEqual({
      type: HandlerType.route,
      handler: expect.any(Function),
      options: {isMutation: true},
      rtFns: expectedRtFns,
    });
  });

  it('injects through mion.middleFn and mion.headersFn', () => {
    expect(routes.timestamp).toEqual({type: HandlerType.middleFn, handler: expect.any(Function), rtFns: expectedRtFns});
    expect(routes.auth).toEqual({
      type: HandlerType.headersMiddleFn,
      handler: expect.any(Function),
      rtFns: {...expectedRtFns, headersFns: expect.any(Array), headersId: expect.anything()},
    });
  });

  it('a rawMiddleFn carries nothing compiled', () => {
    expect(routes.nothing).toEqual({type: HandlerType.rawMiddleFn, handler: expect.any(Function)});
  });

  it('injects through destructured helpers too', () => {
    expect(routes.visits).toEqual({type: HandlerType.route, handler: expect.any(Function), rtFns: expectedRtFns});
    expect(routes.greet).toEqual({type: HandlerType.middleFn, handler: expect.any(Function), rtFns: expectedRtFns});
  });

  it('keeps the options literal, frozen', () => {
    expect(mion.options).toEqual({basePath: 'api', contextDataFactory: getSharedData});
    expect(Object.isFrozen(mion.options)).toBe(true);
    expectTypeOf(mion.options.basePath).toEqualTypeOf<'api'>();
  });
});

describe('createMionRouter types', () => {
  it('types the handler context from contextDataFactory', () => {
    expectTypeOf<RouterCallContext<typeof mion.options>>().toEqualTypeOf<CallContext<SharedData>>();
    expectTypeOf(mion.route).toEqualTypeOf<
      RouteHelper<{readonly basePath: 'api'; readonly contextDataFactory: () => SharedData}>
    >();
    mion.route((ctx, name: string) => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
      return name;
    });
  });

  it('falls back to an untyped context when there is no contextDataFactory', () => {
    type Bare = MionRouter<{basePath: 'x'}>;
    expectTypeOf<RouterCallContext<Bare['options']>>().toEqualTypeOf<CallContext<any>>();
    expectTypeOf<Parameters<Bare['initRoutes']>[0]>().toEqualTypeOf<Routes>();
  });

  it('still accepts a handler annotated with a plain CallContext', () => {
    const handler = (ctx: CallContext, name: string): string => `${name}${ctx.path}`;
    const def = mion.route(handler);
    expectTypeOf(def.handler).toEqualTypeOf(handler);
  });
});

describe('createMionRouter lifecycle', () => {
  beforeEach(() => resetRouter());

  it('refuses a second factory until the router is reset', () => {
    // the module-level factory above already ran once; the beforeEach reset cleared it
    const again = createMionRouter();
    expect(() => createMionRouter()).toThrow('createMionRouter has already been called');
    resetRouter();
    expect(() => createMionRouter()).not.toThrow();
    expect(again.options).toEqual({});
  });

  it('refuses to initialize the routes twice', async () => {
    mion.initRoutes(routes);
    expect(() => mion.initRoutes(routes)).toThrow('Router has already been initialized');
  });

  it('initializes the router with the factory options and dispatches through the declared routes', async () => {
    mion.initRoutes(routes);
    expect(getRouterOptions().basePath).toBe('api');
    expect(getRouterOptions().contextDataFactory).toBe(getSharedData);

    const headers = headersFromRecord({Authorization: 'Bearer 123'});
    const body = JSON.stringify({timestamp: [123], print: ['John'], greet: ['hi']});
    const response = await dispatchRoute('/api/print', body, headers, headersFromRecord({}), {}, {});
    expect(response.body).toEqual({timestamp: 'time: 123', print: 'name: John', greet: 'hi anonymous'});
    expect(response.headers.get('x-user-id')).toEqual('user-1234');

    const visitsBody = JSON.stringify({timestamp: [1], visits: [], greet: ['hey']});
    const visits = await dispatchRoute('/api/visits', visitsBody, headers, headersFromRecord({}), {}, {});
    expect(visits.body).toEqual({timestamp: 'time: 1', visits: 0, greet: 'hey anonymous'});

    const wrong = await dispatchRoute(
      '/api/print',
      JSON.stringify({timestamp: ['hello'], print: [123]}),
      headersFromRecord({Authorization: null as any}),
      headersFromRecord({}),
      {},
      {}
    );
    expect(wrong.body['@thrownErrors']?.auth).toEqual(expect.objectContaining({type: 'validation-error'}));
  });
});
