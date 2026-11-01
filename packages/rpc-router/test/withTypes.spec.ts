/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, expectTypeOf, beforeEach} from 'vitest';
import {
  createMionRouter,
  resetRouter,
  getRouterOptions,
  getAnyExecutable,
  getRouteExecutable,
  getMiddlewareExecutable,
} from '../src/router.ts';
import {HeadersSubset} from '@mionjs/core';
import type {CallContext} from '../src/types/context.ts';
import type {MionSecurityHandlerOptions, Routes} from '../src/types/general.ts';
import type {PublicApi, PublicHandler} from '../src/types/publicMethods.ts';

type Shared = {user: string; visits: number};
type AuditHandler = {audit?: 'log' | 'skip'};
const createAppRouter = createMionRouter.withTypes<{router: {audit?: boolean}; handler: MionSecurityHandlerOptions}>();

// Type assertions sit in never-called functions (no second router at runtime): only `tsc` typecheck:test checks them.

describe('ctx.shared comes from the written return type of sharedDataFactory', () => {
  // mionRouter.spec.ts covers the plain router
  it('types ctx.shared in every helper of a withTypes router', () => {
    function compileOnly(): void {
      const typed = createAppRouter({sharedDataFactory: (): Shared => ({user: '', visits: 0})});
      typed.route((ctx) => expectTypeOf(ctx.shared).toEqualTypeOf<Shared>(), {cors: false});
      typed.query((ctx) => expectTypeOf(ctx.shared).toEqualTypeOf<Shared>());
      typed.mutation((ctx) => expectTypeOf(ctx.shared).toEqualTypeOf<Shared>());
      typed.middleware((ctx) => expectTypeOf(ctx.shared).toEqualTypeOf<Shared>());
      typed.headersMiddleware((ctx, headers: HeadersSubset<'authorization'>): void => {
        expectTypeOf(ctx.shared).toEqualTypeOf<Shared>();
      });
      typed.rawMiddleware((ctx, req: unknown, resp: unknown): void => {
        expectTypeOf(ctx.shared).toEqualTypeOf<Shared>();
      });
      typed.route((ctx): number => {
        // @ts-expect-error not a field of the shared type
        void ctx.shared.nope;
        return ctx.shared.visits;
      });
    }
    void compileOnly;
  });

  it('types ctx.shared as never without a factory', () => {
    function compileOnly(): void {
      const plain = createMionRouter();
      plain.route((ctx): void => {
        expectTypeOf(ctx.shared).toEqualTypeOf<never>();
        // @ts-expect-error nothing to read on a router that shares no data
        void ctx.shared.user;
      });
      createAppRouter().middleware((ctx): void => {
        expectTypeOf(ctx.shared).toEqualTypeOf<never>();
      });
      createMionRouter({basePath: 'x'}).rawMiddleware((ctx, req: unknown, resp: unknown): void => {
        expectTypeOf(ctx.shared).toEqualTypeOf<never>();
      });
    }
    void compileOnly;
  });

  it('still accepts a handler annotated with a plain CallContext', () => {
    function compileOnly(): void {
      const handler = (ctx: CallContext, name: string): string => `${name}${ctx.path}`;
      createAppRouter({sharedDataFactory: (): Shared => ({user: '', visits: 0})}).middleware(handler);
    }
    void compileOnly;
  });

  it('keeps the client signature of a handler whose ctx.shared is never', () => {
    function compileOnly(): void {
      const def = createMionRouter().route((ctx, id: number): string => `${id}`);
      expectTypeOf<PublicHandler<(typeof def)['handler']>>().toEqualTypeOf<(id: number) => Promise<string>>();
      void def;
    }
    void compileOnly;
  });
});

