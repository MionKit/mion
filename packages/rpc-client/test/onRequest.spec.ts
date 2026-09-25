/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, expectTypeOf, vi, afterEach} from 'vitest';
import {HeadersSubset, RpcError, routesCache} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../src/client.ts';
import {batch} from '../src/batch.ts';
import {purgeHydratedMetadata} from '../src/lib/clientMethodsMetadata.ts';
import {getMetadataStore} from '../src/lib/metadataStore.ts';
import type {CallContext, ClientOptions} from '../src/types.ts';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

const baseURL = TEST_SERVER_BASE_URL;
const user = {name: 'John', surname: 'Doe'};
const authHeaders = new HeadersSubset({Authorization: 'XWYZ-TOKEN'});

async function spyOnFetch(run: () => Promise<void>): Promise<{init: RequestInit; body: any}[]> {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    await run();
    return fetchSpy.mock.calls.map(([, init]) => ({
      init: init as RequestInit,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }));
  } finally {
    fetchSpy.mockRestore();
  }
}

/** Drops what the client learned about these methods, so the next call is an optimistic first call */
async function forgetMetadata(...ids: string[]): Promise<void> {
  const cache = routesCache.getCache();
  ids.forEach((id) => delete cache[id]);
  await purgeHydratedMetadata(ids, {baseURL} as ClientOptions);
  const store = await getMetadataStore();
  await store.remove(
    baseURL,
    ids.map((id) => ['m', id] as ['m', string])
  );
}

