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
import {initRouter, registerRoutes, route, resetRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {MION_ROUTES, StatusCodes} from '@mionjs/core';
import {resetNodeHttpOpts, setNodeHttpOpts, startNodeServer} from './mionHttp.ts';

type SimpleUser = {name: string; surname: string};

const port = 8277;
const MAX_BODY = 64;

const echo = route((ctx: CallContext, user: SimpleUser): SimpleUser => user);
const hasHeader = route((ctx: CallContext, name: string): boolean => ctx.request.headers.has(name));
const listHeaders = route((ctx: CallContext): string[] => {
  ctx.response.headers.set('x-one', '1');
  return [...ctx.response.headers.entries()].map(([name, value]) => `${name}=${value}`);
});

/** One raw HTTP exchange: returns the status line and the body text, or 'closed' when the server
 *  hung up before answering. */
function rawRequest(head: string, body: string, delayMs = 0): Promise<{status: number; body: string}> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({host: '127.0.0.1', port}, () => {
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
    await initRouter({contextDataFactory: () => ({user: null}), basePath: 'api/'});
    await registerRoutes({echo, hasHeader, listHeaders});
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
