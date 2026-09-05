/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The crafted-request tests of the security audit: one request per finding, driven through
// dispatchRoute in process. Every assertion here is a contract the sechttp fuzz lane also checks.

import {describe, it, expect, beforeEach} from 'vitest';
import {registerRoutes, resetRouter, initRouter, getAllExecutablesIds} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {decodeQueryBody} from './lib/queryBody.ts';
import {route, middleFn, headersFn} from './lib/handlers.ts';
import {HeadersSubset, MION_BATCH_PATH, MION_ROUTES, RpcError, StatusCodes, toBase64Url} from '@mionjs/core';
import {registerBatches, getBatch} from './batches.ts';

type Tree = {children: Tree[]};
type DatedNode = {date: Date; child?: DatedNode};
type User = {name: string; surname: string};

/** Phrases an engine error carries that must never reach a client. */
const ENGINE_TEXT = [
  /Maximum call stack/,
  /Unexpected token/,
  /is not a function/,
  /Cannot read properties/,
  /DataView/,
  /JSON at position/,
];

function dispatch(path: string, body: string, urlQuery?: string, headers: Record<string, string> = {}) {
  const reqHeaders = headersFromRecord(headers);
  return dispatchRoute(path, body, reqHeaders, headersFromRecord({}), {headers: reqHeaders, body}, {}, undefined, urlQuery);
}

function thrownErrors(response: Awaited<ReturnType<typeof dispatch>>): Record<string, RpcError<string>> {
  return response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;
}

function nested(depth: number): string {
  return '{"children":['.repeat(depth) + '{"children":[]}' + ']}'.repeat(depth);
}

describe('security: request body', () => {
  const echoUser = route((ctx, user: User): User => user);
  const echoTree = route((ctx, tree: Tree): number => tree.children.length);
  const echoDated = route((ctx, node: DatedNode): number => node.date.getTime());

  beforeEach(() => resetRouter());

  it('a malformed JSON body gets a fixed message, never the engine text', async () => {
    await initRouter();
    await registerRoutes({echoUser});
    const response = await dispatch('/echoUser', '{"echoUser": [{"name": "Leo", }');
    const error = thrownErrors(response)['mionDeserializeRequest'];
    expect(error.type).toBe('parsing-json-request-error');
    expect(error.publicMessage).toBe('Invalid json request body.');
    for (const phrase of ENGINE_TEXT) expect(JSON.stringify(response.body)).not.toMatch(phrase);
  });

  it.each(['null', '0', 'false', '""'])('a %s body is refused as a request body', async (body) => {
    await initRouter();
    await registerRoutes({echoUser});
    const response = await dispatch('/echoUser', body);
    expect(thrownErrors(response)['mionDeserializeRequest']?.type).toBe('invalid-request-body');
  });

  it('a body larger than maxBodySize is a 413 before anything is parsed', async () => {
    await initRouter({maxBodySize: 16});
    await registerRoutes({echoUser});
    const response = await dispatch('/echoUser', JSON.stringify({echoUser: [{name: 'Leo', surname: 'Tungsten'}]}));
    expect(response.statusCode).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    const error = thrownErrors(response)['mionDeserializeRequest'];
    expect(error.type).toBe('request-payload-too-large');
    expect(response.headers.get('x-rpc-error')).toBe('request-payload-too-large');
  });

  it('a body inside maxBodySize is dispatched', async () => {
    await initRouter({maxBodySize: 200});
    await registerRoutes({echoUser});
    const response = await dispatch('/echoUser', JSON.stringify({echoUser: [{name: 'Leo', surname: 'Tungsten'}]}));
    expect(response.hasErrors).toBe(false);
  });

  it('a decode failure carries a fixed deserializeError, not the decoder text', async () => {
    await initRouter();
    await registerRoutes({echoDated});
    const response = await dispatch('/echoDated', JSON.stringify({echoDated: [null]}));
    const error = thrownErrors(response)['echoDated'];
    expect(error.type).toBe('serialization-error');
    expect(error.errorData).toEqual({deserializeError: 'Parameters might be of the wrong type.'});
    for (const phrase of ENGINE_TEXT) expect(JSON.stringify(response.body)).not.toMatch(phrase);
  });

  it('a request nested deeper than the validator can walk is a typed error, not an unknown one', async () => {
    await initRouter({maxBodySize: 16_000_000});
    await registerRoutes({echoTree});
    const response = await dispatch('/echoTree', `{"echoTree":[${nested(200_000)}]}`);
    const error = thrownErrors(response)['echoTree'];
    expect(error.type).toBe('request-nesting-too-deep');
    expect(response.statusCode).toBe(StatusCodes.UNEXPECTED_ERROR);
    for (const phrase of ENGINE_TEXT) expect(JSON.stringify(response.body)).not.toMatch(phrase);
  });

  it('a request nested deeper than the decoder can walk is the same typed error', async () => {
    await initRouter({maxBodySize: 16_000_000});
    await registerRoutes({echoDated});
    const depth = 200_000;
    const body =
      '{"date":"2024-01-01T00:00:00.000Z","child":'.repeat(depth) + '{"date":"2024-01-01T00:00:00.000Z"}' + '}'.repeat(depth);
    const response = await dispatch('/echoDated', `{"echoDated":[${body}]}`);
    const error = thrownErrors(response)['echoDated'];
    expect(error.type).toBe('request-nesting-too-deep');
  });

  it('a prototype-named route id in the body is just an unknown entry', async () => {
    await initRouter();
    await registerRoutes({echoUser});
    const response = await dispatch(
      '/echoUser',
      JSON.stringify({constructor: [1], __proto__: {x: 1}, echoUser: [{name: 'a', surname: 'b'}]})
    );
    expect(response.hasErrors).toBe(false);
    expect(response.body.echoUser).toEqual({name: 'a', surname: 'b'});
    expect(({} as any).x).toBeUndefined();
  });
});