describe('createMionRouter.withTypes: router and handler keys', () => {
  it('types the router keys, requires a required one, and refuses an unknown one even next to a valid key', () => {
    function compileOnly(): void {
      createAppRouter({audit: true});
      // @ts-expect-error wrong value type for a router key
      createAppRouter({audit: 'yes'});
      // @ts-expect-error unknown router key next to a valid one
      createAppRouter({basePath: 'x', fooBar: 1});
      const strict = createMionRouter.withTypes<{router: {audit: boolean}}>();
      strict({audit: false});
      // @ts-expect-error a required router key is missing
      strict({basePath: 'x'});
      // @ts-expect-error a router key the plain factory never declared
      createMionRouter({audit: true});
      // @ts-expect-error unknown key next to a valid one on the plain factory
      createMionRouter({basePath: 'x', fooBar: 1});
    }
    void compileOnly;
  });

  it('takes the handler keys on every handler kind', () => {
    function compileOnly(): void {
      const app = createAppRouter();
      app.route((): string => '', {cors: false});
      app.query((): string => '', {cors: false, description: 'q'});
      app.mutation((): string => '', {cors: false});
      app.middleware((): void => undefined, {cors: false, alwaysRun: true});
      app.headersMiddleware((ctx, headers: HeadersSubset<'x-a'>): void => undefined, {cors: false});
      app.rawMiddleware((): void => undefined, {cors: false});
      // the parser option works next to the added keys
      app.route((): string => '', {cors: false, parser: 'compact'});
    }
    void compileOnly;
  });

  it('refuses an unknown handler key next to a valid one, on every handler kind', () => {
    function compileOnly(): void {
      const app = createAppRouter();
      // @ts-expect-error unknown key on a route
      app.route((): string => '', {description: 'd', fooBar: 1});
      // @ts-expect-error unknown key on a query
      app.query((): string => '', {cors: false, fooBar: 1});
      // @ts-expect-error unknown key on a mutation
      app.mutation((): string => '', {description: 'd', fooBar: 1});
      // @ts-expect-error unknown key on a middleware
      app.middleware((): void => undefined, {alwaysRun: true, fooBar: 1});
      // @ts-expect-error unknown key on a headers middleware
      app.headersMiddleware((ctx, headers: HeadersSubset<'x-a'>): void => undefined, {description: 'd', fooBar: 1});
      // @ts-expect-error unknown key on a raw middleware
      app.rawMiddleware((): void => undefined, {description: 'd', fooBar: 1});
      // @ts-expect-error wrong value type for a handler key
      app.route((): string => '', {cors: 'no'});
      // @ts-expect-error `true` is not a value mionSecurity reads
      app.route((): string => '', {cors: true});
      const plain = createMionRouter();
      // @ts-expect-error the plain router declared no handler keys
      plain.route((): string => '', {cors: false});
      // @ts-expect-error unknown key next to a valid one on a plain router
      plain.route((): string => '', {description: 'd', fooBar: 1});
      // @ts-expect-error unknown key alone on a plain middleware
      plain.middleware((): void => undefined, {fooBar: 1});
    }
    void compileOnly;
  });

  it('refuses a misspelled part, alone or next to a valid one', () => {
    function compileOnly(): void {
      // @ts-expect-error `handlr` is not a part: it would declare nothing
      createMionRouter.withTypes<{handlr: MionSecurityHandlerOptions}>();
      // @ts-expect-error `routr` next to a valid part
      createMionRouter.withTypes<{handler: MionSecurityHandlerOptions; routr: {audit?: boolean}}>();
    }
    void compileOnly;
  });

  it('refuses an added key whose value is no JSON data, since it goes to the client', () => {
    function compileOnly(): void {
      // @ts-expect-error a function cannot reach the client in the metadata
      createMionRouter.withTypes<{handler: {onDeny?: () => void}}>();
      // @ts-expect-error neither can a RegExp
      createMionRouter.withTypes<{handler: {match?: RegExp}}>();
      // @ts-expect-error nor a bigint
      createMionRouter.withTypes<{handler: {limit?: bigint}}>();
      // @ts-expect-error nor a Date, even optional
      createMionRouter.withTypes<{handler: {at?: Date}}>();
      // @ts-expect-error nor a Map
      createMionRouter.withTypes<{handler: {byId?: Map<string, number>}}>();
      createMionRouter.withTypes<{handler: {audit?: {level: 'high' | 'low'}; tags?: string[]}}>();
    }
    void compileOnly;
  });

  it('carries the router-wide parser to a route on a withTypes router', () => {
    function compileOnly(): void {
      const app = createAppRouter({parser: 'compact'});
      const defs = {route: app.route((): string => '', {cors: false})};
      expectTypeOf<PublicApi<typeof defs>['route']['options']['parser']>().toEqualTypeOf<{
        params: 'compact';
        return: 'compact';
      }>();
      void defs;
    }
    void compileOnly;
  });

  it('combines the keys of several middlewares', () => {
    function compileOnly(): void {
      const app = createMionRouter.withTypes<{handler: MionSecurityHandlerOptions & AuditHandler}>()();
      app.route((): string => '', {cors: false, audit: 'log'});
      // @ts-expect-error not one of the declared values
      app.route((): string => '', {audit: 'all'});
    }
    void compileOnly;
  });
});

