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
import {createMionRouter, resetRouter, addStartMiddlewares, addEndMiddlewares} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';
import {resetUwsHttpOpts, setUwsHttpOpts, startUwsServer, type UwsServer} from '../src/uwsHttp.ts';
import {createConnection} from 'net';

const mion = createMionRouter({sharedDataFactory: (): {user: null} => ({user: null}), basePath: 'api/'});

type SimpleUser = {name: string; surname: string};

const port = 8291;
type RpcBody = Record<string, unknown> & Record<typeof MION_ROUTES.thrownErrors, Record<string, PublicRpcError<string>>>;

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
    const body = (await response.json()) as RpcBody;
    expect(body[MION_ROUTES.thrownErrors]['mionDeserializeRequest'].type).toBe('invalid-query-body');

    const alive = await fetch(`http://127.0.0.1:${port}/api/echo`, {
      method: 'POST',
      body: '{"echo":[{"name":"a","surname":"b"}]}',
    });
    expect(alive.status).toBe(200);
  });

  it('a header value carrying CR or LF fails the handler instead of being written into the response', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/reflectHeader`, {
      method: 'POST',
      body: JSON.stringify({reflectHeader: ['ok\r\nx-injected: 1']}),
    });
    expect(response.status).toBe(StatusCodes.UNEXPECTED_ERROR);
    expect(response.headers.get('x-injected')).toBeNull();
    expect(response.headers.get('x-reflected')).toBeNull();
    const body = (await response.json()) as RpcBody;
    expect(body[MION_ROUTES.thrownErrors].reflectHeader.type).toBe('unknown-error');
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
    const error = ((await response.json()) as RpcBody)[MION_ROUTES.thrownErrors]['mionDeserializeRequest'];
    expect(error).toMatchObject({type: 'parsing-json-request-error', publicMessage: 'Invalid json request body.'});
  });
});

describe('uws adapter: an unknown path never reads the body', () => {
  const notFoundPort = port + 1;
  let server: UwsServer;

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    mion.initRoutes({echo});
    setUwsHttpOpts({port: notFoundPort});
    server = await startUwsServer();
  });

  afterAll(() => server.close());

  it('answers 404 without parsing a body that is not JSON, and the connection serves the next request', async () => {
    const response = await fetch(`http://127.0.0.1:${notFoundPort}/api/nope`, {method: 'POST', body: '{not json'});
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const body = (await response.json()) as RpcBody;
    expect(body[MION_ROUTES.thrownErrors][MION_ROUTES.notFound].type).toBe('route-not-found');
    expect(body[MION_ROUTES.thrownErrors]['mionDeserializeRequest']).toBeUndefined();

    // a large body on the same kept-alive connection is drained, never assembled
    const big = await fetch(`http://127.0.0.1:${notFoundPort}/api/nope`, {method: 'POST', body: 'x'.repeat(600_000)});
    expect(big.status).toBe(StatusCodes.NOT_FOUND);
    await big.text();

    const alive = await fetch(`http://127.0.0.1:${notFoundPort}/api/echo`, {
      method: 'POST',
      body: '{"echo":[{"name":"a","surname":"b"}]}',
    });
    expect(alive.status).toBe(200);
    expect(await alive.json()).toEqual({echo: {name: 'a', surname: 'b'}});
  });
});

// A body this adapter refuses is still a request the chain sees: it runs the members that declare
// `alwaysRun` and nothing else. A throwing pathTransform is the other half: nothing resolved, so
// there is no chain to run and the bare answer stands.
describe('uws adapter: a refused request', () => {
  const refusedPort = 8295; // 8293 is bodyDrain.spec.ts's
  const transformPort = 8296;
  let seen: string[] = [];

  const withServer = async (setup: () => void, body: () => Promise<void>) => {
    resetUwsHttpOpts();
    resetRouter();
    setup();
    const server = await startUwsServer();
    try {
      await body();
    } finally {
      server.close();
    }
  };

  it('a body past the limit answers 413 through the chain, running only the alwaysRun middlewares', async () => {
    await withServer(
      () => {
        addStartMiddlewares({
          plainStart: mion.rawMiddleware((ctx: CallContext) => {
            seen.push(`start:${ctx.path}`);
          }),
        });
        addEndMiddlewares({
          accessLog: mion.rawMiddleware(
            (ctx: CallContext) => {
              seen.push(`log:${ctx.response.statusCode}`);
            },
            {alwaysRun: true}
          ),
        });
        mion.initRoutes({echo});
        setUwsHttpOpts({port: refusedPort, maxBodySize: 64});
      },
      async () => {
        seen = [];
        const response = await fetch(`http://127.0.0.1:${refusedPort}/api/echo`, {
          method: 'POST',
          body: JSON.stringify({echo: [{name: 'x'.repeat(120), surname: 'y'}]}),
        });
        expect(response.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
        expect(response.headers.get('x-rpc-error')).toBe('request-payload-too-large');
        const body = (await response.json()) as RpcBody;
        expect(body[MION_ROUTES.thrownErrors][MION_ROUTES.platformError].type).toBe('request-payload-too-large');
        expect(seen).toEqual(['log:413']);

        seen = [];
        const alive = await fetch(`http://127.0.0.1:${refusedPort}/api/echo`, {
          method: 'POST',
          body: '{"echo":[{"name":"a","surname":"b"}]}',
        });
        expect(alive.status).toBe(200);
        expect(seen).toEqual(['start:/api/echo', 'log:200']);
      }
    );
  });

  it('a throwing pathTransform answers a big body, and the server serves the next request', async () => {
    await withServer(
      () => {
        createMionRouter({
          basePath: 'api/',
          pathTransform: (_rawRequest, path: string) => {
            if (path.includes('boom')) throw new Error('pathTransform blew up');
            return path;
          },
        }).initRoutes({echo});
        setUwsHttpOpts({port: transformPort});
      },
      async () => {
        const refused = await fetch(`http://127.0.0.1:${transformPort}/api/boom`, {
          method: 'POST',
          body: 'x'.repeat(600_000),
        });
        expect(refused.status).toBe(StatusCodes.SERVER_ERROR);
        await refused.text();

        const alive = await fetch(`http://127.0.0.1:${transformPort}/api/echo`, {
          method: 'POST',
          body: '{"echo":[{"name":"a","surname":"b"}]}',
        });
        expect(alive.status).toBe(200);
        expect(await alive.json()).toEqual({echo: {name: 'a', surname: 'b'}});
      }
    );
  });
});

describe('uws adapter: the HTTP method', () => {
  const methodsPort = 8298;
  let server: UwsServer;

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    mion.initRoutes({readMethod: mion.query((ctx: CallContext): string => ctx.request.method)});
    setUwsHttpOpts({port: methodsPort});
    server = await startUwsServer();
  });

  afterAll(() => server.close());

  it('puts it on the request, uppercase, including one outside the constant map', async () => {
    const url = `http://127.0.0.1:${methodsPort}/api/readMethod`;
    for (const method of ['GET', 'POST', 'PUT'])
      expect(await (await fetch(url, {method, headers: {'content-type': 'application/json'}})).json()).toEqual({
        readMethod: method,
      });
  });
});

