/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The adapter half of the security audit: what the node adapter must do BEFORE the router sees a
// request, driven over real sockets. Every case here used to be a crash, a hang or a 500.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createConnection} from 'net';
import type {Server} from 'http';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {MION_ROUTES, StatusCodes} from '@mionjs/core';
import {resetNodeHttpOpts, setNodeHttpOpts, startNodeServer} from './mionHttp.ts';

const mion = createMionRouter({contextDataFactory: () => ({user: null}), basePath: 'api/'});

type SimpleUser = {name: string; surname: string};

const port = 8277;
const MAX_BODY = 64;

const echo = mion.route((ctx: CallContext, user: SimpleUser): SimpleUser => user);
const hasHeader = mion.route((ctx: CallContext, name: string): boolean => ctx.request.headers.has(name));
const listHeaders = mion.route((ctx: CallContext): string[] => {
  ctx.response.headers.set('x-one', '1');
  return [...ctx.response.headers.entries()].map(([name, value]) => `${name}=${value}`);
});
// a per-route limit BELOW the adapter's cap: the read must stop at the route's own number
const small = mion.route((ctx: CallContext, n: number): number => n, {maxBodySize: 40});

/** One raw HTTP exchange: returns the status line and the body text, or 'closed' when the server
 *  hung up before answering. */
function rawRequest(head: string, body: string, delayMs = 0, rawPort?: number): Promise<{status: number; body: string}> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({host: '127.0.0.1', port: rawPort ?? port}, () => {
      socket.write(head);
      setTimeout(() => socket.write(body), delayMs);
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (data += chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0);
      resolve({status, body: data.slice(data.indexOf('\r\n\r\n') + 4)});
    });
    setTimeout(() => socket.destroy(), 2000);
  });
}

function envelope(text: string): Record<string, any> {
  return JSON.parse(text)[MION_ROUTES.thrownErrors];
}

