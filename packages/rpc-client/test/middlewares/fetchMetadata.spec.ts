/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// useFetchMetadata against the in-process test server, which spreads mionFetchMetadata first in its routes.
// Each block is one row of the resend rules: a call is sent again once at most, and only when it is safe.

import 'fake-indexeddb/auto';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {HeadersSubset, RpcError} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient as initPlainClient} from '../../src/client.ts';
import {initClient} from '../lib/fetchingClient.ts';
import {batch} from '../../src/batch.ts';
import {useFetchMetadata} from '../../src/middlewares/fetchMetadata.ts';
import {MIDDLEWARE_TARGET, getMetadataFetcher} from '../../src/lib/metadataFetcher.ts';
import {HandlersRegistry} from '../../src/lib/handlersRegistry.ts';
import {DEFAULT_CLIENT_OPTIONS} from '../../src/constants.ts';
import type {ClientCallContext} from '../../src/types.ts';
import {resetClientCaches} from '../lib/testUtils.ts';
import {resetMetadataStore} from '../../src/lib/metadataStore.ts';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';

const baseURL = TEST_SERVER_BASE_URL;
const user = {name: 'John', surname: 'Doe'};
const METADATA = 'mionFetchMetadata';

// a body the plain wire form cannot write (JSON.stringify throws) is rare, so it is forced here
const plainBody = vi.hoisted(() => ({fails: false}));
vi.mock('../../src/lib/serializer.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/lib/serializer.ts')>();
  return {
    ...original,
    serializeRequestBody: (...args: Parameters<typeof original.serializeRequestBody>) => {
      if (args[1] && plainBody.fails) throw new TypeError('Do not know how to serialize');
      return original.serializeRequestBody(...args);
    },
  };
});

function watchFetch() {
  const spy = vi.spyOn(globalThis, 'fetch');
  return {
    bodies: () => spy.mock.calls.map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : undefined)),
    restore: () => spy.mockRestore(),
  };
}

function newClient() {
  const initialized = initClient<TestServerApi>({baseURL, storageEngine: 'memory'});
  initialized.middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
  return initialized;
}

describe('useFetchMetadata', () => {
  let watch: ReturnType<typeof watchFetch>;

  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
    watch = watchFetch();
  });

  afterEach(() => {
    watch.restore();
    plainBody.fails = false;
  });

  it('a success is never sent again: one request, and the rows it brought are kept', async () => {
    const {routes} = newClient();
    const [result, , response] = await routes.sayHello(user).call();
    expect(response['@thrownErrors']).toBeUndefined();
    expect(result).toBe('Hello John Doe');
    expect(watch.bodies()).toHaveLength(1);
    // the route and the middlewares an onRequest hook sent along
    expect(watch.bodies()[0][METADATA][0]).toContain('sayHello');
    // known now: the next call is a plain one
    await routes.sayHello(user).call();
    expect(watch.bodies()).toHaveLength(2);
    expect(watch.bodies()[1][METADATA]).toBeUndefined();
  });

  it('an optimistic call the server could not read is sent once more, with the real encoders', async () => {
    const {routes} = newClient();
    // a union mixing a JSON member with a Date needs the `[index, value]` form, which needs the rows
    const [result, error] = await routes.echoStringOrDate(new Date('2024-02-02T02:02:02.000Z')).call();
    expect(error).toBeUndefined();
    expect(result).toBe('2024-02-02T02:02:02.000Z');
    const bodies = watch.bodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].echoStringOrDate).toEqual([[1, '2024-02-02T02:02:02.000Z']]);
  });

  it('a body the plain wire form cannot write fetches the rows first, then sends once', async () => {
    plainBody.fails = true;
    const {routes} = newClient();
    const [result] = await routes.sayHello(user).call();
    expect(result).toBe('Hello John Doe');
    const bodies = watch.bodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0][METADATA][1]).toBe('only');
    expect(bodies[1][METADATA]).toBeUndefined();
  });

  it('once the rows came first, a failure on the wire is never sent again', async () => {
    plainBody.fails = true;
    // with local validation off the wrong value reaches the server, which refuses it
    const {routes, middlewares} = initClient<TestServerApi>({baseURL, storageEngine: 'memory', validateParams: false});
    middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
    const [, error] = await routes.sayHello({name: 1} as any).call();
    expect(error?.type).toBe('validation-error');
    expect(watch.bodies()).toHaveLength(2);
  });

  it("a route's own declared error is never sent again", async () => {
    const {routes} = newClient();
    const [, error] = await routes.alwaysFails(user).call();
    expect(error?.type).toBe('unknown-error');
    expect(watch.bodies()).toHaveLength(1);
  });

  it('a batch where a mutation succeeded is never sent again, even when another route failed on the wire', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL, storageEngine: 'memory'});
    middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
    const [[sum, sumError], [, helloError]] = await batch([routes.utils.sumTwo(1), routes.sayHello({name: 1} as any)]).call();
    expect(sumError).toBeUndefined();
    expect(sum).toBe(3);
    expect(helloError?.type).toBe('validation-error');
    expect(watch.bodies()).toHaveLength(1);
  });

  it('typeErrors() asks for the rows alone and never runs the route it checks', async () => {
    const {routes} = newClient();
    await routes.resetNoteRuns().call();
    expect(await routes.notes.touchNote('a').typeErrors()).toEqual([]);
    // the rows came from a metadata-only request sent to touchNote's own path
    const asked = watch.bodies().find((body) => body?.[METADATA]?.[1] === 'only');
    expect(asked?.[METADATA][0]).toContain('notes/touchNote');
    const [noteRuns] = await routes.noteRuns().call();
    expect(noteRuns!.touchNote).toBe(0);
  });

  it('a network error is never sent again', async () => {
    const {routes} = initClient<TestServerApi>({baseURL: 'http://127.0.0.1:1', storageEngine: 'memory'});
    const [, , response] = await routes.sayHello(user).call();
    expect(response['@thrownErrors']?.length).toBeGreaterThan(0);
    expect(watch.bodies()).toHaveLength(1);
  });
});

