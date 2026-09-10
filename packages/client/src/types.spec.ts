/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, expectTypeOf} from 'vitest';
import {initClient} from './client.ts';
import {batch} from './batch.ts';
import type {ApiOf, MiddlewareSubRequest, RouteSubRequest} from './types.ts';
import type {TestServerApi} from '@mionjs/test-server';
import type {InjectApiMetadata} from '@mionjs/run-types';
import {HeadersSubset} from '@mionjs/core';

// The route id rides the subrequest TYPE (the key path joined with `/`) next to the API, so it
// survives destructuring and aliasing, and a build reads which route of which API a dispatch point
// calls. The proxy still mints the runtime id from the pointer: both must agree.

const {routes, middleFns} = initClient<TestServerApi>({baseURL: 'http://localhost:0'});

describe('subrequest types carry the route id and the API', () => {
  it('names a top-level route, a nested route and a middleFn by their key path', () => {
    const hello = routes.sayHello({name: 'a', surname: 'b'});
    expectTypeOf(hello).toEqualTypeOf<RouteSubRequest<TestServerApi['sayHello']['handler'], 'sayHello', TestServerApi>>();
    expectTypeOf(hello.id).toEqualTypeOf<'sayHello'>();
    expect(hello.id).toBe('sayHello');

    const sum = routes.utils.sumTwo(1);
    expectTypeOf(sum.id).toEqualTypeOf<'utils/sumTwo'>();
    expect(sum.id).toBe('utils/sumTwo');

    const auth = middleFns.auth(new HeadersSubset({Authorization: 'x'}));
    expectTypeOf(auth).toEqualTypeOf<MiddlewareSubRequest<TestServerApi['auth']['handler'], 'auth', TestServerApi>>();
    expect(auth.id).toBe('auth');
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
    expectTypeOf(hello.call).parameter(1).toEqualTypeOf<InjectApiMetadata<TestServerApi, 'sayHello'> | undefined>();
    expectTypeOf(hello.typeErrors).parameter(0).toEqualTypeOf<InjectApiMetadata<TestServerApi, 'sayHello'> | undefined>();
    const auth = middleFns.auth(new HeadersSubset({Authorization: 'x'}));
    expectTypeOf(auth.prefill).parameter(0).toEqualTypeOf<InjectApiMetadata<TestServerApi, 'auth'> | undefined>();
    // a batch names every route it runs, as a union of ids
    const built = batch([hello, routes.utils.sumTwo(1)]);
    expectTypeOf(built.call).parameter(1).toEqualTypeOf<
      InjectApiMetadata<TestServerApi, 'sayHello' | 'utils/sumTwo'> | undefined
    >();
    expectTypeOf<ApiOf<[typeof hello]>>().toEqualTypeOf<TestServerApi>();
    // the anchor: initClient's own slot carries the API and no id
    expectTypeOf(initClient<TestServerApi>).parameter(1).toEqualTypeOf<InjectApiMetadata<TestServerApi> | undefined>();
  });

  it('a helper that erases the route name widens the id to string', () => {
    const run = <PH extends (...args: any[]) => Promise<any>>(sub: RouteSubRequest<PH>) => sub;
    expectTypeOf(run(routes.sayHello({name: 'a', surname: 'b'})).id).toEqualTypeOf<string>();
  });

  it('existing wide uses still compile', () => {
    const anyRoute: RouteSubRequest<any> = routes.sayHello({name: 'a', surname: 'b'});
    const anyMiddleFn: MiddlewareSubRequest<any> = middleFns.auth(new HeadersSubset({Authorization: 'x'}));
    expectTypeOf(anyRoute.id).toEqualTypeOf<string>();
    expectTypeOf(anyMiddleFn.id).toEqualTypeOf<string>();
  });
});
