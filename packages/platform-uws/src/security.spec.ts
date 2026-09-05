/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The adapter half of the security audit for uws: the query body decode runs inside uWS' native
// callback (a throw there used to take the process down), and header values are written unchecked
// by uWS, so the adapter has to refuse a CR or LF itself.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {MION_ROUTES, StatusCodes} from '@mionjs/core';
import {resetUwsHttpOpts, setUwsHttpOpts, startUwsServer, type UwsServer} from './uwsHttp.ts';

const mion = createMionRouter({contextDataFactory: () => ({user: null}), basePath: 'api/'});

type SimpleUser = {name: string; surname: string};

const port = 8291;

const echo = mion.route((ctx: CallContext, user: SimpleUser): SimpleUser => user);
const reflectHeader = mion.route((ctx: CallContext, value: string): string => {
  ctx.response.headers.set('x-reflected', value);
  return value;
});

describe('uws adapter hardening', () => {
  let server: UwsServer;

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    mion.initRoutes({echo, reflectHeader});
    setUwsHttpOpts({port});
    server = await startUwsServer();
  });

  afterAll(() => server.close());

  it('a malformed ?data= query is a typed error, and the server still answers the next request', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/echo?data=!`);
    expect(response.status).toBe(StatusCodes.UNEXPECTED_ERROR);
    expect(response.headers.get('x-rpc-error')).toBe('invalid-query-body');
    const body = await response.json();
    expect(body[MION_ROUTES.thrownErrors][MION_ROUTES.platformError].type).toBe('invalid-query-body');

    const alive = await fetch(`http://127.0.0.1:${port}/api/echo`, {
      method: 'POST',
      body: '{"echo":[{"name":"a","surname":"b"}]}',
    });
    expect(alive.status).toBe(200);
  });

  it('a header value carrying CR or LF is dropped instead of written into the response', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/reflectHeader`, {
      method: 'POST',
      body: JSON.stringify({reflectHeader: ['ok\r\nx-injected: 1']}),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-injected')).toBeNull();
    expect(response.headers.get('x-reflected')).toBeNull();
    expect(await response.json()).toEqual({reflectHeader: 'ok\r\nx-injected: 1'});
  });

  it('a clean header value is written', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/reflectHeader`, {
      method: 'POST',
      body: JSON.stringify({reflectHeader: ['plain']}),
    });
    expect(response.headers.get('x-reflected')).toBe('plain');
  });

  it('a malformed JSON body is a typed error with a fixed message', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/echo`, {method: 'POST', body: '{"echo": [}'});
    const error = (await response.json())[MION_ROUTES.thrownErrors]['mionDeserializeRequest'];
    expect(error).toMatchObject({type: 'parsing-json-request-error', publicMessage: 'Invalid json request body.'});
  });
});