describe('a client that never set up useFetchMetadata', () => {
  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });

  it('fails a route it has no rows for with an error naming the fix, and sends nothing', async () => {
    const watch = watchFetch();
    try {
      const {routes} = initPlainClient<TestServerApi>({baseURL, storageEngine: 'memory'});
      const [result, , response] = await routes.sayHello(user).call();
      expect(result).toBeUndefined();
      expect(response['@thrownErrors']?.[0]?.type).toBe('route-metadata-not-found');
      expect(response['@thrownErrors']?.[0]?.publicMessage).toContain('useFetchMetadata');
      expect(watch.bodies()).toHaveLength(0);
    } finally {
      watch.restore();
    }
  });

  it('rejects typeErrors() for such a route the same way', async () => {
    const {routes} = initPlainClient<TestServerApi>({baseURL, storageEngine: 'memory'});
    await expect(routes.sayHello(user).typeErrors()).rejects.toMatchObject({type: 'route-metadata-not-found'});
  });
});

describe('the rows a call carries', () => {
  function startCall() {
    const registry = new HandlersRegistry();
    useFetchMetadata({[MIDDLEWARE_TARGET]: {id: METADATA, registry}} as any);
    const context = {options: {...DEFAULT_CLIENT_OPTIONS, baseURL}, subRequestList: {}} as unknown as ClientCallContext;
    return getMetadataFetcher(registry)!.startCall(context);
  }

  it('leave the body before anything decodes', () => {
    const body: Record<string, unknown> = {sayHello: 'hi', [METADATA]: [0, undefined]};
    expect(startCall().readRows(body)).toBeUndefined();
    expect(body).toEqual({sayHello: 'hi'});
  });

  it('hand a refusal back, for the middleware errors slot', () => {
    // what the wire carries: the error's own JSON
    const refusal = JSON.parse(JSON.stringify(new RpcError({type: 'rpc-metadata-not-found', publicMessage: 'no'})));
    const body: Record<string, unknown> = {[METADATA]: [1, refusal]};
    const putBack = startCall().readRows(body);
    expect(putBack?.[METADATA]).toBeInstanceOf(RpcError);
    expect((putBack?.[METADATA] as RpcError<string>).type).toBe('rpc-metadata-not-found');
  });

  it('a refusal is never a reason to send again', async () => {
    expect(
      await startCall().shouldResend(new Map([[METADATA, new RpcError({type: 'rpc-metadata-not-found', publicMessage: 'no'})]]))
    ).toBe(false);
  });
});

it('the installer takes a middleware from the client, nothing else', () => {
  const {middlewares} = initPlainClient<TestServerApi>({baseURL});
  expect(() => useFetchMetadata(middlewares.mionFetchMetadata)).not.toThrow();
  expect(() => useFetchMetadata({} as any)).toThrow(/middleware from the client/);
});
