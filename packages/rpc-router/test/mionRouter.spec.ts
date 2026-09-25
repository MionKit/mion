/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, expectTypeOf, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getRouterOptions} from '../src/router.ts';
import {dispatchRoute} from '../src/dispatch.ts';
import {headersFromRecord} from '../src/lib/headers.ts';
import {HandlerType, HeadersSubset} from '@mionjs/core';
import type {CallContext} from '../src/types/context.ts';
import type {Routes} from '../src/types/general.ts';
import type {MionRouter, RouterCallContext, RouteHelper} from '../src/types/mionRouter.ts';
import type {PublicApi, RemoteApi} from '../src/types/publicMethods.ts';

type SharedData = {user: string | null; visits: number};
const getSharedData = (): SharedData => ({user: null, visits: 0});

// The module-level factory: one per app, the shape every consumer file has.
const mion = createMionRouter({basePath: 'api', contextDataFactory: getSharedData});
// Plain closures: destructuring keeps the typed context and the build-time injection.
const {route: destructuredRoute, middleware: destructuredMiddleware} = mion;

const routes = {
  auth: mion.headersFn(
    (ctx, h: HeadersSubset<'Authorization'>): HeadersSubset<'x-user-id'> => new HeadersSubset({'x-user-id': 'user-1234'})
  ),
  timestamp: mion.middleware((ctx, time: number): string => `time: ${time}`),
  nothing: mion.rawMiddleware((ctx, req: unknown, resp: unknown): void => undefined),
  print: mion.route((ctx, name: string): string => `name: ${name}`),
  visits: destructuredRoute((ctx): number => ctx.shared.visits),
  greet: destructuredMiddleware((ctx, greeting: string): string => `${greeting} ${ctx.shared.user ?? 'anonymous'}`),
} satisfies Routes;

// The build-time injected payload: compiled fn tuples per side + the two type id handles.
const expectedRtFns = {
  paramsFns: expect.any(Array),
  returnFns: expect.any(Array),
  paramsId: expect.anything(),
  returnId: expect.anything(),
  // the build-time answer to "does this handler return a promise" (see HandlerIsAsync)
  isAsyncId: expect.anything(),
  // id of the [params, return] pair, compared by route sync
  syncId: expect.anything(),
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

  it('injects through mion.middleware and mion.headersFn', () => {
    expect(routes.timestamp).toEqual({type: HandlerType.middleware, handler: expect.any(Function), rtFns: expectedRtFns});
    expect(routes.auth).toEqual({
      type: HandlerType.headersMiddleware,
      handler: expect.any(Function),
      rtFns: {...expectedRtFns, headersFns: expect.any(Array), headersId: expect.anything()},
    });
  });

  it('a rawMiddleware carries nothing compiled', () => {
    expect(routes.nothing).toEqual({type: HandlerType.rawMiddleware, handler: expect.any(Function)});
  });

  it('injects through destructured helpers too', () => {
    expect(routes.visits).toEqual({type: HandlerType.route, handler: expect.any(Function), rtFns: expectedRtFns});
    expect(routes.greet).toEqual({type: HandlerType.middleware, handler: expect.any(Function), rtFns: expectedRtFns});
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

  // The only assertions that catch `ctx.shared` widening to `any`; every runtime test would keep passing.
  // They bite under `tsc -p tsconfig.json` (the package's typecheck:test), not vitest: the handlers never run.

  it('types the handler context from contextDataFactory in middleware', () => {
    mion.middleware((ctx, greeting: string): string => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
      return greeting;
    });
  });

  it('types the handler context from contextDataFactory in headersFn', () => {
    mion.headersFn((ctx, {headers}: HeadersSubset<'Authorization'>): string => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
      return headers.Authorization;
    });
  });

  it('types the handler context from contextDataFactory in rawMiddleware', () => {
    mion.rawMiddleware((ctx, req: unknown, resp: unknown): void => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
    });
  });

  it('pinning isMutation leaves the context alone', () => {
    mion.query((ctx, id: number): string => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
      return `${id}`;
    });
    mion.mutation((ctx, name: string): string => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
      return name;
    });
  });

  it('types the handler context through destructured helpers', () => {
    destructuredRoute((ctx): number => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
      return ctx.shared.visits;
    });
    destructuredMiddleware((ctx, greeting: string): string => {
      expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
      // @ts-expect-error not a field of the shared data
      void ctx.shared.nope;
      return greeting;
    });
  });

  // `routes` is the object this file registers with `mion.initRoutes` below, so this reads the
  // context off a definition that went through registration.
  it('keeps the typed context on a registered definition', () => {
    expectTypeOf<Parameters<(typeof routes)['visits']['handler']>[0]['shared']>().toEqualTypeOf<SharedData>();
    expectTypeOf<Parameters<(typeof routes)['greet']['handler']>[0]['shared']>().toEqualTypeOf<SharedData>();
    expectTypeOf<Parameters<(typeof routes)['auth']['handler']>[0]['shared']>().toEqualTypeOf<SharedData>();
    expectTypeOf<Parameters<(typeof routes)['nothing']['handler']>[0]['shared']>().toEqualTypeOf<SharedData>();
  });
});