// uWS splits the byte stream into requests by its own rules; a proxy in front that reads the framing differently
// would split it elsewhere (request smuggling), so whatever uWS reads loosely the adapter refuses itself.
describe('uws adapter: request and answer framing', () => {
  const framingPort = 8297;
  let server: UwsServer;
  const body = '{"echo":[{"name":"a","surname":"b"}]}';
  const setFraming = mion.route((ctx: CallContext): string => {
    ctx.response.headers.set('transfer-encoding', 'chunked');
    return 'ok';
  });
  const readName = mion.query((ctx: CallContext): string => 'mion');

  /** Every byte the server writes on one connection, until it closes it or goes quiet. */
  function rawExchange(request: string): Promise<{data: string; closed: boolean}> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({host: '127.0.0.1', port: framingPort}, () => socket.write(request));
      let data = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => (data += chunk));
      socket.on('error', reject);
      socket.on('close', () => resolve({data, closed: true}));
      setTimeout(() => {
        socket.destroy();
        resolve({data, closed: false});
      }, 300);
    });
  }
  const post = (framing: string, payload = body) => `POST /api/echo HTTP/1.1\r\nHost: x\r\n${framing}\r\n\r\n${payload}`;
  const chunked = `${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`;

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    mion.initRoutes({echo, setFraming, readName});
    setUwsHttpOpts({port: framingPort});
    server = await startUwsServer();
  });

  afterAll(() => server.close());

  it.each([
    ['two different content-lengths', `Content-Length: 4\r\nContent-Length: ${body.length}`],
    ['an empty content-length', 'Content-Length: '],
  ])('%s is refused with a 400 and the connection closed', async (_, framing) => {
    const {data, closed} = await rawExchange(post(framing));
    expect(data).toMatch(/^HTTP\/1\.1 400 /);
    expect(data).toContain('invalid-request-framing');
    expect(closed).toBe(true);
  });

  it.each([
    ['a coding other than chunked', 'identity'],
    ['a coding uWS cannot decode before chunked', 'gzip, chunked'],
    ['chunked twice', 'chunked, chunked'],
  ])('a transfer-encoding with %s is refused with a 400 and the connection closed', async (_, coding) => {
    const {data, closed} = await rawExchange(post(`Transfer-Encoding: ${coding}`, chunked));
    expect(data).toMatch(/^HTTP\/1\.1 400 /);
    expect(data).toContain('invalid-request-framing');
    expect(closed).toBe(true);
  });

  it('a plain content-length or a chunked body in any letter case still dispatches', async () => {
    for (const request of [
      post(`Content-Length: ${body.length}`),
      post('Transfer-Encoding: chunked', chunked),
      post('Transfer-Encoding: Chunked', chunked),
    ]) {
      const {data} = await rawExchange(request);
      expect(data).toMatch(/^HTTP\/1\.1 200 /);
      expect(data.endsWith('{"echo":{"name":"a","surname":"b"}}')).toBe(true);
    }
  });

  it('a HEAD answer has no body, so the next answer on the connection starts where the client expects it', async () => {
    const head = 'HEAD /api/readName HTTP/1.1\r\nHost: x\r\n\r\n';
    const get = 'GET /api/readName HTTP/1.1\r\nHost: x\r\n\r\n';
    const {data} = await rawExchange(head + get);
    const [headAnswer, getAnswer] = data.split(/(?=HTTP\/1\.1 )/);
    expect(headAnswer).toMatch(/^HTTP\/1\.1 200 /);
    // the length a GET would get, and nothing after the blank line
    expect(headAnswer).toMatch(/content-length: 19\r\n/i);
    expect(headAnswer.endsWith('\r\n\r\n')).toBe(true);
    expect(getAnswer.endsWith('{"readName":"mion"}')).toBe(true);
  });

  it('a transfer-encoding a handler sets is dropped: the answer keeps one framing, its content-length', async () => {
    const {data} = await rawExchange('GET /api/setFraming HTTP/1.1\r\nHost: x\r\n\r\n');
    expect(data).toMatch(/^HTTP\/1\.1 200 /);
    expect(data.toLowerCase()).not.toContain('transfer-encoding');
    expect(data.endsWith('{"setFraming":"ok"}')).toBe(true);
  });
});