describe('node adapter hardening', () => {
  let server: Server;

  beforeAll(async () => {
    resetNodeHttpOpts();
    resetRouter();
    mion.initRoutes({echo, hasHeader, listHeaders, small});
    setNodeHttpOpts({port, maxBodySize: MAX_BODY});
    server = await startNodeServer();
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('a malformed ?data= query is a typed error, and the process is still here to answer the next request', async () => {
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

  it('a malformed JSON body is a typed error with a fixed message', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/echo`, {method: 'POST', body: '{"echo": [}'});
    expect(response.status).toBe(StatusCodes.UNEXPECTED_ERROR);
    const error = (await response.json())[MION_ROUTES.thrownErrors]['mionDeserializeRequest'];
    expect(error).toMatchObject({type: 'parsing-json-request-error', publicMessage: 'Invalid json request body.'});
  });

  it('a declared content-length past the limit is refused before a body byte is read', async () => {
    const started = performance.now();
    const {status, body} = await rawRequest(
      `POST /api/echo HTTP/1.1\r\nHost: x\r\nContent-Length: 100000\r\nContent-Type: application/json\r\n\r\n`,
      '{"echo":',
      50
    );
    expect(performance.now() - started).toBeLessThan(1500);
    expect(status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    expect(envelope(body)[MION_ROUTES.platformError].type).toBe('request-payload-too-large');
  });

  it('a chunked body that grows past the limit is refused mid-stream and the connection is closed', async () => {
    const chunk = 'x'.repeat(40);
    const chunked = `${chunk.length.toString(16)}\r\n${chunk}\r\n`;
    const {status, body} = await rawRequest(
      `POST /api/echo HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n`,
      chunked + chunked + chunked + '0\r\n\r\n'
    );
    expect(status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    expect(envelope(body)[MION_ROUTES.platformError].type).toBe('request-payload-too-large');
  });

  it('a declared content-length past the ROUTE limit is refused before a body byte is read, under the adapter cap', async () => {
    const {status, body} = await rawRequest(
      `POST /api/small HTTP/1.1\r\nHost: x\r\nContent-Length: 50\r\nContent-Type: application/json\r\n\r\n`,
      '{"small":',
      50
    );
    expect(status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    expect(envelope(body)[MION_ROUTES.platformError].type).toBe('request-payload-too-large');
  });

  it('a chunked body past the ROUTE limit is refused mid-stream, under the adapter cap', async () => {
    const chunk = 'x'.repeat(25);
    const chunked = `${chunk.length.toString(16)}\r\n${chunk}\r\n`;
    const {status, body} = await rawRequest(
      `POST /api/small HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n`,
      chunked + chunked + '0\r\n\r\n'
    );
    expect(status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    expect(envelope(body)[MION_ROUTES.platformError].type).toBe('request-payload-too-large');
  });

  it('a body at the route limit dispatches and one byte over is refused, both under the adapter cap', async () => {
    const valid = '{"small":[7]}';
    const atLimit = valid + ' '.repeat(40 - valid.length);
    const ok = await fetch(`http://127.0.0.1:${port}/api/small`, {method: 'POST', body: atLimit});
    expect(await ok.json()).toEqual({small: 7});
    const over = await fetch(`http://127.0.0.1:${port}/api/small`, {method: 'POST', body: atLimit + ' '});
    expect(over.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
  });

  it('a body inside the limit still dispatches', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/echo`, {
      method: 'POST',
      body: '{"echo":[{"name":"a","surname":"b"}]}',
    });
    expect(await response.json()).toEqual({echo: {name: 'a', surname: 'b'}});
  });

  it.each(['constructor', 'toString', '__proto__'])("has('%s') is false on a request that never sent it", async (name) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/hasHeader`, {
      method: 'POST',
      body: JSON.stringify({hasHeader: [name]}),
    });
    expect(await response.json()).toEqual({hasHeader: false});
  });

  it('response headers can be listed from a handler', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/listHeaders`, {method: 'POST', body: '{"listHeaders":[]}'});
    const body = await response.json();
    expect(body.listHeaders).toEqual(expect.arrayContaining(['x-one=1', 'server=@mionjs']));
  });
});

// An unknown path resolves to the not-found chain, which never reads the body: the 404 goes out
// before the body has even finished arriving, and node drains the rest so the same connection
// serves the next request. Driven over one raw socket so both facts are observable.
describe('node adapter: an unknown path never reads the body', () => {
  const notFoundPort = port + 1;
  let server: Server;

  beforeAll(async () => {
    resetNodeHttpOpts();
    resetRouter();
    mion.initRoutes({echo});
    setNodeHttpOpts({port: notFoundPort, maxBodySize: 1_000_000});
    server = await startNodeServer();
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  /** Writes a request head and a first slice of its body, waits for the full response, then writes
   *  the rest of the body followed by a second request on the SAME socket and waits for that
   *  response too. Answers both status lines. */
  function twoOnOneSocket(head: string, firstSlice: string, rest: string, second: string): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({host: '127.0.0.1', port: notFoundPort}, () => socket.write(head + firstSlice));
      let data = '';
      let phase = 1;
      const statuses: number[] = [];
      socket.setEncoding('utf8');
      socket.on('error', reject);
      socket.on('data', (chunk) => {
        data += chunk;
        // one full response = headers + a body of the declared content-length
        const headerEnd = data.indexOf('\r\n\r\n');
        if (headerEnd < 0) return;
        const length = Number(/content-length: (\d+)/i.exec(data)?.[1] ?? 0);
        if (Buffer.byteLength(data) < headerEnd + 4 + length) return;
        statuses.push(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0));
        data = '';
        if (phase === 1) {
          phase = 2;
          socket.write(rest + second);
        } else {
          socket.destroy();
          resolve([statuses[0], statuses[1]]);
        }
      });
      setTimeout(() => {
        socket.destroy();
        reject(new Error(`timed out after ${statuses.length} response(s)`));
      }, 3000);
    });
  }

  it('answers 404 before the body finishes and serves a second request on the same connection', async () => {
    const body = '{'.padEnd(1000, 'x');
    const [first, second] = await twoOnOneSocket(
      `POST /api/nope HTTP/1.1\r\nHost: x\r\nContent-Length: ${body.length}\r\nContent-Type: application/json\r\n\r\n`,
      body.slice(0, 10),
      body.slice(10),
      `POST /api/echo HTTP/1.1\r\nHost: x\r\nContent-Length: 37\r\nContent-Type: application/json\r\n\r\n{"echo":[{"name":"a","surname":"b"}]}`
    );
    expect(first).toBe(StatusCodes.NOT_FOUND);
    expect(second).toBe(200);
  });

  it('the 404 carries the route-not-found envelope and no parse error for a body that is not JSON', async () => {
    const {status, body} = await rawRequest(
      `POST /api/nope HTTP/1.1\r\nHost: x\r\nContent-Length: 9\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n`,
      '{not json',
      0,
      notFoundPort
    );
    expect(status).toBe(StatusCodes.NOT_FOUND);
    expect(envelope(body)[MION_ROUTES.notFound].type).toBe('route-not-found');
    expect(envelope(body)['mionDeserializeRequest']).toBeUndefined();
  });
});