describe('security: query body', () => {
  it.each(['data=!', 'data=a', 'data=YQ=', 'data=%%%', 'data=YW..Jj'])(
    '%s is a typed error instead of an atob throw',
    (urlQuery) => {
      let caught: unknown;
      try {
        decodeQueryBody(urlQuery, undefined);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(RpcError);
      expect((caught as RpcError<string>).type).toBe('invalid-query-body');
      expect((caught as RpcError<string>).statusCode).toBe(StatusCodes.UNEXPECTED_ERROR);
    }
  );

  it('a well-formed value still decodes, with or without padding', () => {
    expect(decodeQueryBody(`data=${toBase64Url('{"a":1}')}`, undefined)?.rawBody).toBe('{"a":1}');
    expect(decodeQueryBody('data=eyJhIjoxfQ==', undefined)?.rawBody).toBe('{"a":1}');
  });
});

describe('security: error envelope', () => {
  beforeEach(() => resetRouter());

  it('an app error type with header-breaking characters never reaches the x-rpc-error header', async () => {
    await initRouter();
    const boom = route((ctx): void => {
      throw new RpcError({type: 'bad\r\nx-injected: 1', publicMessage: 'boom'});
    });
    await registerRoutes({boom});
    const response = await dispatch('/boom', '{"boom":[]}');
    expect(response.headers.get('x-rpc-error')).toBe('unknown-error');
    expect(thrownErrors(response)['boom'].type).toBe('bad\r\nx-injected: 1');
  });

  it('a well-formed app error type is the header value', async () => {
    await initRouter();
    const boom = route((ctx): void => {
      throw new RpcError({type: 'my-app:not.found', publicMessage: 'boom'});
    });
    await registerRoutes({boom});
    const response = await dispatch('/boom', '{"boom":[]}');
    expect(response.headers.get('x-rpc-error')).toBe('my-app:not.found');
  });

  it('a headers middleFn only writes its own keys, never inherited ones', async () => {
    await initRouter();
    const poisoned = Object.create({'x-inherited': 'leak'}) as Record<string, string>;
    poisoned['x-own'] = 'ok';
    const setHeaders = headersFn((ctx, h: HeadersSubset<'x-req'>): HeadersSubset<'x-own'> => new HeadersSubset(poisoned as any));
    const hello = route((ctx): string => 'hello');
    await registerRoutes({setHeaders, hello});
    const response = await dispatch('/hello', '{"hello":[]}', undefined, {'x-req': '1'});
    expect(response.headers.get('x-own')).toBe('ok');
    expect(response.headers.get('x-inherited')).toBeUndefined();
  });
});

describe('security: route registration and metadata', () => {
  beforeEach(() => resetRouter());

  it.each(['__proto__', 'constructor', 'prototype'])("refuses '%s' as a route name", async (name) => {
    await initRouter();
    const routes = {dir: {[name]: route((ctx): string => 'x')}};
    await expect(registerRoutes(routes)).rejects.toThrow(`Invalid route: dir/${name}. '${name}' is not a valid route name.`);
  });

  it('the executable id list sees routes registered by a later registerRoutes call', async () => {
    await initRouter();
    await registerRoutes({first: route((ctx): string => 'a')});
    expect(getAllExecutablesIds()).toContain('first');
    await registerRoutes({second: route((ctx): string => 'b')});
    expect(getAllExecutablesIds()).toContain('second');
  });
});

describe('security: batches', () => {
  const routeA = route((ctx): string => 'A');
  const routeB = route((ctx): string => 'B');

  beforeEach(() => resetRouter());

  it('the chains are keyed on the transformed paths, so two tenants never share a chain', async () => {
    await initRouter({
      pathTransform: (req: {headers: {get(name: string): string | null | undefined}}, path: string) =>
        path === '/shared' ? (req.headers.get('x-tenant') === 'a' ? '/routeA' : '/routeB') : path,
    });
    await registerRoutes({routeA, routeB});
    registerBatches({tenantBatch: {routes: ['shared']}});
    const first = await dispatch(MION_BATCH_PATH, '{}', 'id=tenantBatch', {'x-tenant': 'a'});
    const second = await dispatch(MION_BATCH_PATH, '{}', 'id=tenantBatch', {'x-tenant': 'b'});
    expect(first.body.routeA).toBe('A');
    expect(first.body.routeB).toBeUndefined();
    expect(second.body.routeB).toBe('B');
    expect(second.body.routeA).toBeUndefined();
    expect(getBatch('tenantBatch')!.chains.size).toBe(2);
  });

  it('an unknown id is refused before the body is parsed', async () => {
    await initRouter();
    await registerRoutes({routeA});
    // a body that would fail to parse: the id check comes first, so the body is never read
    await expect(dispatch(MION_BATCH_PATH, '{not json', 'id=unknown')).rejects.toMatchObject({
      type: 'batch-unknown-id',
      statusCode: StatusCodes.NOT_FOUND,
    });
  });

  it.each([
    ['junk base64', `id=${toBase64Url('not json')}`],
    ['a prototype name', 'id=__proto__'],
    ['10 KB of A', `id=${'A'.repeat(10_000)}`],
    ['invalid percent-encoding', 'id=%E0%A4%A'],
    ['no id parameter', 'data=abc'],
    ['no query string', undefined],
  ])('a junk id (%s) is batch-unknown-id and keeps the engine text off the wire', async (_label, urlQuery) => {
    await initRouter();
    await registerRoutes({routeA});
    registerBatches({real: {routes: ['routeA']}});
    let caught: any;
    try {
      await dispatch(MION_BATCH_PATH, '{}', urlQuery);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({type: 'batch-unknown-id', statusCode: StatusCodes.NOT_FOUND});
    for (const phrase of ENGINE_TEXT) expect(JSON.stringify(caught)).not.toMatch(phrase);
    expect(JSON.stringify(caught)).not.toMatch(/URI malformed/);
  });

  it('the id is never echoed in the public message', async () => {
    await initRouter();
    await registerRoutes({routeA});
    const id = 'secretTenantBatchId';
    let caught: any;
    try {
      await dispatch(MION_BATCH_PATH, '{}', `id=${id}`);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({type: 'batch-unknown-id'});
    expect(caught.publicMessage).not.toContain(id);
    expect(JSON.stringify(caught)).not.toContain(id);
  });
});

describe('security: middleFn metadata is not access control', () => {
  it('a middleFn with no params and no return is the only thing hidden from the client', async () => {
    resetRouter();
    await initRouter();
    const silent = middleFn((ctx): void => undefined);
    const withParams = middleFn((ctx, token: string): void => undefined);
    await registerRoutes({silent, withParams, open: route((ctx): string => 'x')});
    expect(getAllExecutablesIds()).toEqual(expect.arrayContaining(['silent', 'withParams', 'open']));
  });
});