describe('PublicApi resolved options', () => {
  it('carries the effective options of each method on the API type, equal to what initRoutes returns', () => {
    resetRouter();
    const compact = createMionRouter({
      parser: 'compact',
      contextDataFactory: getSharedData,
      getPublicRoutesData: true,
    });
    const defs = {
      q: compact.query((ctx, n: number): string => `${n}`, {sanitizeParams: true, description: 'd'}),
      m: compact.mutation((ctx, n: number): string => `${n}`, {
        parser: {return: 'mutate'},
        maxBodySize: 4096,
      }),
      r: compact.route((ctx): number => 1),
      mf: compact.middleware((ctx, s: string): string => s, {alwaysRun: true, validateReturn: true}),
    } satisfies Routes;
    type Api = PublicApi<typeof defs>;

    expectTypeOf<Api['q']['options']>().toEqualTypeOf<{
      alwaysRun: false;
      validateParams: true;
      validateReturn: false;
      description: 'd';
      parser: {params: 'compact'; return: 'compact'};
      isMutation: false;
      sanitizeParams: true;
      maxBodySize: undefined;
    }>();
    // a limit the route declares rides the type; the number the router settles for a route that
    // declares none exists only at registration, so the type says undefined there
    expectTypeOf<Api['m']['options']['maxBodySize']>().toEqualTypeOf<4096>();
    expectTypeOf<Api['r']['options']['maxBodySize']>().toEqualTypeOf<undefined>();
    expectTypeOf<Api['m']['options']['parser']>().toEqualTypeOf<{params: 'compact'; return: 'mutate'}>();
    expectTypeOf<Api['m']['options']['isMutation']>().toEqualTypeOf<true>();
    expectTypeOf<Api['r']['options']['isMutation']>().toEqualTypeOf<undefined>();
    expectTypeOf<Api['r']['options']['sanitizeParams']>().toEqualTypeOf<undefined>();
    expectTypeOf<Api['mf']['options']>().toEqualTypeOf<{
      alwaysRun: true;
      validateParams: true;
      validateReturn: true;
      description: undefined;
      parser: {params: 'compact'; return: 'compact'};
      sanitizeParams: undefined;
      maxBodySize: undefined;
    }>();
    // the definition keeps what the author wrote (plus the pinned isMutation); the router options ride by type only
    expectTypeOf<NonNullable<typeof defs.q.options>>().toEqualTypeOf<
      {readonly sanitizeParams: true; readonly description: 'd'} & {isMutation: false}
    >();
    expect(defs.q).not.toHaveProperty('routerOptions');

    // runtime agrees with the type, field by field. The one field the type leaves undefined and the
    // runtime fills is a route's settled request limit (its types times the router factor, else
    // the platform's number), which only exists at registration.
    const api = compact.initRoutes(defs);
    const {maxBodySize: settledLimit, ...qOptions} = api.q.options;
    expect(typeof settledLimit).toBe('number');
    expect(qOptions).toEqual({
      alwaysRun: false,
      validateParams: true,
      validateReturn: false,
      description: 'd',
      parser: {params: 'compact', return: 'compact'},
      isMutation: false,
      sanitizeParams: true,
    });
    expect(api.m.options).toEqual({
      alwaysRun: false,
      validateParams: true,
      validateReturn: false,
      parser: {params: 'compact', return: 'mutate'},
      isMutation: true,
      maxBodySize: 4096,
    });
    expect(api.mf.options).toEqual({
      alwaysRun: true,
      validateParams: true,
      validateReturn: true,
      parser: {params: 'compact', return: 'compact'},
    });
    // the API type also names the exact types the server compiled each method from
    expectTypeOf<NonNullable<Api['q']['types']>>().toEqualTypeOf<{
      params: [n: number];
      return: string;
      headers: never;
      isAsync: false;
      // `compact` writes other bytes than the JSON strategies
      sync: [[n: number], string, 'compact', 'compact'];
    }>();
    expectTypeOf<NonNullable<Api['mf']['types']>['params']>().toEqualTypeOf<[s: string]>();
    // the API type stays a RemoteApi, so initClient<Api>() keeps compiling
    expectTypeOf<Api>().toMatchTypeOf<RemoteApi>();
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