describe('middleware onRequest', () => {
  let destroy: (() => void) | undefined;
  afterEach(() => destroy?.());

  function newClient() {
    const initialized = initClient<TestServerApi>({baseURL});
    destroy = () => initialized.client.destroy();
    return initialized;
  }

  it('runs before every request whose chain has the middleware, with the request as context', async () => {
    const {routes, middlewares} = newClient();
    const contexts: CallContext[] = [];
    middlewares.auth.onRequest((auth, context) => {
      contexts.push(context);
      auth(authHeaders);
    });

    for (let i = 0; i < 3; i++) {
      const [greeting, error, undeclared] = await routes.sayHello(user).call();
      expect(undeclared).toBeUndefined();
      expect(error).toBeUndefined();
      expect(greeting).toBe('Hello John Doe');
    }
    const [age] = await routes.calculateAge(2000).call();
    expect(age).toBeGreaterThan(20);

    expect(contexts.map((context) => context.route?.id)).toEqual(['sayHello', 'sayHello', 'sayHello', 'calculateAge']);
    expect(contexts[0].subRequestList.sayHello.params).toEqual([user]);
  });

  it('the context is plain data, with no methods and no retry state', async () => {
    const {routes, middlewares} = newClient();
    const contexts: CallContext[] = [];
    middlewares.auth.onRequest((auth, context) => {
      contexts.push(context);
      auth(authHeaders);
    });

    const [greeting] = await routes.sayHello(user).call();
    expect(greeting).toBe('Hello John Doe');
    const context = contexts[0] as unknown as Record<string, unknown>;
    expect(Object.getPrototypeOf(context)).toBe(Object.prototype);
    expect(Object.values(context).filter((value) => typeof value === 'function')).toEqual([]);
    const retryKeys = ['purgedStaleMetadata', 'retriedAfterMismatch', 'verifying', 'askedRequestHandlers'];
    expect(retryKeys.filter((key) => key in context)).toEqual([]);
  });

  it('runs once per batch, and the context lists the batch routes', async () => {
    // inline: the build reads a batch's routes only from the proxy initClient returns in this file
    const {client, routes, middlewares} = initClient<TestServerApi>({baseURL});
    destroy = () => client.destroy();
    const contexts: CallContext[] = [];
    middlewares.auth.onRequest((auth, context) => {
      contexts.push(context);
      auth(authHeaders);
    });

    const [results, errors, undeclared] = await batch([routes.sayHello(user), routes.utils.sumTwo(1)]).call();
    expect(undeclared).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(results).toEqual(['Hello John Doe', 3]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].route).toBeUndefined();
    expect(contexts[0].batchSubRequests?.map((subRequest) => subRequest.id)).toEqual(['sayHello', 'utils/sumTwo']);
  });

  it('a middleware not in the chain is never asked', async () => {
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    const scopeTag = vi.fn((call: (tag?: string) => void) => call('tagged'));
    middlewares.utils.scopeTag.onRequest(scopeTag);

    const [, , , outside] = await routes.sayHello(user).call();
    expect(scopeTag).not.toHaveBeenCalled();
    expect(outside?.['utils/scopeTag']).toBeUndefined();

    const [sum, , , inside] = await routes.utils.sumTwo(5).call();
    expect(sum).toBe(7);
    expect(scopeTag).toHaveBeenCalledTimes(1);
    expect(inside?.['utils/scopeTag']).toBe('tagged');
  });

  it('not calling `call` sends nothing for that middleware', async () => {
    const {routes, middlewares} = newClient();
    let sendAuth = true;
    middlewares.auth.onRequest((auth) => {
      if (sendAuth) auth(authHeaders);
    });

    const [greeting] = await routes.sayHello(user).call();
    expect(greeting).toBe('Hello John Doe');

    sendAuth = false;
    const [result, routeError, undeclared] = await routes.sayHello(user).call();
    // the server's auth headers check fails, which no route declares
    expect(result).toBeUndefined();
    expect(routeError).toBeUndefined();
    expect(undeclared?.publicMessage).toContain('auth');
  });

  it('calling `call` twice keeps the last params', async () => {
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    middlewares.session.onRequest((session) => {
      session('expired');
      session('valid-token');
    });

    const [, , undeclared, middlewareResults, middlewareErrors] = await routes.sayHello(user).call();
    expect(undeclared).toBeUndefined();
    expect(middlewareErrors).toEqual({});
    expect(middlewareResults?.session).toEqual(expect.objectContaining({userId: 'user-123'}));
  });

  it('a `call` made after the handler finished belongs to no request', async () => {
    const {routes, middlewares} = newClient();
    let lateCall: ((h: HeadersSubset<'Authorization'>) => void) | undefined;
    let isFirst = true;
    middlewares.auth.onRequest((auth) => {
      if (isFirst) auth(authHeaders);
      else lateCall = auth;
      isFirst = false;
    });

    await routes.sayHello(user).call();
    const [, , undeclared] = await routes.sayHello(user).call();
    expect(undeclared?.publicMessage).toContain('auth');
    lateCall?.(authHeaders);
    const [, , stillMissing] = await routes.sayHello(user).call();
    expect(stillMissing?.publicMessage).toContain('auth');
  });

  it('awaits an async handler', async () => {
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest(async (auth) => {
      const token = await new Promise<string>((resolve) => setTimeout(() => resolve('ASYNC-TOKEN'), 5));
      auth(new HeadersSubset({Authorization: token}));
    });
    middlewares.session.onRequest((session) => session('valid-token'));

    const calls = await spyOnFetch(async () => {
      const [greeting, error, undeclared, middlewareResults] = await routes.sayHello(user).call();
      expect(undeclared).toBeUndefined();
      expect(error).toBeUndefined();
      expect(greeting).toBe('Hello John Doe');
      expect(middlewareResults?.session).toEqual(expect.objectContaining({userId: 'user-123'}));
    });
    expect((calls[calls.length - 1].init.headers as Record<string, string>).Authorization).toBe('ASYNC-TOKEN');
  });

  describe('a failing handler stops the request', () => {
    const cases: [string, (auth: (h: HeadersSubset<'Authorization'>) => void) => void | Promise<void>][] = [
      [
        'throws',
        () => {
          throw new Error('no token');
        },
      ],
      ['rejects', () => Promise.reject(new Error('no token'))],
    ];
    for (const [name, handler] of cases) {
      it(`${name}: the error lands in undeclared and nothing is sent`, async () => {
        const {routes, middlewares} = newClient();
        await routes.sayHello(user).typeErrors(); // learn the metadata first, so a fetch can only be the request
        middlewares.auth.onRequest(handler).onError('not-authorized', () => expect.fail('not a declared error'));

        const calls = await spyOnFetch(async () => {
          const [result, routeError, undeclared] = await routes.sayHello(user).call();
          expect(result).toBeUndefined();
          expect(routeError).toBeUndefined();
          expect(undeclared?.type).toBe('middleware-on-request-failed');
          expect(undeclared?.publicMessage).toBe("onRequest for middleware 'auth' failed: no token");
        });
        expect(calls).toHaveLength(0);
      });
    }

    it('a thrown RpcError is kept as is', async () => {
      const {routes, middlewares} = newClient();
      const loggedOut = new RpcError({type: 'logged-out', publicMessage: 'Log in first'});
      middlewares.auth.onRequest(() => {
        throw loggedOut;
      });
      const [, , undeclared] = await routes.sayHello(user).call();
      expect(undeclared).toBe(loggedOut);
    });
  });

  it('onResponse and onError run with the middleware result, which is also in the result slots by id', async () => {
    const {routes, middlewares} = newClient();
    let token = 'valid-token';
    const onResponse = vi.fn();
    const onError = vi.fn();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    middlewares.session
      .onRequest((session) => session(token))
      .onResponse(onResponse)
      .onError('session-expired', onError);

    const [, , , results] = await routes.sayHello(user).call();
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({userId: 'user-123'}),
      expect.objectContaining({retry: expect.any(Function)})
    );
    expect(results?.session).toEqual(expect.objectContaining({userId: 'user-123'}));

    token = 'expired';
    const [, , undeclared, , errors] = await routes.sayHello(user).call();
    expect(undeclared).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(errors?.session?.type).toBe('session-expired');
  });

  it('offRequest and destroy stop the handler', async () => {
    const {client, routes, middlewares} = newClient();
    const handler = vi.fn((auth: (h: HeadersSubset<'Authorization'>) => void) => auth(authHeaders));
    middlewares.auth.onRequest(handler);
    await routes.sayHello(user).call();
    middlewares.auth.offRequest();
    await routes.sayHello(user).call();
    expect(handler).toHaveBeenCalledTimes(1);

    middlewares.auth.onRequest(handler);
    client.destroy();
    await routes.sayHello(user).call();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('the first optimistic call carries the onRequest params and is one round trip', async () => {
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    middlewares.utils.scopeTag.onRequest((scopeTag) => scopeTag('tagged'));
    await forgetMetadata('utils/sumTwo');

    const calls = await spyOnFetch(async () => {
      const [sum, error, undeclared, middlewareResults] = await routes.utils.sumTwo(5).call();
      expect(undeclared).toBeUndefined();
      expect(error).toBeUndefined();
      expect(sum).toBe(7);
      expect(middlewareResults?.['utils/scopeTag']).toBe('tagged');
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body['utils/scopeTag']).toEqual(['tagged']);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('XWYZ-TOKEN');
  });

  it('types: call takes the middleware params and returns void, and the middleware is hooks only', () => {
    const {middlewares} = initClient<TestServerApi>({baseURL: 'http://localhost'});
    middlewares.session.onRequest((session, context) => {
      expectTypeOf(session).parameters.toEqualTypeOf<[sessionToken?: string]>();
      expectTypeOf(session).returns.toEqualTypeOf<void>();
      expectTypeOf(context).toEqualTypeOf<CallContext>();
      // @ts-expect-error wrong param type
      session(123);
    });
    middlewares.auth.onRequest((auth) => {
      // @ts-expect-error a headers middleware takes a HeadersSubset
      auth('XWYZ-TOKEN');
    });
    // @ts-expect-error params are set only through onRequest
    middlewares.session('valid-token');
    expectTypeOf(middlewares.session).toHaveProperty('onResponse');
    expectTypeOf(middlewares.session).not.toHaveProperty('typeErrors' as never);
  });
});