// ####### Runtime: one router for the rest of the file #######

const mion = createAppRouter({
  sharedDataFactory: (): Shared => ({user: 'anonymous', visits: 0}),
  audit: true,
  getPublicRoutesData: true,
});
const routes = {
  auth: mion.headersMiddleware((ctx, headers: HeadersSubset<'authorization'>): void => undefined, {cors: false}),
  log: mion.middleware((ctx, line: string): string => line, {cors: false, description: 'log'}),
  raw: mion.rawMiddleware((ctx, req: unknown, resp: unknown): void => undefined, {cors: false}),
  hidden: mion.query((ctx): string => ctx.shared.user, {cors: false}),
  open: mion.route((ctx): number => ctx.shared.visits),
} satisfies Routes;

describe('createMionRouter.withTypes: what the client sees', () => {
  type Api = PublicApi<typeof routes>;

  it('carries each added key on the resolved options, as the literal the method wrote', () => {
    expectTypeOf<Api['hidden']['options']>().toEqualTypeOf<
      {
        alwaysRun: false;
        description: undefined;
        parser: {params: 'clone'; return: 'clone'};
        isMutation: false;
        sanitizeParams: undefined;
        maxBodySize: undefined;
      } & {cors: false}
    >();
    expectTypeOf<Api['log']['options']['cors']>().toEqualTypeOf<false>();
    expectTypeOf<Api['auth']['options']['cors']>().toEqualTypeOf<false>();
  });

  it('adds nothing to a method that wrote no added key', () => {
    expectTypeOf<Api['open']['options']>().toEqualTypeOf<{
      alwaysRun: false;
      description: undefined;
      parser: {params: 'clone'; return: 'clone'};
      isMutation: undefined;
      sanitizeParams: undefined;
      maxBodySize: undefined;
    }>();
  });
});

describe('createMionRouter.withTypes runtime', () => {
  beforeEach(() => resetRouter());

  it('is createMionRouter: one router per app until reset', () => {
    expect(() => createAppRouter()).not.toThrow();
    expect(() => createMionRouter()).toThrow('createMionRouter has already been called');
    resetRouter();
    expect(() => createMionRouter.withTypes()()).not.toThrow();
  });

  it('copies the added keys onto every registered method, and keeps mion own keys', () => {
    const api = mion.initRoutes(routes);
    expect(getRouterOptions()).toEqual(expect.objectContaining({audit: true}));
    expect(getMiddlewareExecutable('auth')?.options).toEqual(expect.objectContaining({cors: false, alwaysRun: false}));
    expect(getMiddlewareExecutable('log')?.options).toEqual(expect.objectContaining({cors: false, description: 'log'}));
    expect(getAnyExecutable('raw')?.options).toEqual({cors: false, alwaysRun: false, description: undefined});
    expect(getRouteExecutable('hidden')?.options).toEqual(
      expect.objectContaining({cors: false, isMutation: false, alwaysRun: false, parser: {params: 'clone', return: 'clone'}})
    );
    expect(getRouteExecutable('open')?.options).not.toHaveProperty('cors');
    // what initRoutes returns, the runtime twin of the API type
    expect(api.hidden.options.cors).toBe(false);
    expect(api.log.options.cors).toBe(false);
  });

  it('never lets an added key override an option mion resolves', () => {
    const loose = createMionRouter.withTypes<{handler: Record<string, unknown>}>()();
    // a cast slips mion's own key in as an added one: the resolved value still wins
    const def = loose.route((): string => 'x', {alwaysRun: true} as any);
    const check = loose.middleware((): void => undefined, {alwaysRun: 'yes'} as any);
    const raw = loose.rawMiddleware((): void => undefined, {alwaysRun: 'yes'} as any);
    loose.initRoutes({check, raw, def});
    expect(getRouteExecutable('def')?.options.alwaysRun).toBe(false);
    expect(getMiddlewareExecutable('check')?.options.alwaysRun).toBe(true);
    expect(getAnyExecutable('raw')?.options.alwaysRun).toBe(true);
  });
});
