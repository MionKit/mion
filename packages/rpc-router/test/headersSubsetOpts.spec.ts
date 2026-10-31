/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, getMiddlewareExecutable, getRouteExecutable, resetRouter} from '../src/router.ts';
import {dispatchRoute} from '../src/dispatch.ts';
import {getSerializableMethod} from '../src/lib/remoteMethods.ts';
import type {CallContext} from '../src/types/context.ts';
import type {HeadersMethod, RemoteMethod} from '../src/types/remoteMethods.ts';
import {headersFromRecord} from '../src/lib/headers.ts';
import {HeadersSubset, RpcError} from '@mionjs/core';

const mion = createMionRouter({getPublicRoutesData: true});

describe('HeadersSubset options: cors', () => {
  const routes = {
    auth: mion.headersMiddleware(
      (ctx: CallContext, headers: HeadersSubset<'authorization', 'x-debug', {cors: {'x-debug': false}}>): void => undefined
    ),
    someOff: mion.route(
      (): HeadersSubset<'x-total', 'x-node', {cors: {'x-node': false}}> => new HeadersSubset({'x-total': '3', 'x-node': 'n1'})
    ),
    allOff: mion.route(
      (): HeadersSubset<'x-trace' | 'x-node', never, {cors: false}> => new HeadersSubset({'x-trace': 't', 'x-node': 'n1'})
    ),
    noOpts: mion.route((): HeadersSubset<'x-total'> => new HeadersSubset({'x-total': '3'})),
    inUnion: mion.route((): HeadersSubset<'x-a', never, {cors: false}> | RpcError<'nope'> => new HeadersSubset({'x-a': 'a'})),
  };

  beforeEach(() => {
    resetRouter();
    mion.initRoutes(routes);
  });

  it('reads the names marked off CORS from the type, next to the header names', () => {
    expect(getRouteExecutable('someOff')?.headersReturn).toMatchObject({
      headerNames: ['x-total', 'x-node'],
      corsExcluded: ['x-node'],
    });
    expect(getRouteExecutable('allOff')?.headersReturn?.corsExcluded?.toSorted()).toEqual(['x-node', 'x-trace']);
    expect(getRouteExecutable('noOpts')?.headersReturn?.corsExcluded).toBeUndefined();
    expect(getRouteExecutable('inUnion')?.headersReturn?.corsExcluded).toEqual(['x-a']);
    const auth = getMiddlewareExecutable('auth') as HeadersMethod;
    expect(auth.headersParam).toMatchObject({headerNames: ['authorization', 'x-debug'], corsExcluded: ['x-debug']});
  });

  it('never sets the options at runtime, so the headers still validate and are sent', async () => {
    const response = await dispatchRoute(
      '/someOff',
      JSON.stringify({auth: [], someOff: []}),
      headersFromRecord({authorization: 'token'}),
      headersFromRecord({}),
      {},
      {}
    );
    expect(response.hasErrors).toBe(false);
    expect(response.headers.get('x-node')).toBe('n1');
  });

  it('keeps the CORS marks off the metadata the client downloads', () => {
    expect(getSerializableMethod(getRouteExecutable('someOff') as RemoteMethod).headersReturn).not.toHaveProperty('corsExcluded');
    expect(getSerializableMethod(getMiddlewareExecutable('auth') as RemoteMethod).headersParam).toEqual({
      headerNames: ['authorization', 'x-debug'],
      jitHash: expect.any(String),
    });
  });

  it('refuses a name the subset does not declare, at compile time', () => {
    // @ts-expect-error 'x-typo' is not one of the subset's names
    const typo: HeadersSubset<'x-total', never, {cors: {'x-typo': false}}> | undefined = undefined;
    expect(typo).toBeUndefined();
  });
});
