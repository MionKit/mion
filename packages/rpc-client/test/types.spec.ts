/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, expectTypeOf} from 'vitest';
import {initClient} from '../src/client.ts';
import {batch} from '../src/batch.ts';
import type {
  ApiOf,
  CallContext,
  ClientMiddleware,
  ClientMiddlewareOf,
  ClientMiddlewares,
  ClientRoutes,
  MiddlewareContext,
  InitClientOptions,
  RouteSubRequest,
} from '../src/types.ts';
import type {TestServerApi, csrf} from '@mionjs/test-server';
import type {InjectApiMetadata, InjectBuildVersion, InjectRouterOptions} from '@mionjs/run-types';
import {HeadersSubset} from '@mionjs/core';
import type {ROUTER_OPTIONS} from '@mionjs/core';

// The route id rides the subrequest TYPE (the key path joined with `/`) next to the API, so it
// survives destructuring and aliasing, and a build reads which route of which API a dispatch point
// calls. The proxy still mints the runtime id from the pointer: both must agree.

const {routes, middlewares} = initClient<TestServerApi>({baseURL: 'http://localhost:0'});

describe('subrequest types carry the route id and the API', () => {
  it('names a top-level route and a nested route by their key path', () => {
    const hello = routes.sayHello({name: 'a', surname: 'b'});
    expectTypeOf(hello).toEqualTypeOf<RouteSubRequest<TestServerApi['sayHello']['handler'], 'sayHello', TestServerApi>>();
    expectTypeOf(hello.id).toEqualTypeOf<'sayHello'>();
    expect(hello.id).toBe('sayHello');

    const sum = routes.utils.sumTwo(1);
    expectTypeOf(sum.id).toEqualTypeOf<'utils/sumTwo'>();
    expect(sum.id).toBe('utils/sumTwo');
  });

  it('types a middleware onRequest callback with the handler params', () => {
    expectTypeOf(middlewares.auth).toEqualTypeOf<ClientMiddleware<TestServerApi['auth']['handler']>>();
    middlewares.auth.onRequest((auth, context) => {
      expectTypeOf(auth).parameters.toEqualTypeOf<Parameters<TestServerApi['auth']['handler']>>();
      expectTypeOf(context).toEqualTypeOf<CallContext>();
      auth(new HeadersSubset({Authorization: 'x'}));
    });
    middlewares.auth.offRequest();
    // never run: the type check is the point
    // @ts-expect-error a middleware is hooks only, it can not be called
    const callMiddleware = () => middlewares.auth(new HeadersSubset({Authorization: 'x'}));
    expect(typeof callMiddleware).toBe('function');
  });

  it('keeps the id through destructuring and aliasing', () => {
    const {utils} = routes;
    const {sumTwo} = utils;
    const aliased = sumTwo;
    expectTypeOf(aliased(1).id).toEqualTypeOf<'utils/sumTwo'>();
    const stored = routes.sayHello({name: 'a', surname: 'b'});
    const again = stored;
    expectTypeOf(again.id).toEqualTypeOf<'sayHello'>();
  });

  it('gives every dispatch point a marker typed with the API and the id', () => {
    const hello = routes.sayHello({name: 'a', surname: 'b'});
    expectTypeOf<typeof hello.call>().parameter(1).toEqualTypeOf<InjectApiMetadata<TestServerApi, 'sayHello'> | undefined>();
    expectTypeOf<typeof hello.typeErrors>()
      .parameter(0)
      .toEqualTypeOf<InjectApiMetadata<TestServerApi, 'sayHello'> | undefined>();
    // a batch names every route it runs, as a union of ids
    const built = batch([hello, routes.utils.sumTwo(1)]);
    expect(typeof built.call).toBe('function');
    expectTypeOf<typeof built.call>()
      .parameter(1)
      .toEqualTypeOf<InjectApiMetadata<TestServerApi, 'sayHello' | 'utils/sumTwo'> | undefined>();
    expectTypeOf<ApiOf<[typeof hello]>>().toEqualTypeOf<TestServerApi>();
    // The lane is a module the build writes; the version and router options slots are the build's too
    expectTypeOf(initClient<TestServerApi>).parameters.toEqualTypeOf<
      [InitClientOptions, (InjectBuildVersion<TestServerApi> | undefined)?, (InjectRouterOptions<TestServerApi> | undefined)?]
    >();
  });

  it('the router options key of the API type never reaches the routes or middlewares', () => {
    type WithOptions = TestServerApi & {readonly [ROUTER_OPTIONS]?: {syncRoutes: true}};
    expectTypeOf<keyof ClientRoutes<WithOptions>>().toEqualTypeOf<keyof ClientRoutes<TestServerApi>>();
    expectTypeOf<keyof ClientMiddlewares<WithOptions>>().toEqualTypeOf<keyof ClientMiddlewares<TestServerApi>>();
  });

  it('a helper that erases the route name widens the id to string', () => {
    const run = <PH extends (...args: any[]) => Promise<any>>(sub: RouteSubRequest<PH>) => sub;
    expectTypeOf(run(routes.sayHello({name: 'a', surname: 'b'})).id).toEqualTypeOf<string>();
  });

  it('existing wide uses still compile', () => {
    const anyRoute: RouteSubRequest<any> = routes.sayHello({name: 'a', surname: 'b'});
    const anyMiddleware: ClientMiddleware<any> = middlewares.auth;
    expectTypeOf(anyRoute.id).toEqualTypeOf<string>();
    expectTypeOf(anyMiddleware.onRequest).toBeFunction();
  });
});

describe('isolated reusable middleware types', () => {
  it('ClientMiddlewareOf types a middleware from its server handler, wherever it is placed', () => {
    expectTypeOf(middlewares.notes.csrf).toEqualTypeOf<ClientMiddlewareOf<typeof csrf>>();
    expectTypeOf(middlewares.notes.admin.csrf).toEqualTypeOf<ClientMiddlewareOf<typeof csrf>>();
  });

  it('checks the params the onRequest call sends', () => {
    const installer = (middleware: ClientMiddlewareOf<typeof csrf>) => {
      middleware.onRequest((call) => call('token'));
      // @ts-expect-error the csrf token is a string
      middleware.onRequest((call) => call(1));
      // @ts-expect-error the csrf token is required
      middleware.onRequest((call) => call());
    };
    expect(installer).toBeTypeOf('function');
  });

  it('gives onError and onResponse hooks the call with retry()', () => {
    const installer = (middleware: ClientMiddlewareOf<typeof csrf>) =>
      middleware.onError('csrf-expired', (error, context) => {
        expectTypeOf(error.type).toEqualTypeOf<'csrf-expired'>();
        expectTypeOf(context).toEqualTypeOf<MiddlewareContext>();
        expectTypeOf(context.retry).returns.toEqualTypeOf<boolean>();
      });
    expect(installer).toBeTypeOf('function');
    middlewares.session.onResponse((_session, context) => expectTypeOf(context).toMatchTypeOf<CallContext>());
    middlewares.session.offResponse();
  });
});
